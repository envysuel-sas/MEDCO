/**
 * Worker propriétaire de la connexion SQLite (spec §5.5).
 *
 * Le VFS `opfs-sahpool` prend un verrou exclusif : il ne peut y avoir qu'une
 * connexion, dans un seul contexte. Ce Worker est ce contexte. L'UI ne touche
 * jamais la base directement, elle passe par `client.ts`.
 */

/// <reference lib="webworker" />

import * as depots from './depots.js';
import {
  BaseDejaOuverteError,
  installerCatalogue,
  ouvrir,
  reinitialiser,
  versionCatalogue,
} from './sqlite.js';
import {
  verrouConfigure,
  verrouDefinir,
  verrouEstOuvert,
  verrouEtat,
  verrouFermer,
  verrouOuvrir,
} from './verrou.js';

type Methode = keyof typeof api;

const api = {
  ...depots,
  versionCatalogue,
  installerCatalogue: async (octets: Uint8Array) => {
    await installerCatalogue(octets);
  },
  verrouEtat,
  verrouDefinir,
  verrouOuvrir,
  verrouFermer,
  /**
   * Efface tout. Accessible **verrou fermé** : c'est précisément la porte de
   * sortie d'un code oublié. Elle ne donne accès à aucune donnée — elle les
   * détruit.
   */
  reinitialiser: async () => {
    await reinitialiser();
    verrouFermer();
    // La prochaine requête rouvrira une base neuve.
    pret = undefined;
  },
} as const;

/**
 * Méthodes joignables verrou fermé (§15).
 *
 * Le contrôle est **ici**, pas dans l'UI : un écran de saisie qu'on peut
 * contourner en appelant `client.ts` depuis la console ne protège rien. Tout
 * ce qui touche au carnet — profils, produits, prises, plans — passe par cette
 * porte.
 *
 * `installerCatalogue` et `versionCatalogue` restent ouverts : le catalogue est
 * une donnée publique, et son installation doit pouvoir précéder la pose du
 * code au premier lancement.
 */
const HORS_VERROU: ReadonlySet<string> = new Set([
  'versionCatalogue',
  'installerCatalogue',
  'verrouEtat',
  'verrouDefinir',
  'verrouOuvrir',
  'verrouFermer',
  'reinitialiser',
]);

export interface RequeteWorker {
  readonly id: number;
  readonly methode: string;
  readonly args: readonly unknown[];
}

export type ReponseWorker =
  | { readonly id: number; readonly ok: true; readonly valeur: unknown }
  | { readonly id: number; readonly ok: false; readonly erreur: string; readonly code?: string };

let pret: Promise<unknown> | undefined;

self.addEventListener('message', (evenement: MessageEvent<RequeteWorker>) => {
  const { id, methode, args } = evenement.data;
  void traiter(id, methode, args);
});

async function traiter(id: number, methode: string, args: readonly unknown[]): Promise<void> {
  try {
    try {
      pret ??= ouvrir();
      await pret;
    } catch (cause) {
      // Seule une **ouverture** ratée doit pouvoir être retentée. Réinitialiser
      // `pret` sur n'importe quelle erreur applicative rouvrirait la base à
      // chaque refus de verrou, et le VFS refuserait la seconde connexion.
      pret = undefined;
      throw cause;
    }

    const fonction = api[methode as Methode];
    if (typeof fonction !== 'function') throw new Error(`Méthode inconnue : ${methode}`);

    // Tant qu'aucun code n'est posé, rien à garder : le carnet est vide.
    if (!HORS_VERROU.has(methode) && verrouConfigure() && !verrouEstOuvert()) {
      const refus = new Error('Le carnet est verrouillé.');
      refus.name = 'VerrouFerme';
      throw refus;
    }

    const valeur = await (fonction as (...parametres: unknown[]) => unknown)(...args);
    // Les Map ne traversent pas structuredClone côté @sqlite.org : on aplatit.
    self.postMessage({ id, ok: true, valeur: aplatir(valeur) } satisfies ReponseWorker);
  } catch (cause) {
    self.postMessage({
      id,
      ok: false,
      erreur: cause instanceof Error ? cause.message : String(cause),
      ...(cause instanceof BaseDejaOuverteError ? { code: 'BASE_DEJA_OUVERTE' } : {}),
      ...(cause instanceof Error && cause.name === 'VerrouFerme' ? { code: 'VERROU_FERME' } : {}),
    } satisfies ReponseWorker);
  }
}

function aplatir(valeur: unknown): unknown {
  return valeur instanceof Map ? [...valeur.entries()] : valeur;
}
