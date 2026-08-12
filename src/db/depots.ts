/**
 * Dépôts — les seules requêtes SQL de l'application (spec §7.1, §7.3, §9).
 *
 * Le calcul reste dans `/src/domain` : ce fichier lit, écrit, et ne décide de
 * rien. La seule règle métier qu'il porte est celle de §7.1, l'écriture de
 * `prise_substance`, et elle délègue le choix des lignes au domaine.
 */

import type { Database } from '@sqlite.org/sqlite-wasm';

import { substancesPourPrise } from '../domain/cumul.js';
import type {
  Classe,
  CodeSubstance,
  Fiabilite,
  Instant,
  LigneComposition,
  Mode,
  Moment,
  Occurrence,
  Plan,
  PriseAvecSubstances,
  Produit,
  Substance,
} from '../domain/types.js';
import { base } from './sqlite.js';

type Ligne = Record<string, string | number | null | Uint8Array>;

const texte = (ligne: Ligne, cle: string): string => String(ligne[cle] ?? '');
const texteOuNull = (ligne: Ligne, cle: string): string | null =>
  ligne[cle] === null || ligne[cle] === undefined ? null : String(ligne[cle]);
const nombre = (ligne: Ligne, cle: string): number => Number(ligne[cle] ?? 0);

function lire(sql: string, parametres: unknown[] = [], db: Database = base()): Ligne[] {
  return db.selectObjects(sql, parametres as never) as Ligne[];
}

// ---------------------------------------------------------------------------
// Catalogue (lecture seule, base attachée `cat`)
// ---------------------------------------------------------------------------

export interface ResultatRecherche {
  readonly cis: string;
  readonly nom: string;
  readonly forme: string | null;
  readonly substances: string;
  readonly prescription: string | null;
  readonly commercialisee: boolean;
}

/** Recherche plein texte sur le nom et les substances (FTS5, §5.1). */
export function rechercherSpecialites(terme: string, limite = 30): ResultatRecherche[] {
  const requete = terme
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((mot) => `"${mot.replaceAll('"', '')}"*`)
    .join(' ');
  if (!requete) return [];

  // ⚠ L'opérande gauche de `MATCH` doit être le **nom nu** de la table FTS :
  // ni `cat.specialite_fts` (« no such column »), ni un alias (idem). La
  // sous-requête isole cette contrainte et laisse la requête externe lisible.
  return lire(
    `SELECT s.cis, s.nom, s.forme, s.substances, s.prescription, s.commercialisee,
            f.rang
     FROM cat.specialite s
     JOIN (
       SELECT rowid AS ligne, rank AS rang
       FROM cat.specialite_fts
       WHERE specialite_fts MATCH ?1
     ) f ON f.ligne = s.rowid
     ORDER BY s.commercialisee DESC, f.rang
     LIMIT ?2`,
    [requete, limite],
  ).map((l) => ({
    cis: texte(l, 'cis'),
    nom: texte(l, 'nom'),
    forme: texteOuNull(l, 'forme'),
    substances: texte(l, 'substances'),
    prescription: texteOuNull(l, 'prescription'),
    commercialisee: nombre(l, 'commercialisee') === 1,
  }));
}

/** Spécialité correspondant à un CIP13 — utilisé par le scan Datamatrix (§13). */
export function specialiteParCip13(cip13: string): ResultatRecherche | null {
  const [ligne] = lire(
    `SELECT s.cis, s.nom, s.forme, s.substances, s.prescription, s.commercialisee
     FROM cat.presentation p JOIN cat.specialite s ON s.cis = p.cis
     WHERE p.cip13 = ?1`,
    [cip13],
  );
  if (!ligne) return null;
  return {
    cis: texte(ligne, 'cis'),
    nom: texte(ligne, 'nom'),
    forme: texteOuNull(ligne, 'forme'),
    substances: texte(ligne, 'substances'),
    prescription: texteOuNull(ligne, 'prescription'),
    commercialisee: nombre(ligne, 'commercialisee') === 1,
  };
}

export function compositionDe(cis: string): LigneComposition[] {
  return lire(
    `SELECT cis, element, code_substance, nature, num_liaison,
            dose_par_unite, fiabilite, dosage_brut, unite, comptee
     FROM cat.composition WHERE cis = ?1
     ORDER BY element, num_liaison, nature`,
    [cis],
  ).map((l) => ({
    cis: texte(l, 'cis'),
    element: texte(l, 'element'),
    codeSubstance: texte(l, 'code_substance'),
    nature: texte(l, 'nature') as 'SA' | 'FT',
    numLiaison: nombre(l, 'num_liaison'),
    doseParUnite: l['dose_par_unite'] === null ? null : nombre(l, 'dose_par_unite'),
    fiabilite: nombre(l, 'fiabilite') as Fiabilite,
    dosageBrut: texteOuNull(l, 'dosage_brut'),
    unite: texteOuNull(l, 'unite'),
    comptee: nombre(l, 'comptee') === 1,
  }));
}

export function substancesDuCatalogue(codes: readonly CodeSubstance[]): Map<CodeSubstance, Substance> {
  if (codes.length === 0) return new Map();
  const trous = codes.map(() => '?').join(',');
  const lignes = lire(
    `SELECT code, nom, atc, groupe_atc, classe FROM cat.substance WHERE code IN (${trous})`,
    [...codes],
  );
  return new Map(
    lignes.map((l) => [
      texte(l, 'code'),
      {
        code: texte(l, 'code'),
        nom: texte(l, 'nom'),
        atc: texteOuNull(l, 'atc'),
        groupeAtc: (texteOuNull(l, 'groupe_atc') ?? '_') as Substance['groupeAtc'],
        classe: (texteOuNull(l, 'classe') ?? 'AUTRE') as Classe,
      },
    ]),
  );
}

export function classeSpecialite(cis: string): Classe {
  const [ligne] = lire('SELECT classe FROM cat.specialite WHERE cis = ?1', [cis]);
  return (ligne ? texteOuNull(ligne, 'classe') : null) as Classe | null ?? 'AUTRE';
}

// ---------------------------------------------------------------------------
// Profils, produits
// ---------------------------------------------------------------------------

export function produitsActifs(profilId: string): Produit[] {
  return lire(
    `SELECT p.id, p.profil_id, p.cis, p.element, p.nom_affiche, p.mode, p.unite,
            COALESCE(s.classe, 'AUTRE') AS classe
     FROM produit p LEFT JOIN cat.specialite s ON s.cis = p.cis
     WHERE p.profil_id = ?1 AND p.actif = 1
     ORDER BY p.nom_affiche`,
    [profilId],
  ).map(versProduit);
}

function versProduit(l: Ligne): Produit {
  return {
    id: texte(l, 'id'),
    profilId: texte(l, 'profil_id'),
    cis: texteOuNull(l, 'cis'),
    element: texteOuNull(l, 'element'),
    nomAffiche: texte(l, 'nom_affiche'),
    mode: texte(l, 'mode') as Mode,
    unite: texteOuNull(l, 'unite'),
    stock: l['stock'] === null || l['stock'] === undefined ? null : nombre(l, 'stock'),
    classe: (texteOuNull(l, 'classe') ?? 'AUTRE') as Classe,
  };
}

/** Stock restant, saisi par l'aidant (maquette 1h). `null` = non suivi. */
export function definirStock(produitId: string, stock: number | null): void {
  base().exec({ sql: 'UPDATE produit SET stock = ?2 WHERE id = ?1', bind: [produitId, stock] });
}

// ---------------------------------------------------------------------------
// Prises — §7.1
// ---------------------------------------------------------------------------

export interface NouvellePrise {
  readonly id: string;
  readonly profilId: string;
  readonly produitId: string;
  readonly occurrenceId?: string | null;
  readonly horodatage: Instant;
  readonly fuseau: string;
  readonly dose: number;
  readonly saisieLe: Instant;
  readonly source: 'manuelle' | 'push' | 'scan' | 'rattrapage';
}

export interface ResultatEnregistrement {
  readonly substances: number;
  /** Substances écartées du cumul, à annoncer explicitement dans l'UI (§6.4). */
  readonly exclues: { nom: string; dosageBrut: string | null }[];
}

/**
 * Enregistre une prise et sa décomposition en substances (§7.1).
 *
 * ⚠ R1 — la sélection des lignes est déléguée au domaine : seules les lignes
 * `comptee` de l'élément retenu entrent dans `prise_substance`. Une ligne de
 * fiabilité 0 est conservée dans `prise_exclusion` pour que l'écran de la
 * prise puisse dire « cette prise n'entre pas dans le cumul » plutôt que de
 * taire l'absence.
 */
export function enregistrerPrise(nouvelle: NouvellePrise): ResultatEnregistrement {
  const db = base();
  const [produit] = lire(
    `SELECT p.id, p.profil_id, p.cis, p.element, p.nom_affiche, p.mode, p.unite,
            COALESCE(s.classe, 'AUTRE') AS classe
     FROM produit p LEFT JOIN cat.specialite s ON s.cis = p.cis
     WHERE p.id = ?1`,
    [nouvelle.produitId],
  );
  if (!produit) throw new Error(`Produit inconnu : ${nouvelle.produitId}`);

  const cis = texteOuNull(produit, 'cis');
  const lignes = cis ? compositionDe(cis) : compositionLibre(nouvelle.produitId);
  const classes = new Map(
    [...substancesDuCatalogue(lignes.map((l) => l.codeSubstance))].map(([code, s]) => [
      code,
      s.classe,
    ]),
  );
  const { substances, exclues } = substancesPourPrise(
    lignes,
    nouvelle.dose,
    classes,
    texteOuNull(produit, 'element'),
  );

  db.exec('BEGIN;');
  try {
    db.exec({
      sql: `INSERT INTO prise (id, profil_id, produit_id, occurrence_id, horodatage,
                               fuseau, dose, statut, saisie_le, source)
            VALUES (?,?,?,?,?,?,?,'prise',?,?)`,
      bind: [
        nouvelle.id,
        nouvelle.profilId,
        nouvelle.produitId,
        nouvelle.occurrenceId ?? null,
        nouvelle.horodatage,
        nouvelle.fuseau,
        nouvelle.dose,
        nouvelle.saisieLe,
        nouvelle.source,
      ],
    });

    for (const substance of substances) {
      db.exec({
        sql: `INSERT INTO prise_substance (prise_id, code_substance, quantite_mg, fiabilite, classe)
              VALUES (?,?,?,?,?)`,
        bind: [
          nouvelle.id,
          substance.code,
          substance.quantiteMg,
          substance.fiabilite,
          substance.classe,
        ],
      });
    }

    for (const ligne of exclues) {
      db.exec({
        sql: 'INSERT INTO prise_exclusion (prise_id, nom_substance, dosage_brut) VALUES (?,?,?)',
        bind: [nouvelle.id, ligne.codeSubstance, ligne.dosageBrut],
      });
    }
    db.exec('COMMIT;');
  } catch (cause) {
    db.exec('ROLLBACK;');
    throw cause;
  }

  return {
    substances: substances.length,
    exclues: exclues.map((l) => ({ nom: l.codeSubstance, dosageBrut: l.dosageBrut })),
  };
}

function compositionLibre(produitId: string): LigneComposition[] {
  return lire(
    `SELECT code_substance, nom_substance, dose_par_unite, unite
     FROM produit_compo_libre WHERE produit_id = ?1`,
    [produitId],
  ).map((l, index) => ({
    cis: '',
    element: '',
    codeSubstance: texteOuNull(l, 'code_substance') ?? `libre:${texte(l, 'nom_substance')}`,
    nature: 'SA' as const,
    numLiaison: index,
    doseParUnite: nombre(l, 'dose_par_unite'),
    // Une composition saisie à la main est déclarative : jamais « directe ».
    fiabilite: 1 as Fiabilite,
    dosageBrut: null,
    unite: texteOuNull(l, 'unite'),
    comptee: true,
  }));
}

export function annulerPrise(priseId: string): void {
  base().exec({ sql: "UPDATE prise SET statut = 'annulee' WHERE id = ?1", bind: [priseId] });
}

/**
 * Retire définitivement une prise (maquette 2e, « Retirer cette prise »).
 *
 * La maquette est explicite sur l'effet attendu : « Le retrait recalcule le
 * total du jour et la plaquette. Rien n'est conservé en double. » D'où une
 * suppression, et non un simple changement de statut : les lignes de
 * `prise_substance` et `prise_exclusion` partent en cascade.
 */
export function supprimerPrise(priseId: string): void {
  base().exec({ sql: 'DELETE FROM prise WHERE id = ?1', bind: [priseId] });
}

/**
 * Corrige l'heure ou la dose d'une prise déjà enregistrée (maquette 2e).
 *
 * ⚠ R1 — la décomposition en substances n'est **pas** recalculée ici. La prise
 * est supprimée puis réenregistrée par `enregistrerPrise`, seul chemin qui sait
 * choisir la ligne comptée par liaison. Refaire ce calcul à la main ouvrirait
 * la porte au double comptage que R1 interdit.
 *
 * `saisie_le` est conservé : une prise ajoutée après coup le reste, même
 * corrigée. C'est ce que la feuille 2e affiche — « ajoutée le 12 août à 08:40 ».
 */
export function corrigerPrise(
  priseId: string,
  changements: { readonly horodatage?: Instant; readonly dose?: number },
): ResultatEnregistrement {
  const [existante] = lire(
    `SELECT id, profil_id, produit_id, occurrence_id, horodatage, fuseau, dose,
            saisie_le, source
     FROM prise WHERE id = ?1`,
    [priseId],
  );
  if (!existante) throw new Error('Prise introuvable.');

  const reprise: NouvellePrise = {
    id: texte(existante, 'id'),
    profilId: texte(existante, 'profil_id'),
    produitId: texte(existante, 'produit_id'),
    occurrenceId: texteOuNull(existante, 'occurrence_id'),
    horodatage: changements.horodatage ?? texte(existante, 'horodatage'),
    fuseau: texte(existante, 'fuseau'),
    dose: changements.dose ?? nombre(existante, 'dose'),
    saisieLe: texte(existante, 'saisie_le'),
    source: texte(existante, 'source') as NouvellePrise['source'],
  };

  supprimerPrise(priseId);
  return enregistrerPrise(reprise);
}

/** Prises d'un profil sur une période, décomposées, prêtes pour le domaine. */
export function prisesAvecSubstances(
  profilId: string,
  debut: Instant,
  fin: Instant,
): PriseAvecSubstances[] {
  const prises = lire(
    `SELECT id, profil_id, produit_id, horodatage, fuseau, dose, statut, saisie_le
     FROM prise
     WHERE profil_id = ?1 AND horodatage >= ?2 AND horodatage < ?3
     ORDER BY horodatage`,
    [profilId, debut, fin],
  );
  if (prises.length === 0) return [];

  const trous = prises.map(() => '?').join(',');
  const substances = lire(
    `SELECT prise_id, code_substance, quantite_mg, fiabilite, classe
     FROM prise_substance WHERE prise_id IN (${trous})`,
    prises.map((p) => texte(p, 'id')),
  );

  const parPrise = new Map<string, PriseAvecSubstances['substances'][number][]>();
  for (const ligne of substances) {
    const liste = parPrise.get(texte(ligne, 'prise_id')) ?? [];
    liste.push({
      code: texte(ligne, 'code_substance'),
      quantiteMg: nombre(ligne, 'quantite_mg'),
      fiabilite: nombre(ligne, 'fiabilite') as Fiabilite,
      classe: (texteOuNull(ligne, 'classe') ?? 'AUTRE') as Classe,
    });
    parPrise.set(texte(ligne, 'prise_id'), liste);
  }

  return prises.map((p) => ({
    id: texte(p, 'id'),
    profilId: texte(p, 'profil_id'),
    produitId: texte(p, 'produit_id'),
    horodatage: texte(p, 'horodatage'),
    fuseau: texte(p, 'fuseau'),
    dose: nombre(p, 'dose'),
    statut: texte(p, 'statut') as 'prise' | 'annulee',
    saisieLe: texte(p, 'saisie_le'),
    substances: parPrise.get(texte(p, 'id')) ?? [],
  }));
}

// ---------------------------------------------------------------------------
// Pilulier — §9
// ---------------------------------------------------------------------------

export function momentsDuProfil(profilId: string): Map<string, Moment> {
  const lignes = lire(
    'SELECT id, code, libelle, heure, ordre FROM moment WHERE profil_id = ?1 ORDER BY ordre',
    [profilId],
  );
  return new Map(
    lignes.map((l) => [
      texte(l, 'id'),
      {
        id: texte(l, 'id'),
        code: texte(l, 'code'),
        libelle: texte(l, 'libelle'),
        heure: texte(l, 'heure'),
        ordre: nombre(l, 'ordre'),
      },
    ]),
  );
}

export function occurrencesDuJour(profilId: string, jour: string): Occurrence[] {
  return lire(
    `SELECT id, plan_id, profil_id, prevue_le, moment_id, dose, statut, prise_id
     FROM occurrence
     WHERE profil_id = ?1 AND substr(prevue_le, 1, 10) = ?2
     ORDER BY prevue_le`,
    [profilId, jour],
  ).map(versOccurrence);
}

export function occurrencesEntre(profilId: string, debut: Instant, fin: Instant): Occurrence[] {
  return lire(
    `SELECT id, plan_id, profil_id, prevue_le, moment_id, dose, statut, prise_id
     FROM occurrence
     WHERE profil_id = ?1 AND prevue_le >= ?2 AND prevue_le < ?3
     ORDER BY prevue_le`,
    [profilId, debut, fin],
  ).map(versOccurrence);
}

function versOccurrence(l: Ligne): Occurrence {
  return {
    id: texte(l, 'id'),
    planId: texte(l, 'plan_id'),
    profilId: texte(l, 'profil_id'),
    prevueLe: texte(l, 'prevue_le'),
    momentId: texteOuNull(l, 'moment_id'),
    dose: nombre(l, 'dose'),
    statut: texte(l, 'statut') as Occurrence['statut'],
    priseId: texteOuNull(l, 'prise_id'),
  };
}

/** Remplace les occurrences d'un plan par la liste calculée par le domaine. */
export function remplacerOccurrences(planId: string, occurrences: readonly Occurrence[]): void {
  const db = base();
  db.exec('BEGIN;');
  try {
    db.exec({ sql: 'DELETE FROM occurrence WHERE plan_id = ?1', bind: [planId] });
    for (const occurrence of occurrences) {
      db.exec({
        sql: `INSERT INTO occurrence (id, plan_id, profil_id, prevue_le, moment_id, dose, statut, prise_id)
              VALUES (?,?,?,?,?,?,?,?)`,
        bind: [
          occurrence.id,
          occurrence.planId,
          occurrence.profilId,
          occurrence.prevueLe,
          occurrence.momentId,
          occurrence.dose,
          occurrence.statut,
          occurrence.priseId,
        ],
      });
    }
    db.exec('COMMIT;');
  } catch (cause) {
    db.exec('ROLLBACK;');
    throw cause;
  }
}

/**
 * Validation groupée d'un moment (§9.3) : **une seule transaction**.
 * Personne ne fait sept appuis chaque matin.
 */
export function validerOccurrences(
  occurrences: readonly { occurrence: Occurrence; prise: NouvellePrise }[],
): void {
  const db = base();
  db.exec('BEGIN;');
  try {
    for (const { occurrence, prise } of occurrences) {
      enregistrerPriseSansTransaction(prise);
      db.exec({
        sql: "UPDATE occurrence SET statut = 'validee', prise_id = ?2 WHERE id = ?1",
        bind: [occurrence.id, prise.id],
      });
    }
    db.exec('COMMIT;');
  } catch (cause) {
    db.exec('ROLLBACK;');
    throw cause;
  }
}

function enregistrerPriseSansTransaction(nouvelle: NouvellePrise): void {
  // `enregistrerPrise` ouvre sa propre transaction ; SQLite n'en imbrique pas.
  // La validation groupée réutilise donc le corps sans les bornes.
  const db = base();
  const memeTransaction = { ...nouvelle };
  db.exec({
    sql: `INSERT INTO prise (id, profil_id, produit_id, occurrence_id, horodatage,
                             fuseau, dose, statut, saisie_le, source)
          VALUES (?,?,?,?,?,?,?,'prise',?,?)`,
    bind: [
      memeTransaction.id,
      memeTransaction.profilId,
      memeTransaction.produitId,
      memeTransaction.occurrenceId ?? null,
      memeTransaction.horodatage,
      memeTransaction.fuseau,
      memeTransaction.dose,
      memeTransaction.saisieLe,
      memeTransaction.source,
    ],
  });

  const [produit] = lire('SELECT cis, element FROM produit WHERE id = ?1', [nouvelle.produitId]);
  const cis = produit ? texteOuNull(produit, 'cis') : null;
  const lignes = cis ? compositionDe(cis) : compositionLibre(nouvelle.produitId);
  const classes = new Map(
    [...substancesDuCatalogue(lignes.map((l) => l.codeSubstance))].map(([code, s]) => [
      code,
      s.classe,
    ]),
  );
  const { substances, exclues } = substancesPourPrise(
    lignes,
    nouvelle.dose,
    classes,
    produit ? texteOuNull(produit, 'element') : null,
  );

  for (const substance of substances) {
    db.exec({
      sql: `INSERT INTO prise_substance (prise_id, code_substance, quantite_mg, fiabilite, classe)
            VALUES (?,?,?,?,?)`,
      bind: [nouvelle.id, substance.code, substance.quantiteMg, substance.fiabilite, substance.classe],
    });
  }
  for (const ligne of exclues) {
    db.exec({
      sql: 'INSERT INTO prise_exclusion (prise_id, nom_substance, dosage_brut) VALUES (?,?,?)',
      bind: [nouvelle.id, ligne.codeSubstance, ligne.dosageBrut],
    });
  }
}

export function sauterOccurrence(occurrenceId: string): void {
  base().exec({
    sql: "UPDATE occurrence SET statut = 'sautee' WHERE id = ?1",
    bind: [occurrenceId],
  });
}

/** Passage à `expiree` (§9.3). Aucune notification, aucun badge, aucun compteur. */
export function expirerOccurrences(profilId: string, seuil: Instant): void {
  base().exec({
    sql: `UPDATE occurrence SET statut = 'expiree'
          WHERE profil_id = ?1 AND statut = 'attendue' AND prevue_le < ?2`,
    bind: [profilId, seuil],
  });
}

// ---------------------------------------------------------------------------
// Signaux et réglages
// ---------------------------------------------------------------------------

export function acquittements(profilId: string): { regleId: string; valeur: number }[] {
  return lire('SELECT regle_id, valeur FROM signal_vu WHERE profil_id = ?1', [profilId]).map(
    (l) => ({ regleId: texte(l, 'regle_id'), valeur: nombre(l, 'valeur') }),
  );
}

export function acquitter(
  regleId: string,
  profilId: string,
  valeur: number,
  vuLe: Instant,
): void {
  base().exec({
    sql: `INSERT INTO signal_vu (regle_id, profil_id, vu_le, valeur) VALUES (?,?,?,?)
          ON CONFLICT(regle_id, profil_id) DO UPDATE SET vu_le = excluded.vu_le,
                                                          valeur = excluded.valeur`,
    bind: [regleId, profilId, vuLe, valeur],
  });
}

export function reglage(cle: string): string | null {
  const [ligne] = lire('SELECT valeur FROM reglage WHERE cle = ?1', [cle]);
  return ligne ? texteOuNull(ligne, 'valeur') : null;
}

export function definirReglage(cle: string, valeur: string): void {
  base().exec({
    sql: `INSERT INTO reglage (cle, valeur) VALUES (?,?)
          ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur`,
    bind: [cle, valeur],
  });
}

// ---------------------------------------------------------------------------
// Plans — §9.1, §9.2
// ---------------------------------------------------------------------------

export function plansDuProfil(profilId: string): Plan[] {
  return lire(
    `SELECT p.id, p.produit_id, pr.profil_id, p.mode, p.rrule, p.moments, p.heures,
            p.intervalle_h, p.dose, p.debut, p.fin, p.rappel, p.sequence
     FROM plan p JOIN produit pr ON pr.id = p.produit_id
     WHERE pr.profil_id = ?1 AND pr.actif = 1`,
    [profilId],
  ).map((l) => ({
    id: texte(l, 'id'),
    produitId: texte(l, 'produit_id'),
    profilId: texte(l, 'profil_id'),
    mode: texte(l, 'mode') as Plan['mode'],
    rrule: texte(l, 'rrule'),
    moments: JSON.parse(texteOuNull(l, 'moments') ?? 'null') as string[] | null,
    heures: JSON.parse(texteOuNull(l, 'heures') ?? 'null') as string[] | null,
    intervalleH: l['intervalle_h'] === null ? null : nombre(l, 'intervalle_h'),
    dose: nombre(l, 'dose'),
    debut: texte(l, 'debut'),
    fin: texteOuNull(l, 'fin'),
    rappel: nombre(l, 'rappel') === 1,
  }));
}

/**
 * Crée ou remplace un plan. `sequence` est incrémenté à chaque modification :
 * c'est lui que porte le `SEQUENCE` du `.ics`, sans quoi les agendas
 * dupliquent les alarmes au lieu de les mettre à jour (§10.4).
 */
export function enregistrerPlan(plan: Plan): number {
  const db = base();
  const [existant] = lire('SELECT sequence FROM plan WHERE id = ?1', [plan.id]);
  const sequence = existant ? nombre(existant, 'sequence') + 1 : 0;

  db.exec({
    sql: `INSERT INTO plan (id, produit_id, mode, rrule, moments, heures, intervalle_h,
                            dose, debut, fin, rappel, sequence)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(id) DO UPDATE SET
            mode = excluded.mode, rrule = excluded.rrule, moments = excluded.moments,
            heures = excluded.heures, intervalle_h = excluded.intervalle_h,
            dose = excluded.dose, debut = excluded.debut, fin = excluded.fin,
            rappel = excluded.rappel, sequence = excluded.sequence`,
    bind: [
      plan.id,
      plan.produitId,
      plan.mode,
      plan.rrule,
      plan.moments ? JSON.stringify(plan.moments) : null,
      plan.heures ? JSON.stringify(plan.heures) : null,
      plan.intervalleH,
      plan.dose,
      plan.debut,
      plan.fin,
      plan.rappel ? 1 : 0,
      sequence,
    ],
  });
  return sequence;
}

export function sequenceDuPlan(planId: string): number {
  const [ligne] = lire('SELECT sequence FROM plan WHERE id = ?1', [planId]);
  return ligne ? nombre(ligne, 'sequence') : 0;
}

export function supprimerPlan(planId: string): void {
  base().exec({ sql: 'DELETE FROM plan WHERE id = ?1', bind: [planId] });
}

/** Occurrences d'un plan, tous statuts — base de la régénération (§9.1). */
export function occurrencesDuPlan(planId: string): Occurrence[] {
  return lire(
    `SELECT id, plan_id, profil_id, prevue_le, moment_id, dose, statut, prise_id
     FROM occurrence WHERE plan_id = ?1 ORDER BY prevue_le`,
    [planId],
  ).map(versOccurrence);
}

// ---------------------------------------------------------------------------
// Profils, moments et produits — création
// ---------------------------------------------------------------------------

export interface Profil {
  readonly id: string;
  readonly nom: string;
  readonly couleur: string | null;
  readonly creeLe: Instant;
}

export function profils(): Profil[] {
  return lire('SELECT id, nom, couleur, cree_le FROM profil ORDER BY cree_le').map((l) => ({
    id: texte(l, 'id'),
    nom: texte(l, 'nom'),
    couleur: texteOuNull(l, 'couleur'),
    creeLe: texte(l, 'cree_le'),
  }));
}

/**
 * Moments par défaut d'un profil. Les libellés et les heures viennent de la
 * maquette (composant du pilulier, écran 1f) : matin 08:00, midi 12:30,
 * soir 20:00, coucher 22:30.
 */
const MOMENTS_PAR_DEFAUT = [
  { code: 'matin', libelle: 'Matin', heure: '08:00', ordre: 1 },
  { code: 'midi', libelle: 'Midi', heure: '12:30', ordre: 2 },
  { code: 'soir', libelle: 'Soir', heure: '20:00', ordre: 3 },
  { code: 'coucher', libelle: 'Coucher', heure: '22:30', ordre: 4 },
] as const;

export function creerProfil(profil: Profil): void {
  const db = base();
  db.exec('BEGIN;');
  try {
    db.exec({
      sql: 'INSERT INTO profil (id, nom, couleur, cree_le) VALUES (?,?,?,?)',
      bind: [profil.id, profil.nom, profil.couleur, profil.creeLe],
    });
    for (const moment of MOMENTS_PAR_DEFAUT) {
      db.exec({
        sql: 'INSERT INTO moment (id, profil_id, code, libelle, heure, ordre) VALUES (?,?,?,?,?,?)',
        bind: [
          `${profil.id}:${moment.code}`,
          profil.id,
          moment.code,
          moment.libelle,
          moment.heure,
          moment.ordre,
        ],
      });
    }
    db.exec('COMMIT;');
  } catch (cause) {
    db.exec('ROLLBACK;');
    throw cause;
  }
}

export function definirHeureMoment(momentId: string, heure: string): void {
  base().exec({ sql: 'UPDATE moment SET heure = ?2 WHERE id = ?1', bind: [momentId, heure] });
}

export interface NouveauProduit {
  readonly id: string;
  readonly profilId: string;
  readonly cis: string | null;
  readonly cip13: string | null;
  readonly element: string | null;
  readonly nomAffiche: string;
  readonly mode: Mode;
  readonly doseDefaut: number;
  readonly unite: string | null;
  readonly creeLe: Instant;
  /** Composition saisie à la main, pour un produit hors catalogue. */
  readonly compositionLibre?: readonly {
    codeSubstance: string | null;
    nomSubstance: string;
    doseParUnite: number;
    unite: string;
  }[];
}

export function creerProduit(produit: NouveauProduit): void {
  const db = base();
  db.exec('BEGIN;');
  try {
    db.exec({
      sql: `INSERT INTO produit (id, profil_id, cis, cip13, element, nom_affiche, mode,
                                 dose_defaut, unite, actif, cree_le)
            VALUES (?,?,?,?,?,?,?,?,?,1,?)`,
      bind: [
        produit.id,
        produit.profilId,
        produit.cis,
        produit.cip13,
        produit.element,
        produit.nomAffiche,
        produit.mode,
        produit.doseDefaut,
        produit.unite,
        produit.creeLe,
      ],
    });
    for (const ligne of produit.compositionLibre ?? []) {
      db.exec({
        sql: `INSERT INTO produit_compo_libre (produit_id, code_substance, nom_substance,
                                               dose_par_unite, unite)
              VALUES (?,?,?,?,?)`,
        bind: [produit.id, ligne.codeSubstance, ligne.nomSubstance, ligne.doseParUnite, ligne.unite],
      });
    }
    db.exec('COMMIT;');
  } catch (cause) {
    db.exec('ROLLBACK;');
    throw cause;
  }
}

export function produit(produitId: string): Produit | null {
  const [ligne] = lire(
    `SELECT p.id, p.profil_id, p.cis, p.element, p.nom_affiche, p.mode, p.unite,
            COALESCE(s.classe, 'AUTRE') AS classe
     FROM produit p LEFT JOIN cat.specialite s ON s.cis = p.cis
     WHERE p.id = ?1`,
    [produitId],
  );
  return ligne ? versProduit(ligne) : null;
}

export function definirModeProduit(produitId: string, mode: Mode): void {
  // ⚠ R2 — bascule prescrit/libre : elle change l'application des règles de
  // fréquence, jamais celle des règles de dose.
  base().exec({ sql: 'UPDATE produit SET mode = ?2 WHERE id = ?1', bind: [produitId, mode] });
}

export function archiverProduit(produitId: string): void {
  base().exec({ sql: 'UPDATE produit SET actif = 0 WHERE id = ?1', bind: [produitId] });
}

/** Une spécialité du catalogue, pour la fiche produit. */
export function specialite(cis: string): (ResultatRecherche & { titulaire: string | null }) | null {
  const [ligne] = lire(
    `SELECT cis, nom, forme, voies, substances, prescription, commercialisee
     FROM cat.specialite WHERE cis = ?1`,
    [cis],
  );
  if (!ligne) return null;
  return {
    cis: texte(ligne, 'cis'),
    nom: texte(ligne, 'nom'),
    forme: texteOuNull(ligne, 'forme'),
    substances: texte(ligne, 'substances'),
    prescription: texteOuNull(ligne, 'prescription'),
    commercialisee: nombre(ligne, 'commercialisee') === 1,
    titulaire: null,
  };
}

/** Spécialités contenant une substance donnée — écran « fiche substance ». */
export function specialitesAvecSubstance(code: CodeSubstance, limite = 40): ResultatRecherche[] {
  return lire(
    `SELECT DISTINCT s.cis, s.nom, s.forme, s.substances, s.prescription, s.commercialisee
     FROM cat.composition c JOIN cat.specialite s ON s.cis = c.cis
     WHERE c.code_substance = ?1 AND c.comptee = 1
     ORDER BY s.commercialisee DESC, s.nom
     LIMIT ?2`,
    [code, limite],
  ).map((l) => ({
    cis: texte(l, 'cis'),
    nom: texte(l, 'nom'),
    forme: texteOuNull(l, 'forme'),
    substances: texte(l, 'substances'),
    prescription: texteOuNull(l, 'prescription'),
    commercialisee: nombre(l, 'commercialisee') === 1,
  }));
}

export function substanceParCode(code: CodeSubstance): Substance | null {
  return substancesDuCatalogue([code]).get(code) ?? null;
}

/** Toutes les prises d'un profil sur une période, pour le relevé PDF (§14.1). */
export function prisesPourReleve(
  profilId: string,
  debut: Instant,
  fin: Instant,
): PriseAvecSubstances[] {
  return prisesAvecSubstances(profilId, debut, fin);
}
