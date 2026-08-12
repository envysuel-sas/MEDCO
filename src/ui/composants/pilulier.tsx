/**
 * Pilulier — vue jour et vue semaine (spec §9).
 *
 * ⚠ R3 et §9.3 : aucun taux d'observance, aucun compteur de retard, aucun
 * badge. Une occurrence expirée est écrite, pas comptée.
 * ⚠ R4 : aucune conduite à tenir en cas d'oubli. L'écran affiche l'heure
 * prévue et l'heure réelle, et renvoie à la notice ou au pharmacien.
 */

import type { ReactNode } from 'react';

import type { GroupeAtc, Moment, Occurrence } from '../../domain/types.js';
import { heureLocale } from '../../domain/temps.js';
import { COULEUR_ATC } from '../tokens.js';
import { Bouton, Etiquette } from './primitives.js';
import { PastilleAtc } from './donnees.js';
import styles from './composants.module.css';

export interface OccurrenceAffichee {
  readonly occurrence: Occurrence;
  readonly nomProduit: string;
  readonly doseLibelle: string;
  readonly groupe: GroupeAtc;
  readonly codeSubstance: string;
  /** Heure réellement enregistrée, quand elle diffère de l'heure prévue (R4). */
  readonly heureReelle?: string;
}

const LIBELLE_STATUT: Readonly<Record<Occurrence['statut'], string>> = {
  attendue: 'À prendre',
  validee: 'Prise',
  sautee: 'Sautée',
  expiree: 'Non renseignée',
};

export function BlocMoment({
  moment,
  occurrences,
  onValider,
  onSauter,
  onToutValider,
}: {
  readonly moment: Pick<Moment, 'libelle' | 'heure'>;
  readonly occurrences: readonly OccurrenceAffichee[];
  readonly onValider?: (occurrence: Occurrence) => void;
  readonly onSauter?: (occurrence: Occurrence) => void;
  readonly onToutValider?: () => void;
}): ReactNode {
  const attendues = occurrences.filter((o) => o.occurrence.statut === 'attendue');

  return (
    <section className={styles['blocMoment']}>
      <div className={styles['blocMomentEntete']}>
        <Etiquette>{moment.libelle}</Etiquette>
        <span className={styles['momentHeure']}>{moment.heure}</span>
      </div>

      <div>
        {occurrences.map((affichee) => (
          <div key={affichee.occurrence.id} className={styles['occurrence']}>
            <PastilleAtc groupe={affichee.groupe} codeSubstance={affichee.codeSubstance} taille="petite" />
            <span className={styles['ligneCorps']}>
              <span className={styles['ligneTitre']}>{affichee.nomProduit}</span>
              <span className={styles['ligneDetail']}>
                {affichee.doseLibelle} · prévue à {heureLocale(affichee.occurrence.prevueLe)}
                {affichee.heureReelle ? ` · prise à ${affichee.heureReelle}` : ''}
              </span>
            </span>
            {affichee.occurrence.statut === 'attendue' ? (
              <>
                {onSauter ? (
                  <Bouton variante="texte" onClick={() => onSauter(affichee.occurrence)}>
                    Sauter
                  </Bouton>
                ) : null}
                {onValider ? (
                  <Bouton variante="secondaire" onClick={() => onValider(affichee.occurrence)}>
                    Valider
                  </Bouton>
                ) : null}
              </>
            ) : (
              <span
                className={[
                  styles['ligneAppoint'],
                  affichee.occurrence.statut === 'expiree' ? styles['statutExpiree'] : styles['statutValidee'],
                ].join(' ')}
              >
                {LIBELLE_STATUT[affichee.occurrence.statut]}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* « Tout valider » est indispensable : personne ne fait sept appuis
          chaque matin (§9.3). */}
      {attendues.length > 1 && onToutValider ? (
        <Bouton variante="secondaire" pleineLargeur onClick={onToutValider}>
          Tout valider ({attendues.length})
        </Bouton>
      ) : null}
    </section>
  );
}

export function PilulierJour({
  blocs,
  onValider,
  onSauter,
  onToutValider,
}: {
  readonly blocs: readonly { moment: Pick<Moment, 'id' | 'libelle' | 'heure'>; occurrences: readonly OccurrenceAffichee[] }[];
  readonly onValider?: (occurrence: Occurrence) => void;
  readonly onSauter?: (occurrence: Occurrence) => void;
  readonly onToutValider?: (momentId: string) => void;
}): ReactNode {
  return (
    <div className={styles['blocMoment']}>
      {blocs.map((bloc) => (
        <BlocMoment
          key={bloc.moment.id}
          moment={bloc.moment}
          occurrences={bloc.occurrences}
          {...(onValider ? { onValider } : {})}
          {...(onSauter ? { onSauter } : {})}
          {...(onToutValider ? { onToutValider: () => onToutValider(bloc.moment.id) } : {})}
        />
      ))}
    </div>
  );
}

export interface CelluleSemaine {
  readonly statut: Occurrence['statut'];
  readonly groupe: GroupeAtc;
}

/**
 * Géométrie du semainier : une ligne par moment, sept colonnes.
 * Un point plein = prise validée, un contour = attendue, un contour gris =
 * sautée. Aucun compteur, aucune couleur d'alerte.
 */
export function PilulierSemaine({
  moments,
  jours,
  cellules,
  indexAujourdhui,
}: {
  readonly moments: readonly Pick<Moment, 'id' | 'libelle' | 'heure'>[];
  /**
   * `date` sert de clé, `libelle` d'affichage. Les deux sont distincts :
   * confondre l'un et l'autre vide silencieusement la grille.
   */
  readonly jours: readonly { date: string; libelle: string }[];
  /** Clé : `${momentId}#${date}`. */
  readonly cellules: ReadonlyMap<string, readonly CelluleSemaine[]>;
  readonly indexAujourdhui: number;
}): ReactNode {
  return (
    <div className={styles['semaine']}>
      <div className={styles['semaineLigne']}>
        <span />
        {jours.map((jour, index) => (
          <span
            key={jour.date}
            className={[styles['plaquetteJour'], index === indexAujourdhui ? styles['ongletActif'] : '']
              .filter(Boolean)
              .join(' ')}
          >
            {jour.libelle}
          </span>
        ))}
      </div>

      {moments.map((moment) => (
        <div key={moment.id} className={styles['semaineLigne']}>
          <span className={styles['meta']}>
            {moment.libelle}
            <span className={styles['momentHeure']}> {moment.heure}</span>
          </span>
          {jours.map((jour, index) => {
            const contenu = cellules.get(`${moment.id}#${jour.date}`) ?? [];
            return (
              <span
                key={`${moment.id}-${jour.date}`}
                className={[
                  styles['semaineCellule'],
                  index === indexAujourdhui ? styles['semaineAujourdhui'] : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {contenu.map((cellule, rang) => (
                  <span
                    key={rang}
                    className={[
                      styles['point'],
                      cellule.statut === 'attendue' ? styles['pointAttendu'] : '',
                      cellule.statut === 'sautee' ? styles['pointSaute'] : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    style={{
                      color: COULEUR_ATC[cellule.groupe],
                      ...(cellule.statut === 'validee' ? { background: COULEUR_ATC[cellule.groupe] } : {}),
                      ...(cellule.statut === 'expiree' ? { background: 'var(--surface-creux)' } : {}),
                    }}
                    aria-label={`${moment.libelle} ${jour.libelle} : ${LIBELLE_STATUT[cellule.statut]}`}
                  />
                ))}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}
