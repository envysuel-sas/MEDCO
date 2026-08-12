/**
 * Sauvegarde et restauration du carnet (§14.2).
 *
 * Le contrôle porte sur ce qu'une sauvegarde doit garantir et que rien
 * d'autre ne vérifie : qu'elle emporte **tout** le carnet, et qu'un aller-retour
 * le rende à l'identique. Une archive amputée ne se remarque qu'au moment où on
 * en a besoin.
 *
 * La base est un vrai SQLite appliquant le vrai `schema.sql`, clés étrangères
 * activées comme en production. Les lignes insérées sont des identifiants et
 * des dates : aucune composition, aucun dosage n'est fabriqué ici.
 */

import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as {
  DatabaseSync: new (chemin: string) => NodeDb;
};

interface NodeDb {
  prepare(sql: string): { all(...p: unknown[]): unknown[]; run(...p: unknown[]): unknown };
  exec(sql: string): void;
}

const SCHEMA = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');

/**
 * Adaptateur vers l'API de `@sqlite.org/sqlite-wasm` utilisée par `depots.ts`.
 * C'est la seule pièce simulée : les requêtes testées, elles, sont les vraies.
 */
function adapter(db: NodeDb) {
  return {
    exec(requete: string | { sql: string; bind?: unknown[] }) {
      if (typeof requete === 'string') return db.exec(requete);
      return db.prepare(requete.sql).run(...(requete.bind ?? []));
    },
    selectObjects: (sql: string, bind: unknown[] = []) => db.prepare(sql).all(...bind),
    selectValues: (sql: string) => db.prepare(sql).all().map((l) => Object.values(l as object)[0]),
  };
}

let courante: ReturnType<typeof adapter>;
vi.mock('../sqlite.js', () => ({ base: () => courante }));

const { exporterCarnet, restaurerCarnet } = await import('../depots.js');

function carnetPeuple(): NodeDb {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  db.exec('PRAGMA user_version = 2;');

  db.exec(`
    INSERT INTO profil (id, nom, couleur, cree_le)
      VALUES ('pr1', 'Test', NULL, '2026-01-01T09:00:00+01:00');
    INSERT INTO produit (id, profil_id, cis, cip13, element, nom_affiche, mode, dose_defaut, unite, actif, cree_le)
      VALUES ('pd1', 'pr1', '60234100', NULL, NULL, 'DOLIPRANE 1000 mg', 'libre', 1, 'comprimé', 1, '2026-01-01T09:00:00+01:00'),
             ('pd2', 'pr1', NULL, NULL, NULL, 'Produit archivé', 'libre', 1, NULL, 0, '2026-01-02T09:00:00+01:00');
    INSERT INTO prise (id, profil_id, produit_id, occurrence_id, horodatage, fuseau, dose, statut, saisie_le, source)
      VALUES ('ps1', 'pr1', 'pd1', NULL, '2026-01-05T08:00:00+01:00', 'Europe/Paris', 1, 'prise', '2026-01-05T08:00:00+01:00', 'manuelle'),
             ('ps2', 'pr1', 'pd2', NULL, '2025-03-05T08:00:00+01:00', 'Europe/Paris', 1, 'prise', '2025-03-05T08:00:00+01:00', 'manuelle');
    INSERT INTO prise_substance (prise_id, code_substance, quantite_mg, fiabilite, classe)
      VALUES ('ps1', '02202', 1000, 2, 'ANTALGIQUE_SIMPLE');
    INSERT INTO reglage (cle, valeur) VALUES ('theme', 'clair'), ('verrou.preuve', 'SECRET');
  `);
  return db;
}

describe('sauvegarde du carnet', () => {
  it('emporte tout le carnet, sans fenêtre ni filtre d’activité', () => {
    courante = adapter(carnetPeuple());
    const archive = exporterCarnet('2026-08-12T19:00:00+02:00');

    // Une prise vieille de plus d'un an et un produit archivé : ni l'un ni
    // l'autre n'entre dans la fenêtre de travail de l'écran. Les construire
    // depuis l'état de l'UI les aurait perdus en silence.
    expect(archive.tables['prise']).toHaveLength(2);
    expect(archive.tables['produit']).toHaveLength(2);
    expect(archive.tables['prise_substance']).toHaveLength(1);
    expect(archive.version).toBe(2);
  });

  it('laisse le code de déverrouillage hors de l’archive', () => {
    courante = adapter(carnetPeuple());
    const cles = exporterCarnet('2026-08-12T19:00:00+02:00').tables['reglage']?.map((l) => l['cle']);
    expect(cles).toEqual(['theme']);
  });

  it('rend le carnet à l’identique après un aller-retour', () => {
    courante = adapter(carnetPeuple());
    const archive = JSON.parse(
      JSON.stringify(exporterCarnet('2026-08-12T19:00:00+02:00')),
    ) as ReturnType<typeof exporterCarnet>;

    // Restauration sur un appareil neuf, qui porte déjà son propre code.
    const neuf = new DatabaseSync(':memory:');
    neuf.exec('PRAGMA foreign_keys = ON;');
    neuf.exec(SCHEMA);
    neuf.exec('PRAGMA user_version = 2;');
    neuf.exec("INSERT INTO reglage (cle, valeur) VALUES ('verrou.preuve', 'CODE_DU_TELEPHONE');");
    courante = adapter(neuf);

    const bilan = restaurerCarnet(archive);
    expect(bilan.lignes).toBe(7);

    const prises = neuf.prepare('SELECT id, horodatage FROM prise ORDER BY id').all();
    expect(prises).toEqual([
      { id: 'ps1', horodatage: '2026-01-05T08:00:00+01:00' },
      { id: 'ps2', horodatage: '2025-03-05T08:00:00+01:00' },
    ]);
    expect(neuf.prepare('SELECT COUNT(*) c FROM produit').all()).toEqual([{ c: 2 }]);

    // Le code appartient au téléphone, pas à l'archive.
    expect(neuf.prepare("SELECT valeur FROM reglage WHERE cle = 'verrou.preuve'").all()).toEqual([
      { valeur: 'CODE_DU_TELEPHONE' },
    ]);
  });

  it('remplace le carnet au lieu de s’y ajouter', () => {
    courante = adapter(carnetPeuple());
    const archive = exporterCarnet('2026-08-12T19:00:00+02:00');
    // Restaurée deux fois de suite sur la même base : pas de doublon.
    restaurerCarnet(archive);
    restaurerCarnet(archive);
    expect(
      (courante.selectObjects('SELECT COUNT(*) c FROM prise') as { c: number }[])[0]?.c,
    ).toBe(2);
  });

  it('refuse un fichier qui n’est pas une sauvegarde de carnet', () => {
    courante = adapter(carnetPeuple());
    expect(() => restaurerCarnet({ format: 'autre', version: 1, exporteLe: '', tables: {} } as never)).toThrow(
      /pas une sauvegarde/,
    );
  });

  // Restaurer une archive plus récente que le schéma installé écrirait des
  // colonnes qui n'existent pas encore : mieux vaut le dire que le tenter.
  it('refuse une archive venue d’une version plus récente', () => {
    courante = adapter(carnetPeuple());
    const archive = exporterCarnet('2026-08-12T19:00:00+02:00');
    expect(() => restaurerCarnet({ ...archive, version: 99 })).toThrow(/Mettez Medco à jour/);
  });

  // Tout ou rien : un échec en cours de route ne doit pas laisser un carnet
  // à moitié écrasé — c'est le pire résultat possible d'une restauration.
  it('laisse le carnet intact si la restauration échoue en route', () => {
    const db = carnetPeuple();
    courante = adapter(db);
    const archive = exporterCarnet('2026-08-12T19:00:00+02:00');
    const abimee = {
      ...archive,
      tables: { ...archive.tables, prise: [{ id: 'ps3', colonne_inconnue: 1 }] },
    };

    expect(() => restaurerCarnet(abimee as never)).toThrow();
    expect(db.prepare('SELECT COUNT(*) c FROM prise').all()).toEqual([{ c: 2 }]);
    expect(db.prepare('SELECT COUNT(*) c FROM profil').all()).toEqual([{ c: 1 }]);
  });
});
