/**
 * Installation et mise à jour du catalogue embarqué (spec §5.5, §6.1).
 *
 * ⚠ Le catalogue **ne se remplace pas** par substitution de fichier : le VFS
 * `opfs-sahpool` stocke dans un pool opaque. Le bundle téléchargé passe par
 * `importDb()`, sur le même nom logique.
 *
 * ⚠ L'empreinte vérifiée est celle du **SQLite décompressé**, pas celle du
 * fichier transporté. Un serveur peut poser `Content-Encoding` et laisser
 * `fetch` décompresser de lui-même : on ne sait pas à l'avance ce qui arrive.
 * Sniffer le format reçu et vérifier la base elle-même est la seule méthode
 * qui tienne quel que soit l'hébergement.
 *
 * Une fois installé, le cumul par substance ne dépend plus jamais du réseau.
 */

import { baseDeDonnees } from '../db/client.js';

export interface Manifest {
  readonly version: string;
  /** Bundle Brotli — le plus petit, exploitable derrière un CDN. */
  readonly fichier: string;
  readonly octets: number;
  readonly sha256: string;
  /** Bundle gzip — celui que le navigateur sait décompresser partout. */
  readonly fichier_gzip: string;
  readonly octets_gzip: number;
  readonly sha256_gzip: string;
  /** Empreinte de la base décompressée : la seule vérifiable à coup sûr. */
  readonly sha256_sqlite: string;
  readonly date_bdpm: string;
  readonly nb_specialites: number;
  readonly version_regles: string;
}

export type EtapeInstallation =
  | { readonly etat: 'a-jour'; readonly version: string }
  | { readonly etat: 'telechargement'; readonly recus: number; readonly total: number }
  | { readonly etat: 'installation' }
  | { readonly etat: 'installe'; readonly version: string; readonly dateBdpm: string }
  | { readonly etat: 'echec'; readonly raison: string };

const CHEMIN_MANIFEST = 'bundles/manifest.json';

/** En-tête d'un fichier SQLite : « SQLite format 3\0 ». */
const MAGIE_SQLITE = [0x53, 0x51, 0x4c, 0x69, 0x74, 0x65];
const MAGIE_GZIP = [0x1f, 0x8b];

/**
 * Installe le catalogue si nécessaire.
 *
 * `onEtape` permet à l'UI de montrer la progression : au premier lancement,
 * ce sont deux à trois mégaoctets, souvent en 4G.
 */
export async function installerSiNecessaire(
  base: string,
  onEtape: (etape: EtapeInstallation) => void,
): Promise<void> {
  let manifest: Manifest;
  try {
    const reponse = await fetch(`${base}${CHEMIN_MANIFEST}`, { cache: 'no-cache' });
    if (!reponse.ok) throw new Error(`manifest HTTP ${reponse.status}`);
    manifest = (await reponse.json()) as Manifest;
  } catch (cause) {
    // Hors ligne avec un catalogue déjà installé : ce n'est pas une erreur.
    const installe = await baseDeDonnees.versionCatalogue();
    if (installe) {
      onEtape({ etat: 'a-jour', version: installe.version });
      return;
    }
    onEtape({
      etat: 'echec',
      raison: `Catalogue indisponible : ${cause instanceof Error ? cause.message : String(cause)}`,
    });
    return;
  }

  const installe = await baseDeDonnees.versionCatalogue();
  if (installe?.version === manifest.version) {
    onEtape({ etat: 'a-jour', version: installe.version });
    return;
  }

  try {
    // Brotli n'est décompressable ni par Safari ni par Firefox
    // (`DecompressionStream('br')` n'existe pas) : gzip par défaut, brotli
    // quand le navigateur sait le lire.
    const brotli = brotliDisponible();
    const fichier = brotli ? manifest.fichier : manifest.fichier_gzip;
    const taille = brotli ? manifest.octets : manifest.octets_gzip;

    const recu = await telecharger(`${base}bundles/${fichier}`, taille, onEtape);

    onEtape({ etat: 'installation' });
    const sqlite = await decompresser(recu);

    const empreinte = await sha256(sqlite);
    if (empreinte !== manifest.sha256_sqlite) {
      onEtape({ etat: 'echec', raison: 'Empreinte du catalogue incorrecte, installation refusée.' });
      return;
    }

    await baseDeDonnees.installerCatalogue(sqlite);
    onEtape({ etat: 'installe', version: manifest.version, dateBdpm: manifest.date_bdpm });
  } catch (cause) {
    onEtape({ etat: 'echec', raison: cause instanceof Error ? cause.message : String(cause) });
  }
}

async function telecharger(
  url: string,
  total: number,
  onEtape: (etape: EtapeInstallation) => void,
): Promise<Uint8Array> {
  const reponse = await fetch(url);
  if (!reponse.ok || !reponse.body) {
    throw new Error(`Téléchargement du catalogue : HTTP ${reponse.status}`);
  }

  const morceaux: Uint8Array[] = [];
  let recus = 0;
  const lecteur = reponse.body.getReader();
  for (;;) {
    const { done, value } = await lecteur.read();
    if (done) break;
    morceaux.push(value);
    recus += value.length;
    // `total` est la taille du fichier compressé ; si le serveur a décompressé
    // en chemin, la progression dépasse 100 % — elle reste bornée à l'affichage.
    onEtape({ etat: 'telechargement', recus: Math.min(recus, total), total });
  }

  const assemble = new Uint8Array(recus);
  let position = 0;
  for (const morceau of morceaux) {
    assemble.set(morceau, position);
    position += morceau.length;
  }
  return assemble;
}

/** `DecompressionStream('br')` n'existe pas partout — Safari, Firefox. */
function brotliDisponible(): boolean {
  const Constructeur = (globalThis as { DecompressionStream?: typeof DecompressionStream })
    .DecompressionStream;
  if (!Constructeur) return false;
  try {
    new Constructeur('br' as CompressionFormat);
    return true;
  } catch {
    return false;
  }
}

function commencePar(octets: Uint8Array, magie: readonly number[]): boolean {
  return magie.every((valeur, index) => octets[index] === valeur);
}

/**
 * Décompresse ce qui doit l'être, d'après les octets reçus.
 *
 * Trois cas possibles selon l'hébergement : la base en clair (le serveur a
 * décompressé), du gzip, ou du brotli.
 */
async function decompresser(octets: Uint8Array): Promise<Uint8Array> {
  if (commencePar(octets, MAGIE_SQLITE)) return octets;

  const format: CompressionFormat = commencePar(octets, MAGIE_GZIP)
    ? 'gzip'
    : ('br' as CompressionFormat);

  const flux = new Blob([octets as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream(format));
  return new Uint8Array(await new Response(flux).arrayBuffer());
}

async function sha256(octets: Uint8Array): Promise<string> {
  const empreinte = await crypto.subtle.digest('SHA-256', octets as BufferSource);
  return [...new Uint8Array(empreinte)].map((o) => o.toString(16).padStart(2, '0')).join('');
}
