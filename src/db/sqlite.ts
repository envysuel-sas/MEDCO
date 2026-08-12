/**
 * Amorce de la couche base — s'exécute dans un Web Worker dédié.
 *
 * ⚠ Contraintes structurantes (spec §5.5) :
 *  - VFS `opfs-sahpool` obligatoire : le VFS `opfs` par défaut exige les en-têtes
 *    COOP/COEP, que GitHub Pages ne peut pas émettre.
 *  - Pas de transparence du système de fichiers : le bundle catalogue s'installe
 *    par `importDb()`, jamais par écriture d'un fichier à un chemin.
 *  - Une seule connexion à la fois : ce Worker en est le propriétaire exclusif.
 *    Un second onglet doit être détecté et refusé proprement.
 *
 * Ce fichier est une amorce. Les requêtes métier vivent dans /src/domain (code pur,
 * sans accès base) et dans les dépôts de /src/db.
 */

import sqlite3InitModule, { type Sqlite3Static, type Database } from '@sqlite.org/sqlite-wasm';

const NOM_POOL = 'medco';
const CAPACITE_INITIALE = 12; // user.db + catalogue.db + temporaires SQLite

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
  } catch (cause) {
    // Le verrou exclusif du VFS est déjà pris : très probablement un second onglet.
    throw new BaseDejaOuverteError();
  }

  db = new poolUtil.OpfsSAHPoolDb('/user.db');
  await appliquerMigrations(db);
  await attacherCatalogue(db);
  return db;
}

/**
 * Installe ou remplace le bundle catalogue.
 *
 * `importDb()` est le SEUL moyen d'introduire une base pré-construite dans le pool.
 * Un remplacement réutilise le même nom logique ; le ATTACH est refait ensuite.
 */
export async function installerCatalogue(octets: Uint8Array): Promise<void> {
  if (!poolUtil || !db) throw new Error('ouvrir() doit être appelé avant installerCatalogue().');

  db.exec('DETACH DATABASE cat;'); // sans effet si non attaché
  await poolUtil.importDb('/catalogue.db', octets);
  await attacherCatalogue(db);
}

async function attacherCatalogue(base: Database): Promise<void> {
  if (!poolUtil?.getFileNames().includes('/catalogue.db')) return; // premier lancement
  base.exec("ATTACH DATABASE '/catalogue.db' AS cat;");
  base.exec('PRAGMA cat.query_only = 1;');
}

async function appliquerMigrations(base: Database): Promise<void> {
  base.exec('PRAGMA journal_mode = WAL;');
  base.exec('PRAGMA foreign_keys = ON;');
  // TODO(L1) : migrations versionnées depuis /src/db/migrations,
  // schéma complet en spec §5.2.
}

/** Version du catalogue installé, pour l'écran Sources et le pied du relevé PDF. */
export function versionCatalogue(): { version: string; dateBdpm: string } | null {
  if (!db) return null;
  try {
    const lignes = db.selectObjects('SELECT cle, valeur FROM cat.meta;') as Array<{
      cle: string;
      valeur: string;
    }>;
    const m = new Map(lignes.map((l) => [l.cle, l.valeur]));
    const version = m.get('version');
    const dateBdpm = m.get('date_bdpm');
    return version && dateBdpm ? { version, dateBdpm } : null;
  } catch {
    return null; // catalogue non encore installé
  }
}
