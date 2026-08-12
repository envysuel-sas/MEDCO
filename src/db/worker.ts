/**
 * Worker propriétaire de la connexion SQLite (spec §5.5).
 *
 * Le VFS `opfs-sahpool` prend un verrou exclusif : il ne peut y avoir qu'une
 * connexion, dans un seul contexte. Ce Worker est ce contexte. L'UI ne touche
 * jamais la base directement, elle passe par `client.ts`.
 */

/// <reference lib="webworker" />

import * as depots from './depots.js';
import { BaseDejaOuverteError, installerCatalogue, ouvrir, versionCatalogue } from './sqlite.js';

type Methode = keyof typeof api;

const api = {
  ...depots,
  versionCatalogue,
  installerCatalogue: async (octets: Uint8Array) => {
    await installerCatalogue(octets);
  },
} as const;

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
    pret ??= ouvrir();
    await pret;

    const fonction = api[methode as Methode];
    if (typeof fonction !== 'function') throw new Error(`Méthode inconnue : ${methode}`);

    const valeur = await (fonction as (...parametres: unknown[]) => unknown)(...args);
    // Les Map ne traversent pas structuredClone côté @sqlite.org : on aplatit.
    self.postMessage({ id, ok: true, valeur: aplatir(valeur) } satisfies ReponseWorker);
  } catch (cause) {
    pret = undefined; // une ouverture ratée doit pouvoir être retentée
    self.postMessage({
      id,
      ok: false,
      erreur: cause instanceof Error ? cause.message : String(cause),
      ...(cause instanceof BaseDejaOuverteError ? { code: 'BASE_DEJA_OUVERTE' } : {}),
    } satisfies ReponseWorker);
  }
}

function aplatir(valeur: unknown): unknown {
  return valeur instanceof Map ? [...valeur.entries()] : valeur;
}
