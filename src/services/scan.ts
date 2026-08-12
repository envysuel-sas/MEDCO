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
    const lire = detecteurNatifDisponible() ? await lecteurNatif() : await lecteurDeRepli();
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

/** Repli Safari : décodeur chargé à la demande, jamais dans le bundle initial. */
async function lecteurDeRepli(): Promise<((video: HTMLVideoElement) => Promise<string | null>) | null> {
  const { BrowserDatamatrixCodeReader } = await import('@zxing/library');
  const lecteur = new BrowserDatamatrixCodeReader();
  return async (video) => {
    try {
      return lecteur.decodeFromVideoElement(video).then((resultat) => resultat.getText());
    } catch {
      return null;
    }
  };
}
