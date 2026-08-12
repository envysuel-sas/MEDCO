/**
 * Sauvegarde chiffrée (spec §14.2, §15).
 *
 * Argon2id pour dériver la clé d'une phrase de passe, AES-256-GCM pour
 * l'archive. Destination au choix de l'utilisateur, par le sélecteur de
 * fichiers : rien n'est envoyé nulle part.
 *
 * ⚠ **Une phrase de passe perdue rend l'archive irrécupérable.** Aucun
 * mécanisme de récupération n'existe ni ne peut exister : la clé n'est nulle
 * part ailleurs que dans la tête de l'utilisateur. L'avertissement doit être
 * explicite à la création — c'est le risque « perte de phrase de passe » de
 * §19.B, probabilité élevée.
 */

import { argon2id } from 'hash-wasm';

const MAGIE = 'MEDCO1';
const LONGUEUR_SEL = 16;
const LONGUEUR_VECTEUR = 12;

/**
 * Paramètres Argon2id. OWASP recommande, pour argon2id, au moins 19 Mio de
 * mémoire, 2 passes et un parallélisme de 1 ; retenus tels quels, un mobile
 * modeste devant rester capable de déchiffrer.
 */
const ARGON = { memoire: 19 * 1024, iterations: 2, parallelisme: 1, longueurCle: 32 } as const;

export interface Archive {
  readonly octets: Uint8Array;
  readonly nom: string;
}

export async function chiffrerArchive(
  contenu: Uint8Array,
  phraseDePasse: string,
  horodatage: string,
): Promise<Archive> {
  if (phraseDePasse.length < 12) {
    throw new Error('La phrase de passe doit compter au moins douze caractères.');
  }

  const sel = crypto.getRandomValues(new Uint8Array(LONGUEUR_SEL));
  const vecteur = crypto.getRandomValues(new Uint8Array(LONGUEUR_VECTEUR));
  const cle = await deriver(phraseDePasse, sel);

  const chiffre = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: vecteur }, cle, contenu as BufferSource),
  );

  // En-tête en clair : format, sel, vecteur. Rien de sensible.
  const entete = new TextEncoder().encode(MAGIE);
  const octets = new Uint8Array(entete.length + sel.length + vecteur.length + chiffre.length);
  octets.set(entete, 0);
  octets.set(sel, entete.length);
  octets.set(vecteur, entete.length + sel.length);
  octets.set(chiffre, entete.length + sel.length + vecteur.length);

  return { octets, nom: `medco-${horodatage.slice(0, 10)}.medco` };
}

export async function dechiffrerArchive(
  archive: Uint8Array,
  phraseDePasse: string,
): Promise<Uint8Array> {
  const entete = new TextDecoder().decode(archive.slice(0, MAGIE.length));
  if (entete !== MAGIE) throw new Error("Ce fichier n'est pas une archive Medco.");

  const debutSel = MAGIE.length;
  const sel = archive.slice(debutSel, debutSel + LONGUEUR_SEL);
  const vecteur = archive.slice(debutSel + LONGUEUR_SEL, debutSel + LONGUEUR_SEL + LONGUEUR_VECTEUR);
  const chiffre = archive.slice(debutSel + LONGUEUR_SEL + LONGUEUR_VECTEUR);

  const cle = await deriver(phraseDePasse, sel);
  try {
    return new Uint8Array(
      await crypto.subtle.decrypt({ name: 'AES-GCM', iv: vecteur }, cle, chiffre as BufferSource),
    );
  } catch {
    // AES-GCM échoue à l'authentification : phrase de passe fausse ou archive
    // altérée. Les deux cas sont indiscernables, et c'est voulu.
    throw new Error('Phrase de passe incorrecte, ou archive altérée.');
  }
}

async function deriver(phraseDePasse: string, sel: Uint8Array): Promise<CryptoKey> {
  const brut = await argon2id({
    password: phraseDePasse,
    salt: sel,
    memorySize: ARGON.memoire,
    iterations: ARGON.iterations,
    parallelism: ARGON.parallelisme,
    hashLength: ARGON.longueurCle,
    outputType: 'binary',
  });
  return crypto.subtle.importKey('raw', brut as BufferSource, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

/** Enregistrement via le sélecteur de fichiers, avec repli par téléchargement. */
export async function enregistrer(archive: Archive): Promise<void> {
  const fenetre = window as Window & {
    showSaveFilePicker?: (options: unknown) => Promise<{
      createWritable(): Promise<{ write(donnees: Uint8Array): Promise<void>; close(): Promise<void> }>;
    }>;
  };

  if (fenetre.showSaveFilePicker) {
    const fichier = await fenetre.showSaveFilePicker({
      suggestedName: archive.nom,
      types: [{ description: 'Archive Medco', accept: { 'application/octet-stream': ['.medco'] } }],
    });
    const flux = await fichier.createWritable();
    await flux.write(archive.octets);
    await flux.close();
    return;
  }

  // Safari n'expose pas le sélecteur : téléchargement classique.
  const lien = document.createElement('a');
  lien.href = URL.createObjectURL(new Blob([archive.octets as BlobPart]));
  lien.download = archive.nom;
  lien.click();
  URL.revokeObjectURL(lien.href);
}
