/**
 * Moteur de règles — module pur (spec §8).
 *
 * ⚠ R3 — restituer, pas conclure. Un `Signal` porte trois choses et rien de
 * plus : le chiffre de l'utilisateur, le repère publié cité mot pour mot, et
 * la source datée. Aucun score, aucun taux, aucune phrase de liaison. Le mot
 * est « repère », jamais « limite » ni « maximum » (§12.3).
 *
 * ⚠ R2 — `duree_consecutive` et `jours_de_prise` ne s'évaluent que sur des
 * produits `libre`. C'est vérifié deux fois : le validateur **rejette** le
 * bundle si une telle règle inclut `prescrit` (§8.2), et l'évaluation filtre
 * les prises sur le mode du produit.
 *
 * Il n'existe **aucun opérateur de croisement inter-produits** : c'est ce qui
 * empêche structurellement une dérive vers l'analyse d'interactions (§8.2).
 */

import { dansLaFenetre, joursDePrise, quantiteDe } from './cumul.js';
import { HEURE, ajouterJours, dureeMs, epoch, jourLocal } from './temps.js';
import type {
  Classe,
  CodeSubstance,
  Instant,
  Mode,
  PriseAvecSubstances,
  Produit,
} from './types.js';

export type TypeRegle =
  | 'cumul_fenetre'
  | 'dose_unitaire'
  | 'intervalle_min'
  | 'duree_consecutive'
  | 'jours_de_prise';

export type Niveau = 'information' | 'vigilance' | 'attention';

/** Types dont R2 interdit l'évaluation sur un traitement prescrit. */
const TYPES_FREQUENCE: ReadonlySet<TypeRegle> = new Set(['duree_consecutive', 'jours_de_prise']);

const TYPES_CONNUS: ReadonlySet<string> = new Set<TypeRegle>([
  'cumul_fenetre',
  'dose_unitaire',
  'intervalle_min',
  'duree_consecutive',
  'jours_de_prise',
]);

const MODES_CONNUS: ReadonlySet<string> = new Set<Mode>(['prescrit', 'libre']);
const NIVEAUX_CONNUS: ReadonlySet<string> = new Set<Niveau>([
  'information',
  'vigilance',
  'attention',
]);
const CLES_CIBLE: ReadonlySet<string> = new Set(['substances', 'classes', 'libelle']);

export interface Source {
  readonly libelle: string;
  readonly url: string;
  readonly consulte_le: string;
}

export interface Cible {
  readonly substances?: readonly CodeSubstance[];
  readonly classes?: readonly Classe[];
  readonly libelle?: string;
}

export interface Regle {
  readonly id: string;
  readonly type: TypeRegle;
  readonly cible: Cible;
  readonly mode: readonly Mode[];
  readonly fenetre?: string;
  readonly seuil: number;
  readonly unite: string;
  readonly niveau: Niveau;
  readonly message: string;
  /** Texte exact de la source. C'est lui que l'UI affiche, jamais une reformulation. */
  readonly citation: string;
  readonly source: Source;
}

export interface Signal {
  readonly regleId: string;
  readonly type: TypeRegle;
  readonly niveau: Niveau;
  /** Le chiffre de l'utilisateur. */
  readonly valeur: number;
  /** Le repère publié. */
  readonly seuil: number;
  readonly unite: string;
  readonly libelleCible: string;
  readonly message: string;
  readonly citation: string;
  readonly source: Source;
  readonly declencheLe: Instant;
}

export interface ErreurValidation {
  readonly regleId: string;
  readonly code:
    | 'mode_prescrit_interdit'
    | 'source_incomplete'
    | 'type_inconnu'
    | 'cible_vide'
    | 'cible_inconnue'
    | 'seuil_invalide'
    | 'mode_invalide'
    | 'niveau_invalide'
    | 'fenetre_manquante'
    | 'citation_manquante'
    | 'identifiant_manquant';
  readonly detail: string;
}

export interface BundleRegles {
  readonly version: string;
  readonly regles: Regle[];
  readonly erreurs: ErreurValidation[];
}

export interface Acquittement {
  readonly regleId: string;
  readonly valeur: number;
}

export interface ContexteEvaluation {
  readonly prises: readonly PriseAvecSubstances[];
  readonly produits: readonly Produit[];
  readonly acquittements?: readonly Acquittement[];
}

// ---------------------------------------------------------------------------
// Validation (§8.2)
// ---------------------------------------------------------------------------

/**
 * Valide un `regles.json`. Une règle en erreur n'est **pas** chargée : mieux
 * vaut aucun signal qu'un signal faux.
 */
export function validerBundle(brut: unknown): BundleRegles {
  const erreurs: ErreurValidation[] = [];
  const regles: Regle[] = [];

  const racine = brut as { version?: unknown; regles?: unknown };
  const version = typeof racine?.version === 'string' ? racine.version : '';
  const liste = Array.isArray(racine?.regles) ? racine.regles : [];

  for (const candidate of liste as Record<string, unknown>[]) {
    const id = typeof candidate['id'] === 'string' ? candidate['id'] : '';
    const problemes: ErreurValidation[] = [];
    const signaler = (code: ErreurValidation['code'], detail: string): void => {
      problemes.push({ regleId: id || '(sans identifiant)', code, detail });
    };

    if (!id) signaler('identifiant_manquant', 'champ `id` absent');

    const type = candidate['type'] as TypeRegle;
    if (!TYPES_CONNUS.has(type)) signaler('type_inconnu', `type « ${String(type)} »`);

    const mode = (Array.isArray(candidate['mode']) ? candidate['mode'] : []) as Mode[];
    if (mode.length === 0 || mode.some((m) => !MODES_CONNUS.has(m))) {
      signaler('mode_invalide', `mode « ${JSON.stringify(candidate['mode'])} »`);
    }

    // ⚠ R2, appliqué au niveau du format et non du seul code.
    if (TYPES_FREQUENCE.has(type) && mode.includes('prescrit')) {
      signaler(
        'mode_prescrit_interdit',
        `une règle ${type} ne peut pas s'appliquer à un traitement prescrit`,
      );
    }

    const cible = (candidate['cible'] ?? {}) as Record<string, unknown>;
    const substances = Array.isArray(cible['substances']) ? (cible['substances'] as string[]) : [];
    const classes = Array.isArray(cible['classes']) ? (cible['classes'] as Classe[]) : [];
    if (substances.length === 0 && classes.length === 0) {
      signaler('cible_vide', 'ni `substances` ni `classes`');
    }
    for (const cle of Object.keys(cible)) {
      // Toute clé inconnue est refusée : c'est ce qui interdit d'introduire
      // un croisement inter-produits par la porte du format.
      if (!CLES_CIBLE.has(cle)) signaler('cible_inconnue', `clé de cible « ${cle} »`);
    }

    const seuil = candidate['seuil'];
    if (typeof seuil !== 'number' || !Number.isFinite(seuil) || seuil <= 0) {
      signaler('seuil_invalide', `seuil « ${String(seuil)} »`);
    }

    if (!NIVEAUX_CONNUS.has(candidate['niveau'] as string)) {
      signaler('niveau_invalide', `niveau « ${String(candidate['niveau'])} »`);
    }

    const fenetre = candidate['fenetre'];
    if ((type === 'cumul_fenetre' || type === 'jours_de_prise') && typeof fenetre !== 'string') {
      signaler('fenetre_manquante', 'ce type de règle exige une fenêtre ISO 8601');
    }

    if (typeof candidate['citation'] !== 'string' || !candidate['citation']) {
      signaler('citation_manquante', 'le repère publié doit être cité mot pour mot (R3)');
    }

    const source = (candidate['source'] ?? {}) as Record<string, unknown>;
    if (
      typeof source['url'] !== 'string' ||
      !source['url'].startsWith('https://') ||
      typeof source['consulte_le'] !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(source['consulte_le']) ||
      typeof source['libelle'] !== 'string' ||
      !source['libelle']
    ) {
      signaler('source_incomplete', '`source.libelle`, `source.url` et `source.consulte_le` requis');
    }

    if (problemes.length > 0) {
      erreurs.push(...problemes);
      continue;
    }

    regles.push({
      id,
      type,
      cible: {
        ...(substances.length ? { substances } : {}),
        ...(classes.length ? { classes } : {}),
        ...(typeof cible['libelle'] === 'string' ? { libelle: cible['libelle'] } : {}),
      },
      mode,
      ...(typeof fenetre === 'string' ? { fenetre } : {}),
      seuil: seuil as number,
      unite: String(candidate['unite'] ?? ''),
      niveau: candidate['niveau'] as Niveau,
      message: String(candidate['message'] ?? ''),
      citation: candidate['citation'] as string,
      source: {
        libelle: source['libelle'] as string,
        url: source['url'] as string,
        consulte_le: source['consulte_le'] as string,
      },
    });
  }

  return { version, regles, erreurs };
}

// ---------------------------------------------------------------------------
// Évaluation (§8.4)
// ---------------------------------------------------------------------------

export function evaluer(
  contexte: ContexteEvaluation,
  regles: readonly Regle[],
  maintenant: Instant,
): Signal[] {
  const produits = new Map(contexte.produits.map((p) => [p.id, p]));
  const signaux: Signal[] = [];

  for (const regle of regles) {
    const eligibles = contexte.prises.filter((prise) => {
      const produit = produits.get(prise.produitId);
      if (!produit) return false;
      // ⚠ R2 : un traitement prescrit ne déclenche jamais une règle de fréquence.
      if (!regle.mode.includes(produit.mode)) return false;
      return concerne(regle, prise, produit);
    });
    if (eligibles.length === 0) continue;

    const signal = evaluerRegle(regle, eligibles, maintenant);
    if (signal) signaux.push(signal);
  }

  return filtrerAcquittes(signaux, contexte.acquittements ?? []);
}

/** Une prise concerne une règle si sa substance ou son produit est ciblé. */
function concerne(regle: Regle, prise: PriseAvecSubstances, produit: Produit): boolean {
  const codes = regle.cible.substances;
  if (codes && prise.substances.some((s) => codes.includes(s.code))) return true;

  const classes = regle.cible.classes;
  if (!classes) return false;
  // Une classe d'association (§5.4) ne qualifie que le produit : aucune
  // molécule ne porte le code ATC d'une association.
  if (classes.includes(produit.classe)) return true;
  return prise.substances.some((s) => classes.includes(s.classe));
}

function evaluerRegle(
  regle: Regle,
  prises: readonly PriseAvecSubstances[],
  maintenant: Instant,
): Signal | null {
  switch (regle.type) {
    case 'cumul_fenetre':
      return comparer(regle, cumulCible(regle, prises, maintenant), maintenant);
    case 'dose_unitaire':
      return comparer(regle, doseMaximale(regle, prises), maintenant);
    case 'intervalle_min': {
      const ecart = intervalleMinimal(prises);
      // Seule règle où le signal se déclenche **sous** le repère.
      return ecart !== null && ecart < regle.seuil
        ? construire(regle, arrondir(ecart), maintenant)
        : null;
    }
    case 'duree_consecutive':
      return comparer(regle, joursConsecutifs(prises, maintenant), maintenant);
    case 'jours_de_prise':
      return comparer(regle, joursDistincts(regle, prises, maintenant), maintenant);
  }
}

function comparer(regle: Regle, valeur: number, maintenant: Instant): Signal | null {
  return valeur >= regle.seuil ? construire(regle, arrondir(valeur), maintenant) : null;
}

function arrondir(valeur: number): number {
  return Math.round(valeur * 1000) / 1000;
}

function construire(regle: Regle, valeur: number, maintenant: Instant): Signal {
  return {
    regleId: regle.id,
    type: regle.type,
    niveau: regle.niveau,
    valeur,
    seuil: regle.seuil,
    unite: regle.unite,
    libelleCible: regle.cible.libelle ?? '',
    message: regle.message,
    citation: regle.citation,
    source: regle.source,
    declencheLe: maintenant,
  };
}

function cumulCible(regle: Regle, prises: readonly PriseAvecSubstances[], maintenant: Instant): number {
  const fin = epoch(maintenant);
  const debut = fin - dureeMs(regle.fenetre ?? 'PT24H');
  let total = 0;
  for (const prise of dansLaFenetre(prises, debut, fin + 1)) {
    for (const substance of prise.substances) {
      if (cibleSubstance(regle, substance.code, substance.classe)) total += substance.quantiteMg;
    }
  }
  return total;
}

function doseMaximale(regle: Regle, prises: readonly PriseAvecSubstances[]): number {
  let maximum = 0;
  for (const prise of prises) {
    if (prise.statut !== 'prise') continue;
    let dose = 0;
    for (const substance of prise.substances) {
      if (cibleSubstance(regle, substance.code, substance.classe)) dose += substance.quantiteMg;
    }
    maximum = Math.max(maximum, dose);
  }
  return maximum;
}

/** Écart minimal, en heures, entre deux prises consécutives. */
function intervalleMinimal(prises: readonly PriseAvecSubstances[]): number | null {
  const instants = prises
    .filter((p) => p.statut === 'prise')
    .map((p) => epoch(p.horodatage))
    .sort((a, b) => a - b);
  if (instants.length < 2) return null;

  let minimum = Number.POSITIVE_INFINITY;
  for (let index = 1; index < instants.length; index += 1) {
    minimum = Math.min(minimum, (instants[index]! - instants[index - 1]!) / HEURE);
  }
  return minimum;
}

/** Jours calendaires consécutifs avec prise, série se terminant aujourd'hui ou hier. */
function joursConsecutifs(prises: readonly PriseAvecSubstances[], maintenant: Instant): number {
  const jours = joursDePrise(prises);
  if (jours.size === 0) return 0;

  const aujourdhui = jourLocal(maintenant);
  let curseur = jours.has(aujourdhui) ? aujourdhui : ajouterJours(aujourdhui, -1);
  if (!jours.has(curseur)) return 0;

  let serie = 0;
  while (jours.has(curseur)) {
    serie += 1;
    curseur = ajouterJours(curseur, -1);
  }
  return serie;
}

function joursDistincts(
  regle: Regle,
  prises: readonly PriseAvecSubstances[],
  maintenant: Instant,
): number {
  const fin = epoch(maintenant);
  const debut = fin - dureeMs(regle.fenetre ?? 'P30D');
  return joursDePrise(dansLaFenetre(prises, debut, fin + 1)).size;
}

function cibleSubstance(regle: Regle, code: CodeSubstance, classe: Classe): boolean {
  if (regle.cible.substances?.includes(code)) return true;
  return regle.cible.classes?.includes(classe) ?? false;
}

/**
 * Anti-répétition (§8.5) : un signal acquitté ne réapparaît qu'au
 * franchissement d'un nouveau seuil, jamais parce qu'un jour a passé.
 */
export function filtrerAcquittes(
  signaux: readonly Signal[],
  acquittements: readonly Acquittement[],
): Signal[] {
  const vus = new Map(acquittements.map((a) => [a.regleId, a.valeur]));
  return signaux.filter((signal) => {
    const valeurVue = vus.get(signal.regleId);
    return valeurVue === undefined || signal.valeur > valeurVue;
  });
}

/** Utilitaire d'affichage : quantité d'une substance dans une prise donnée. */
export { quantiteDe };
