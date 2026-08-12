/**
 * Pont entre l'UI et le Worker propriétaire de la base (spec §5.5).
 *
 * ⚠ Second onglet : le VFS refuse une seconde connexion. Le cas est détecté
 * ici et remonté comme `BaseDejaOuverte`, pour que l'app affiche un écran
 * dédié plutôt qu'une erreur brute.
 */

import type * as depots from './depots.js';
import type { ReponseWorker, RequeteWorker } from './worker.js';

export class BaseDejaOuverte extends Error {
  constructor() {
    super("L'application est déjà ouverte dans un autre onglet.");
    this.name = 'BaseDejaOuverte';
  }
}

type Depots = typeof depots;
type Asynchrone<T> = T extends (...args: infer A) => infer R
  ? (...args: A) => Promise<Awaited<R>>
  : never;

export type ApiBase = { [K in keyof Depots]: Asynchrone<Depots[K]> } & {
  installerCatalogue(octets: Uint8Array): Promise<void>;
  versionCatalogue(): Promise<{ version: string; dateBdpm: string } | null>;
};

const attentes = new Map<number, { resoudre: (v: unknown) => void; rejeter: (e: Error) => void }>();
let worker: Worker | undefined;
let compteur = 0;

function obtenirWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  worker.addEventListener('message', (evenement: MessageEvent<ReponseWorker>) => {
    const reponse = evenement.data;
    const attente = attentes.get(reponse.id);
    if (!attente) return;
    attentes.delete(reponse.id);
    if (reponse.ok) attente.resoudre(reponse.valeur);
    else attente.rejeter(reponse.code === 'BASE_DEJA_OUVERTE' ? new BaseDejaOuverte() : new Error(reponse.erreur));
  });
  return worker;
}

function appeler(methode: string, args: readonly unknown[]): Promise<unknown> {
  const id = (compteur += 1);
  return new Promise((resoudre, rejeter) => {
    attentes.set(id, { resoudre, rejeter });
    obtenirWorker().postMessage({ id, methode, args } satisfies RequeteWorker);
  });
}

/** Toute méthode de `depots.ts`, appelée à travers le Worker. */
export const baseDeDonnees = new Proxy({} as ApiBase, {
  get:
    (_cible, methode: string) =>
    (...args: unknown[]) =>
      appeler(methode, args),
});
