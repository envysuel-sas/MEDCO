/**
 * Accès au **vrai** bundle catalogue depuis les tests.
 *
 * Le jeu doré ne s'exécute pas sur des compositions fabriquées : il lit le
 * bundle publié dans `public/bundles`, celui-là même que l'application
 * télécharge. Une composition inventée validerait le code contre lui-même.
 */

import { createRequire } from 'node:module';

// `node:sqlite` n'est pas encore résolu par le bundler de Vitest : on passe
// par `createRequire`, qui laisse Node le charger nativement.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as {
  DatabaseSync: new (chemin: string, options?: { readOnly?: boolean }) => DatabaseSync;
};

interface DatabaseSync {
  prepare(sql: string): { all(...parametres: unknown[]): unknown[]; get(...parametres: unknown[]): unknown };
}
import { brotliDecompressSync } from 'node:zlib';
import { readFileSync, readdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Classe, Fiabilite, GroupeAtc, LigneComposition, Substance } from '../types.js';

const DOSSIER_BUNDLES = new URL('../../../public/bundles/', import.meta.url).pathname;

let base: DatabaseSync | undefined;

export function ouvrirCatalogue(): DatabaseSync {
  if (base) return base;

  const bundle = readdirSync(DOSSIER_BUNDLES).find((nom: string) => nom.endsWith('.sqlite.br'));
  if (!bundle) {
    throw new Error(
      "Aucun bundle dans public/bundles. Lancer `pnpm pipeline` — le jeu doré s'exécute " +
        'sur le catalogue réel, jamais sur des données fabriquées.',
    );
  }
  const octets = brotliDecompressSync(readFileSync(join(DOSSIER_BUNDLES, bundle)));
  const chemin = join(mkdtempSync(join(tmpdir(), 'medco-')), 'catalogue.db');
  writeFileSync(chemin, octets);

  base = new DatabaseSync(chemin, { readOnly: true });
  return base;
}

export function metaCatalogue(): Map<string, string> {
  const lignes = ouvrirCatalogue().prepare('SELECT cle, valeur FROM meta').all() as {
    cle: string;
    valeur: string;
  }[];
  return new Map(lignes.map((l) => [l.cle, l.valeur]));
}

export function nomSpecialite(cis: string): string | null {
  const ligne = ouvrirCatalogue().prepare('SELECT nom FROM specialite WHERE cis = ?').get(cis) as
    | { nom: string }
    | undefined;
  return ligne?.nom ?? null;
}

/** Toutes les lignes de composition d'une spécialité, comptées ou non. */
export function compositionDe(cis: string): LigneComposition[] {
  const lignes = ouvrirCatalogue()
    .prepare(
      `SELECT cis, element, code_substance, nature, num_liaison,
              dose_par_unite, fiabilite, dosage_brut, unite, comptee
       FROM composition WHERE cis = ?
       ORDER BY element, num_liaison, nature`,
    )
    .all(cis) as Record<string, string | number | null>[];

  return lignes.map((l) => ({
    cis: l['cis'] as string,
    element: l['element'] as string,
    codeSubstance: l['code_substance'] as string,
    nature: l['nature'] as 'SA' | 'FT',
    numLiaison: l['num_liaison'] as number,
    doseParUnite: l['dose_par_unite'] as number | null,
    fiabilite: l['fiabilite'] as Fiabilite,
    dosageBrut: l['dosage_brut'] as string | null,
    unite: l['unite'] as string | null,
    comptee: Boolean(l['comptee']),
  }));
}

export function substance(code: string): Substance | null {
  const ligne = ouvrirCatalogue()
    .prepare('SELECT code, nom, atc, groupe_atc, classe FROM substance WHERE code = ?')
    .get(code) as Record<string, string | null> | undefined;
  if (!ligne) return null;
  return {
    code: ligne['code'] as string,
    nom: ligne['nom'] as string,
    atc: ligne['atc'] ?? null,
    groupeAtc: (ligne['groupe_atc'] ?? '_') as GroupeAtc,
    classe: (ligne['classe'] ?? 'AUTRE') as Classe,
  };
}

/** Classe portée par le produit lui-même (une association n'existe qu'à ce niveau). */
export function classeSpecialite(cis: string): Classe {
  const ligne = ouvrirCatalogue().prepare('SELECT classe FROM specialite WHERE cis = ?').get(cis) as
    | { classe: string | null }
    | undefined;
  return (ligne?.classe ?? 'AUTRE') as Classe;
}
