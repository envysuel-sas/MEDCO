/**
 * Types du domaine. Aucun accès à la base, à l'UI ni à l'horloge (spec §7.5) :
 * l'instant est toujours injecté.
 */

/** ISO 8601 **avec offset local**. Jamais normalisé en UTC (§7.4). */
export type Instant = string;

/** Jour calendaire local, `AAAA-MM-JJ`. */
export type JourLocal = string;

export type CodeSubstance = string;

/** 0 non calculable · 1 dérivé · 2 direct (§6.4). */
export type Fiabilite = 0 | 1 | 2;

/** ⚠ R2 — pilote l'application des règles de fréquence. */
export type Mode = 'prescrit' | 'libre';

/** Première lettre du code ATC, `_` sans ATC (§12.2). */
export type GroupeAtc = 'N' | 'M' | 'A' | 'R' | 'J' | 'C' | 'G' | 'D' | 'B' | 'S' | 'H' | 'L' | 'P' | 'V' | '_';

export type Classe =
  | 'ANTALGIQUE_SIMPLE'
  | 'ANTALGIQUE_ASSOCIATION'
  | 'OPIOIDE'
  | 'TRIPTAN'
  | 'ERGOTAMINE'
  | 'DECONGESTIONNANT_NASAL'
  | 'LAXATIF_STIMULANT'
  | 'AUTRE';

/**
 * Ligne de composition du catalogue.
 *
 * ⚠ `nature` vaut `SA` ou `FT` : la source publie `FT` (fraction
 * thérapeutique) là où la spec écrit `ST`. Seules les lignes `comptee`
 * entrent dans le cumul — une liaison n'en porte jamais plus d'une
 * (voir `pipeline/composition.py`).
 */
export interface LigneComposition {
  readonly cis: string;
  readonly element: string;
  readonly codeSubstance: CodeSubstance;
  readonly nature: 'SA' | 'FT';
  readonly numLiaison: number;
  readonly doseParUnite: number | null;
  readonly fiabilite: Fiabilite;
  readonly dosageBrut: string | null;
  readonly unite: string | null;
  readonly comptee: boolean;
}

export interface Substance {
  readonly code: CodeSubstance;
  readonly nom: string;
  readonly atc: string | null;
  readonly groupeAtc: GroupeAtc;
  readonly classe: Classe;
}

/** Quantité d'une substance apportée par une prise, déjà multipliée par la dose. */
export interface SubstancePrise {
  readonly code: CodeSubstance;
  readonly quantiteMg: number;
  readonly fiabilite: Fiabilite;
  /** Classe de la substance, pour le ciblage des règles. */
  readonly classe: Classe;
}

export interface Produit {
  readonly id: string;
  readonly profilId: string;
  readonly cis: string | null;
  /**
   * Élément pharmaceutique retenu quand la spécialité en porte plusieurs
   * (comprimé *et* gélule, comprimé blanc *et* rose). `null` si la
   * spécialité n'en a qu'un.
   */
  readonly element: string | null;
  readonly nomAffiche: string;
  /** ⚠ R2 — un traitement prescrit est exempté des signaux de fréquence. */
  readonly mode: Mode;
  readonly unite: string | null;
  /** Classe du produit : une association n'est une association qu'au niveau du produit. */
  readonly classe: Classe;
}

export interface PriseAvecSubstances {
  readonly id: string;
  readonly profilId: string;
  readonly produitId: string;
  readonly horodatage: Instant;
  /** Fuseau IANA de la saisie. Sert à l'affichage, jamais à recalculer le jour. */
  readonly fuseau: string;
  readonly dose: number;
  readonly statut: 'prise' | 'annulee';
  readonly substances: readonly SubstancePrise[];
}

export interface CumulSubstance {
  readonly mg: number;
  /** Fiabilité la plus basse ayant contribué : l'UI doit pouvoir le dire. */
  readonly fiabiliteMin: Fiabilite;
  readonly nbPrises: number;
}

export interface Fenetre {
  readonly debut: Instant;
  readonly fin: Instant;
}

// ---------------------------------------------------------------------------
// Pilulier (§9)
// ---------------------------------------------------------------------------

export interface Moment {
  readonly id: string;
  readonly code: string;
  readonly libelle: string;
  /** `HH:MM` locale. */
  readonly heure: string;
  readonly ordre: number;
}

export interface Plan {
  readonly id: string;
  readonly produitId: string;
  readonly profilId: string;
  readonly mode: 'moments' | 'heures' | 'intervalle';
  /** RFC 5545, sous-ensemble documenté dans `occurrences.ts`. */
  readonly rrule: string;
  readonly moments: readonly string[] | null;
  readonly heures: readonly string[] | null;
  readonly intervalleH: number | null;
  readonly dose: number;
  readonly debut: Instant;
  readonly fin: Instant | null;
  readonly rappel: boolean;
}

export type StatutOccurrence = 'attendue' | 'validee' | 'sautee' | 'expiree';

export interface Occurrence {
  readonly id: string;
  readonly planId: string;
  readonly profilId: string;
  readonly prevueLe: Instant;
  readonly momentId: string | null;
  readonly dose: number;
  readonly statut: StatutOccurrence;
  readonly priseId: string | null;
}
