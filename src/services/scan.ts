/**
 * Scan du Datamatrix (spec §13).
 *
 * ⚠ **Écart avec la spec.** §4.1 et §13 proposent `zbar-wasm` comme repli sur
 * Safari. ZBar ne décode **pas** le Datamatrix : il couvre les codes-barres
 * linéaires et le QR, pas l'ECC 200 des boîtes françaises. Le repli retenu est
 * `@zxing/library`, qui embarque un `DataMatrixReader`. Signalé pour arbitrage.
 *
 * ⚠ §13 — le scan est un **confort**. Trois chemins équivalents en permanence :
 * scan, recherche texte, saisie libre. Une caméra refusée ne dégrade aucun
 * parcours ; c'est pourquoi cette fonction retourne un échec explicite plutôt
 * que de lever.
 */

import { lireGs1 } from './gs1.js';
import type { CodeGs1 } from './gs1.js';

export type ResultatScan =
  | { readonly etat: 'trouve'; readonly code: CodeGs1 }
  | { readonly etat: 'camera-refusee' }
  | { readonly etat: 'indisponible' }
  | { readonly etat: 'annule' };

interface DetecteurNatif {
  detect(source: ImageBitmapSource): Promise<{ rawValue: string }[]>;
}

/** `BarcodeDetector` est natif sur Chrome Android, absent de Safari. */
export function detecteurNatifDisponible(): boolean {
  return typeof globalThis !== 'undefined' && 'BarcodeDetector' in globalThis;
}

/**
 * ⚠ Présence n'est pas compétence. `BarcodeDetector` peut exister sans
 * connaître `data_matrix` — selon l'appareil et la version d'Android. Le
 * détecteur retournait alors une liste vide **indéfiniment** : caméra ouverte,
 * aucun résultat, aucune explication. C'est ce que « le scanner ne marche pas
 * du tout » décrit.
 */
async function natifSaitLireDatamatrix(): Promise<boolean> {
  try {
    const Constructeur = (globalThis as unknown as {
      BarcodeDetector: { getSupportedFormats?: () => Promise<string[]> };
    }).BarcodeDetector;
    const formats = (await Constructeur.getSupportedFormats?.()) ?? [];
    return formats.includes('data_matrix');
  } catch {
    return false;
  }
}

/**
 * Ouvre la caméra et rend le premier Datamatrix lisible.
 * `signal` permet d'abandonner : l'utilisateur ferme l'écran de scan.
 */
export async function scanner(video: HTMLVideoElement, signal: AbortSignal): Promise<ResultatScan> {
  let flux: MediaStream;
  try {
    flux = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: false,
    });
  } catch {
    return { etat: 'camera-refusee' };
  }

  video.srcObject = flux;
  await video.play().catch(() => undefined);

  try {
    const natif = detecteurNatifDisponible() && (await natifSaitLireDatamatrix());
    const lire = natif ? await lecteurNatif() : await lecteurDeRepli();
    if (!lire) return { etat: 'indisponible' };

    while (!signal.aborted) {
      const brut = await lire(video);
      if (brut) {
        const code = lireGs1(brut);
        if (code.cip13) return { etat: 'trouve', code };
      }
      await new Promise((resoudre) => setTimeout(resoudre, 150));
    }
    return { etat: 'annule' };
  } finally {
    for (const piste of flux.getTracks()) piste.stop();
    video.srcObject = null;
  }
}

async function lecteurNatif(): Promise<((video: HTMLVideoElement) => Promise<string | null>) | null> {
  const Constructeur = (globalThis as unknown as {
    BarcodeDetector: new (options: { formats: string[] }) => DetecteurNatif;
  }).BarcodeDetector;

  const detecteur = new Constructeur({ formats: ['data_matrix'] });
  return async (video) => {
    const codes = await detecteur.detect(video).catch(() => []);
    return codes[0]?.rawValue ?? null;
  };
}

/**
 * Repli : décodeur chargé à la demande, jamais dans le bundle initial.
 *
 * ⚠ `decodeFromVideoElement` ne rend la main qu'une fois un code trouvé. Il
 * était appelé dans une boucle toutes les 150 ms, ce qui empilait les
 * décodeurs concurrents sur le même flux, et son rejet asynchrone échappait au
 * `try` qui prétendait l'attraper. Une seule tentative est désormais en vol à
 * la fois.
 */
async function lecteurDeRepli(): Promise<((video: HTMLVideoElement) => Promise<string | null>) | null> {
  try {
    const { BrowserDatamatrixCodeReader } = await import('@zxing/library');
    const lecteur = new BrowserDatamatrixCodeReader();
    let enCours: Promise<string | null> | null = null;

    return async (video) => {
      if (enCours) return null;
      enCours = lecteur
        .decodeFromVideoElement(video)
        .then((resultat: { getText: () => string }) => resultat.getText())
        .catch(() => null)
        .finally(() => {
          enCours = null;
        });
      return enCours;
    };
  } catch {
    // Le module de repli n'a pas pu être chargé : hors ligne au premier scan.
    return null;
  }
}
