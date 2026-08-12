/**
 * Cumul par substance — cœur du produit (spec §7). Module pur.
 *
 * Trois boîtes, une seule medco : Doliprane 1000 + Fervex + Actifed Rhume
 * font trois produits et un seul paracétamol. C'est ce calcul qui donne sa
 * valeur à l'application, et toute erreur ici invalide le reste.
 *
 * ⚠ R1 — deux invariants portés par ce module :
 *   1. seules les lignes marquées `comptee` par le pipeline entrent dans le
 *      cumul. Une liaison n'en porte jamais plus d'une, ce qui rend le double
 *      comptage SA/FT structurellement impossible (§7.2) ;
 *   2. une ligne de fiabilité 0 n'est **jamais** approchée : la prise est
 *      enregistrée, la substance est retournée dans `exclues`, et l'UI le dit.
 */

import { epoch, jourLocal } from './temps.js';
import type {
  Classe,
  CodeSubstance,
  CumulSubstance,
  Fenetre,
  Fiabilite,
  LigneComposition,
  PriseAvecSubstances,
  SubstancePrise,
} from './types.js';

export { jourLocal } from './temps.js';

export interface RepartitionPrise {
  readonly substances: SubstancePrise[];
  /** Lignes écartées du cumul : dosage non exploitable (§6.4, fiabilité 0). */
  readonly exclues: LigneComposition[];
  /**
   * Éléments pharmaceutiques entre lesquels le produit doit trancher.
   * Non vide ⇒ rien n'est compté tant que le choix n'est pas fait.
   */
  readonly elementsAChoisir: string[];
}

/** Éléments pharmaceutiques distincts d'une spécialité. */
export function elementsDe(lignes: readonly LigneComposition[]): string[] {
  return [...new Set(lignes.map((l) => l.element))];
}

/**
 * Substances apportées par une prise (spec §7.1).
 *
 * `dose` est exprimée dans l'unité de la ligne de composition — comprimé,
 * sachet, ml. La conversion est déjà faite par le pipeline : `doseParUnite`
 * est en milligrammes pour une unité de prise.
 *
 * ⚠ 1 437 spécialités portent **plusieurs éléments pharmaceutiques** :
 * HUMEX RHUME est une boîte de comprimés *et* de gélules, une plaquette
 * multiphasique porte un comprimé blanc *et* un rose, dosés différemment.
 * Sommer les éléments compterait deux comprimés là où l'utilisateur en prend
 * un. Tant que le produit n'a pas désigné son élément, rien n'est compté et
 * `elementsAChoisir` dit à l'UI quelle question poser — jamais de choix par
 * défaut (R1).
 */
export function substancesPourPrise(
  lignes: readonly LigneComposition[],
  dose: number,
  classes: ReadonlyMap<CodeSubstance, Classe>,
  element: string | null = null,
): RepartitionPrise {
  const elements = elementsDe(lignes);
  if (element === null && elements.length > 1) {
    return { substances: [], exclues: [...lignes], elementsAChoisir: elements };
  }
  const retenues = element === null ? lignes : lignes.filter((l) => l.element === element);

  const substances: SubstancePrise[] = [];
  const exclues: LigneComposition[] = [];

  for (const ligne of retenues) {
    if (!ligne.comptee || ligne.fiabilite === 0 || ligne.doseParUnite === null) {
      // Compter une ligne non exploitable produirait un faux négatif de
      // sécurité : on préfère l'absence, dite explicitement.
      if (ligne.fiabilite === 0 || ligne.doseParUnite === null) exclues.push(ligne);
      continue;
    }
    substances.push({
      code: ligne.codeSubstance,
      quantiteMg: ligne.doseParUnite * dose,
      fiabilite: ligne.fiabilite,
      classe: classes.get(ligne.codeSubstance) ?? 'AUTRE',
    });
  }

  return { substances: fusionner(substances), exclues, elementsAChoisir: [] };
}

/** Une même substance présente sur deux éléments d'un produit ne fait qu'une entrée. */
function fusionner(substances: SubstancePrise[]): SubstancePrise[] {
  const parCode = new Map<CodeSubstance, SubstancePrise>();
  for (const substance of substances) {
    const existante = parCode.get(substance.code);
    parCode.set(
      substance.code,
      existante
        ? {
            ...existante,
            quantiteMg: existante.quantiteMg + substance.quantiteMg,
            fiabilite: Math.min(existante.fiabilite, substance.fiabilite) as Fiabilite,
          }
        : substance,
    );
  }
  return [...parCode.values()];
}

/**
 * Cumul sur une fenêtre. Borne de début incluse, borne de fin **exclue**
 * (§7.3) : deux fenêtres consécutives ne comptent jamais deux fois la même
 * prise.
 */
export function cumulParSubstance(
  prises: readonly PriseAvecSubstances[],
  fenetre: Fenetre,
): Map<CodeSubstance, CumulSubstance> {
  const debut = epoch(fenetre.debut);
  const fin = epoch(fenetre.fin);
  const cumul = new Map<CodeSubstance, CumulSubstance>();

  for (const prise of dansLaFenetre(prises, debut, fin)) {
    for (const substance of prise.substances) {
      const existant = cumul.get(substance.code);
      cumul.set(substance.code, {
        mg: (existant?.mg ?? 0) + substance.quantiteMg,
        fiabiliteMin: Math.min(existant?.fiabiliteMin ?? 2, substance.fiabilite) as Fiabilite,
        nbPrises: (existant?.nbPrises ?? 0) + 1,
      });
    }
  }
  return cumul;
}

/** Prises retenues pour tout calcul : statut `prise`, dans la fenêtre. */
export function dansLaFenetre(
  prises: readonly PriseAvecSubstances[],
  debut: number,
  fin: number,
): PriseAvecSubstances[] {
  return prises.filter((prise) => {
    if (prise.statut !== 'prise') return false;
    const instant = epoch(prise.horodatage);
    return instant >= debut && instant < fin;
  });
}

/** Jours calendaires locaux distincts portant au moins une prise. */
export function joursDePrise(prises: readonly PriseAvecSubstances[]): Set<string> {
  const jours = new Set<string>();
  for (const prise of prises) {
    if (prise.statut === 'prise') jours.add(jourLocal(prise.horodatage));
  }
  return jours;
}

/** Quantité d'une substance apportée par une prise donnée, 0 si absente. */
export function quantiteDe(prise: PriseAvecSubstances, code: CodeSubstance): number {
  return prise.substances.find((s) => s.code === code)?.quantiteMg ?? 0;
}
