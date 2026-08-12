/**
 * Composants de données — cumul, jauge, plaquette, signal, listes.
 *
 * Trois invariants fonctionnels priment sur toute considération esthétique
 * (§12) et sont portés ici :
 *   · la couleur d'une substance vient de son groupe ATC ;
 *   · une jauge de cumul est **linéaire**, jamais circulaire ;
 *   · ni série, ni rouge, ni pourcentage d'observance.
 */

import type { ReactNode } from 'react';

import type { Fiabilite, GroupeAtc } from '../../domain/types.js';
import type { Signal } from '../../domain/regles.js';
import { COULEUR_ATC, LIBELLE_GROUPE_ATC, couleurSubstance, opaciteAlveole } from '../tokens.js';
import { Bouton, Carte, Etiquette, Pas } from './primitives.js';
import styles from './composants.module.css';

const JOURS_SEMAINE = ['L', 'M', 'M', 'J', 'V', 'S', 'D'] as const;

/** Formatage français : espace insécable fine comme séparateur de milliers. */
const nombreFr = new Intl.NumberFormat('fr-FR');

export function formaterMg(mg: number): string {
  return `${nombreFr.format(Math.round(mg))} mg`;
}

// --- Pastille ATC -------------------------------------------------------------

export function PastilleAtc({
  groupe,
  codeSubstance,
  taille = 'normale',
}: {
  readonly groupe: GroupeAtc;
  readonly codeSubstance?: string;
  readonly taille?: 'normale' | 'petite';
}): ReactNode {
  const couleur = codeSubstance ? couleurSubstance(groupe, codeSubstance) : COULEUR_ATC[groupe];
  const cote = taille === 'petite' ? 'var(--espace-4)' : 'var(--espace-5)';
  return (
    <span
      className={styles['pastille']}
      style={{ background: couleur, width: cote, height: cote }}
      role="img"
      aria-label={LIBELLE_GROUPE_ATC[groupe]}
    />
  );
}

// --- Jauge linéaire -------------------------------------------------------------

export function JaugeLineaire({
  valeur,
  repere,
  couleur,
  legendeGauche,
  legendeDroite,
}: {
  readonly valeur: number;
  readonly repere: number;
  readonly couleur: string;
  readonly legendeGauche?: string;
  readonly legendeDroite?: string;
}): ReactNode {
  // L'échelle laisse de la place au-delà du repère : un dépassement se voit,
  // sans que la barre ne « sature » ni ne change de couleur (§12.1, §12.3).
  const echelle = Math.max(repere * 1.2, valeur);
  const pourcentageRepere = (repere / echelle) * 100;
  const pourcentageValeur = Math.min(100, (valeur / echelle) * 100);

  return (
    <>
      <div
        className={styles['jauge']}
        role="meter"
        aria-valuenow={Math.round(valeur)}
        aria-valuemin={0}
        aria-valuemax={Math.round(echelle)}
        aria-label={legendeDroite ?? 'cumul'}
      >
        <div
          className={styles['jaugeRemplissage']}
          style={{ width: `${pourcentageValeur}%`, background: couleur }}
        />
        <div className={styles['jaugeGraduation']} style={{ left: `${pourcentageRepere}%` }} />
      </div>
      {legendeGauche || legendeDroite ? (
        <div className={styles['jaugeLegendes']}>
          <span>{legendeGauche}</span>
          <span>{legendeDroite}</span>
        </div>
      ) : null}
    </>
  );
}

// --- Cumul du jour ----------------------------------------------------------------

export function CumulJour({
  mg,
  repere,
  substance,
  groupe,
  codeSubstance,
  detailPrises,
  fiabiliteMin,
}: {
  readonly mg: number;
  readonly repere: number | null;
  readonly substance: string;
  readonly groupe: GroupeAtc;
  readonly codeSubstance: string;
  readonly detailPrises: string;
  readonly fiabiliteMin: Fiabilite;
}): ReactNode {
  return (
    <div>
      <Etiquette>Aujourd&apos;hui</Etiquette>
      <div className={styles['cumulChiffre']}>{formaterMg(mg)}</div>
      <div className={styles['cumulSubstance']}>
        <PastilleAtc groupe={groupe} codeSubstance={codeSubstance} />
        <span>{substance}</span>
      </div>
      {repere === null ? null : (
        <div className={styles['cumulJauge']}>
          <JaugeLineaire
            valeur={mg}
            repere={repere}
            couleur={couleurSubstance(groupe, codeSubstance)}
            legendeGauche={detailPrises}
            legendeDroite={`repère ${formaterMg(repere)}`}
          />
        </div>
      )}
      {fiabiliteMin === 1 ? (
        <p className={styles['mentionFiabilite']}>
          Valeur dérivée : le dosage est exprimé pour une autre unité que celle de la prise.
        </p>
      ) : null}
    </div>
  );
}

// --- Plaquette ---------------------------------------------------------------------

export interface BandeAlveole {
  readonly hauteur: string;
  readonly couleur: string;
  readonly opacite: number;
}

export interface Alveole {
  readonly jour: string | null;
  readonly bandes: readonly BandeAlveole[];
  readonly aujourdhui?: boolean;
  readonly description: string;
}

/**
 * Grille 7 colonnes des 30 ou 90 derniers jours.
 * L'intensité porte le **nombre de prises**, la teinte porte le groupe ATC :
 * sur un mois, on voit quelle famille domine (§12.2).
 */
export function Plaquette({
  alveoles,
  legende,
}: {
  readonly alveoles: readonly Alveole[];
  readonly legende?: readonly { couleur: string; libelle: string }[];
}): ReactNode {
  return (
    <div>
      <div className={styles['plaquetteJours']} aria-hidden="true">
        {JOURS_SEMAINE.map((jour, index) => (
          <div key={`${jour}-${index}`} className={styles['plaquetteJour']}>
            {jour}
          </div>
        ))}
      </div>
      <ul className={styles['plaquette']} aria-label="Répartition des prises">
        {alveoles.map((alveole, index) => (
          <li
            key={alveole.jour ?? `vide-${index}`}
            className={[
              styles['alveole'],
              alveole.aujourdhui ? styles['alveoleAujourdhui'] : '',
              alveole.jour === null ? styles['alveoleHorsPeriode'] : '',
            ]
              .filter(Boolean)
              .join(' ')}
            aria-label={alveole.description}
          >
            {alveole.bandes.map((bande, rang) => (
              <div
                key={rang}
                style={{ height: bande.hauteur, background: bande.couleur, opacity: bande.opacite }}
              />
            ))}
          </li>
        ))}
      </ul>
      {legende ? (
        <div className={styles['legende']}>
          {legende.map((entree) => (
            <div key={entree.libelle} className={styles['legendeEntree']}>
              <span className={styles['legendePastille']} style={{ background: entree.couleur }} />
              <span>{entree.libelle}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Construit les alvéoles d'une plaquette à partir des prises par jour. */
export function alveolesDepuisJours(
  jours: readonly { jour: string; parGroupe: readonly { groupe: GroupeAtc; code: string; nb: number }[] }[],
  aujourdhui: string,
  decalage: number,
): Alveole[] {
  const vides: Alveole[] = Array.from({ length: decalage }, () => ({
    jour: null,
    bandes: [],
    description: 'hors période',
  }));

  const remplies = jours.map((entree) => {
    const total = entree.parGroupe.reduce((somme, g) => somme + g.nb, 0);
    const bandes = entree.parGroupe.map((groupe, index) => ({
      hauteur: `${100 / entree.parGroupe.length}%`,
      couleur: couleurSubstance(groupe.groupe, groupe.code),
      opacite: opaciteAlveole(index === 0 ? total : groupe.nb),
    }));
    const familles = entree.parGroupe.map((g) => LIBELLE_GROUPE_ATC[g.groupe]).join(' et ');
    return {
      jour: entree.jour,
      bandes,
      aujourdhui: entree.jour === aujourdhui,
      description:
        total === 0
          ? `${entree.jour}, aucune prise`
          : `${entree.jour}, ${total} prise${total > 1 ? 's' : ''}, ${familles}`,
    };
  });

  return [...vides, ...remplies];
}

// --- Citation et signal ---------------------------------------------------------------

export function Citation({ texte }: { readonly texte: string }): ReactNode {
  // Le texte cité d'une source institutionnelle est visuellement distingué du
  // texte de l'app — ici par le sérif, et par lui seul (§12.3).
  return <blockquote className={styles['citation']}>« {texte} »</blockquote>;
}

/**
 * Trois blocs, dans cet ordre, jamais un quatrième (§8.6) :
 * le chiffre de l'utilisateur, le repère publié cité, la source datée.
 * **Aucune phrase ne relie les deux premiers** (R3).
 */
export function CarteSignal({
  signal,
  fait,
  onAcquitter,
  onDetail,
}: {
  readonly signal: Signal;
  readonly fait: string;
  readonly onAcquitter?: () => void;
  readonly onDetail?: () => void;
}): ReactNode {
  const consultee = new Date(signal.source.consulte_le).toLocaleDateString('fr-FR');
  return (
    <Carte filet={signal.niveau}>
      <p className={styles['signalFait']}>{fait}</p>
      <Citation texte={signal.citation} />
      <a
        className={styles['source']}
        href={signal.source.url}
        target="_blank"
        rel="noreferrer noopener"
      >
        {signal.source.libelle} · consultée le {consultee} ↗
      </a>
      {onAcquitter || onDetail ? (
        <div className={styles['signalActions']}>
          {onAcquitter ? (
            <Bouton variante="secondaire" onClick={onAcquitter}>
              J&apos;ai vu
            </Bouton>
          ) : null}
          {onDetail ? (
            <Bouton variante="secondaire" onClick={onDetail}>
              Voir le détail
            </Bouton>
          ) : null}
        </div>
      ) : null}
    </Carte>
  );
}

// --- Listes ------------------------------------------------------------------------------

export interface LignePriseAffichee {
  readonly id: string;
  readonly heure: string;
  readonly nom: string;
  readonly detail: string;
  readonly appoint: string;
  readonly groupe: GroupeAtc;
  readonly codeSubstance: string;
  readonly annulee?: boolean;
  readonly exclueDuCumul?: boolean;
  readonly ajouteeApresCoup?: boolean;
  readonly onOuvrir?: () => void;
}

export function LignePrise({ prise }: { readonly prise: LignePriseAffichee }): ReactNode {
  const contenu = (
    <>
      <span className={styles['heure']}>{prise.heure}</span>
      <PastilleAtc groupe={prise.groupe} codeSubstance={prise.codeSubstance} taille="petite" />
      <span className={styles['ligneCorps']}>
        <span className={[styles['ligneTitre'], prise.annulee ? styles['ligneAnnulee'] : ''].filter(Boolean).join(' ')}>
          {prise.nom}
        </span>
        <span className={styles['ligneDetail']}>
          {prise.detail}
          {prise.ajouteeApresCoup ? ' · ajoutée après coup' : ''}
        </span>
        {prise.exclueDuCumul ? (
          <span className={styles['ligneDetail']}>
            Dosage non exploitable — cette prise n&apos;entre pas dans le cumul
          </span>
        ) : null}
      </span>
      <span className={styles['ligneAppoint']}>{prise.appoint}</span>
    </>
  );

  return prise.onOuvrir ? (
    <button type="button" className={styles['lignePrise']} onClick={prise.onOuvrir}>
      {contenu}
    </button>
  ) : (
    <div className={styles['lignePrise']}>{contenu}</div>
  );
}

export function ListePrises({ prises }: { readonly prises: readonly LignePriseAffichee[] }): ReactNode {
  if (prises.length === 0) {
    return <p className={styles['meta']}>Aucune prise enregistrée aujourd&apos;hui.</p>;
  }
  return (
    <div>
      {prises.map((prise) => (
        <LignePrise key={prise.id} prise={prise} />
      ))}
    </div>
  );
}

// --- Produits ------------------------------------------------------------------------------

export function ChipProduit({
  nom,
  dosage,
  groupe,
  codeSubstance,
  selectionne = false,
  onClick,
}: {
  readonly nom: string;
  readonly dosage: string;
  readonly groupe: GroupeAtc;
  readonly codeSubstance: string;
  readonly selectionne?: boolean;
  readonly onClick?: () => void;
}): ReactNode {
  return (
    <button
      type="button"
      aria-pressed={selectionne}
      onClick={onClick}
      className={[styles['chipProduit'], selectionne ? styles['chipProduitSelectionne'] : '']
        .filter(Boolean)
        .join(' ')}
      style={selectionne ? { borderColor: 'var(--action)', background: 'var(--surface-active)' } : undefined}
    >
      <PastilleAtc groupe={groupe} codeSubstance={codeSubstance} taille="petite" />
      <span className={styles['chipProduitNom']}>{nom}</span>
      <span className={styles['chipProduitDosage']}>{dosage}</span>
    </button>
  );
}

export function LigneResultat({
  nom,
  substances,
  prescription,
  commercialisee,
  onChoisir,
}: {
  readonly nom: string;
  readonly substances: string;
  readonly prescription: string | null;
  readonly commercialisee: boolean;
  readonly onChoisir: () => void;
}): ReactNode {
  return (
    <button type="button" className={styles['lignePrise']} onClick={onChoisir}>
      <span className={styles['ligneCorps']}>
        <span className={styles['ligneTitre']}>{nom}</span>
        <span className={styles['ligneDetail']}>{substances.toLowerCase()}</span>
        <span className={styles['ligneDetail']}>
          {prescription === 'PMO' ? 'Sur ordonnance' : 'Sans ordonnance'}
          {commercialisee ? '' : ' · non commercialisée'}
        </span>
      </span>
    </button>
  );
}

// --- Sélecteur de dose --------------------------------------------------------------------------

export function SelecteurDose({
  dose,
  unite,
  equivalent,
  onChanger,
}: {
  readonly dose: number;
  readonly unite: string;
  readonly equivalent: string;
  readonly onChanger: (dose: number) => void;
}): ReactNode {
  return (
    <div className={styles['selecteurDose']}>
      <Pas sens="moins" disabled={dose <= 0.5} onClick={() => onChanger(dose - 0.5)} />
      <div>
        <div className={styles['doseValeur']}>
          {nombreFr.format(dose)} {unite}
        </div>
        <div className={styles['doseEquivalent']}>{equivalent}</div>
      </div>
      <Pas sens="plus" onClick={() => onChanger(dose + 0.5)} />
    </div>
  );
}
