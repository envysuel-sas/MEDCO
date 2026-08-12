/**
 * Couche base — s'exécute dans un Web Worker dédié (`src/db/worker.ts`).
 *
 * ⚠ Contraintes structurantes (spec §5.5) :
 *  - VFS `opfs-sahpool` obligatoire : le VFS `opfs` par défaut exige les
 *    en-têtes COOP/COEP, que GitHub Pages ne peut pas émettre.
 *  - Pas de transparence du système de fichiers : le bundle catalogue
 *    s'installe par `importDb()`, jamais par écriture à un chemin.
 *  - Une seule connexion à la fois : ce Worker en est le propriétaire
 *    exclusif. Un second onglet est détecté et refusé proprement.
 *
 * Les requêtes métier vivent dans `/src/db/depots.ts` et le calcul dans
 * `/src/domain` (code pur, sans accès base).
 */

import sqlite3InitModule, { type Sqlite3Static, type Database } from '@sqlite.org/sqlite-wasm';

import schema from './schema.sql?raw';

const NOM_POOL = 'medco';
/** user.db + catalogue.db + journaux et fichiers temporaires de SQLite. */
const CAPACITE_INITIALE = 12;
const CHEMIN_USER = '/user.db';
const CHEMIN_CATALOGUE = '/catalogue.db';

let sqlite3: Sqlite3Static | undefined;
let poolUtil: Awaited<ReturnType<Sqlite3Static['installOpfsSAHPoolVfs']>> | undefined;
let db: Database | undefined;

export class BaseDejaOuverteError extends Error {
  constructor() {
    super("L'application est déjà ouverte dans un autre onglet.");
    this.name = 'BaseDejaOuverteError';
  }
}

export async function ouvrir(): Promise<Database> {
  if (db) return db;

  sqlite3 = await sqlite3InitModule();

  try {
    poolUtil = await sqlite3.installOpfsSAHPoolVfs({
      name: NOM_POOL,
      initialCapacity: CAPACITE_INITIALE,
    });
  } catch {
    // Le verrou exclusif du VFS est déjà pris : très probablement un second
    // onglet. L'UI affiche un écran dédié plutôt qu'une erreur brute (§5.5).
    throw new BaseDejaOuverteError();
  }

  db = new poolUtil.OpfsSAHPoolDb(CHEMIN_USER);
  appliquerMigrations(db);
  attacherCatalogue(db);
  return db;
}

export function base(): Database {
  if (!db) throw new Error('ouvrir() doit être appelé avant toute requête.');
  return db;
}

/**
 * Installe ou remplace le bundle catalogue.
 *
 * `importDb()` est le SEUL moyen d'introduire une base pré-construite dans le
 * pool : le VFS ne donne pas accès aux fichiers par leur chemin (§5.5). Un
 * remplacement réutilise le même nom logique, le ATTACH est refait ensuite.
 */
export async function installerCatalogue(octets: Uint8Array): Promise<void> {
  if (!poolUtil || !db) throw new Error('ouvrir() doit être appelé avant installerCatalogue().');

  try {
    db.exec('DETACH DATABASE cat;');
  } catch {
    // Pas encore attaché : rien à détacher.
  }
  await poolUtil.importDb(CHEMIN_CATALOGUE, octets);
  attacherCatalogue(db);
}

export function catalogueInstalle(): boolean {
  return poolUtil?.getFileNames().includes(CHEMIN_CATALOGUE) ?? false;
}

function attacherCatalogue(cible: Database): void {
  if (!catalogueInstalle()) return; // premier lancement
  // Une seule connexion, deux fichiers attachés — jamais deux connexions (§5.3).
  cible.exec(`ATTACH DATABASE '${CHEMIN_CATALOGUE}' AS cat;`);
  cible.exec('PRAGMA cat.query_only = 1;');
}

/** Migrations versionnées. `user_version` porte le numéro appliqué. */
const MIGRATIONS: readonly string[] = [schema];

function appliquerMigrations(cible: Database): void {
  cible.exec('PRAGMA journal_mode = WAL;');
  cible.exec('PRAGMA foreign_keys = ON;');

  const [version = 0] = cible.selectValues('PRAGMA user_version;') as number[];
  for (let index = version; index < MIGRATIONS.length; index += 1) {
    cible.exec('BEGIN;');
    try {
      cible.exec(MIGRATIONS[index]!);
      cible.exec(`PRAGMA user_version = ${index + 1};`);
      cible.exec('COMMIT;');
    } catch (cause) {
      cible.exec('ROLLBACK;');
      throw cause;
    }
  }
}

/** Version du catalogue installé, pour l'écran Sources et le pied du relevé PDF. */
export function versionCatalogue(): { version: string; dateBdpm: string } | null {
  if (!db || !catalogueInstalle()) return null;
  try {
    const lignes = db.selectObjects('SELECT cle, valeur FROM cat.meta;') as {
      cle: string;
      valeur: string;
    }[];
    const meta = new Map(lignes.map((l) => [l.cle, l.valeur]));
    const version = meta.get('version');
    const dateBdpm = meta.get('date_bdpm');
    return version && dateBdpm ? { version, dateBdpm } : null;
  } catch {
    return null;
  }
}
