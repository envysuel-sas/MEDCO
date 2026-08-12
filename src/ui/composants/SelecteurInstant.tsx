/**
 * Sélecteur d'instant de prise (maquette 2c, 2d, 2e).
 *
 * §12.4 — la contrainte est d'enregistrer une prise en moins de cinq secondes.
 * « Maintenant » reste donc le choix par défaut, en un seul appui ; les
 * raccourcis couvrent la saisie a posteriori courante, et la date libre est le
 * dernier recours.
 *
 * ⚠ Le **futur est bloqué** : on n'enregistre pas une prise qui n'a pas eu
 * lieu. C'est aussi ce qui empêche de fabriquer un cumul par anticipation.
 */

import { useState } from 'react';
import type { ReactNode } from 'react';

import { epoch, heureLocale, jourLocal } from '../../domain/temps.js';
import type { Instant } from '../../domain/types.js';
import { Bouton, Chip, Etiquette } from './primitives.js';
import styles from './composants.module.css';

export interface RaccourciInstant {
  readonly libelle: string;
  readonly instant: Instant;
}

/**
 * Raccourcis dérivés de l'instant courant. Fonction pure : l'instant est
 * injecté, jamais lu à l'horloge.
 */
export function raccourcis(maintenant: Instant): RaccourciInstant[] {
  const decalage = maintenant.slice(19); // conserve l'offset local
  const jour = jourLocal(maintenant);
  const heure = heureLocale(maintenant);

  const liste: RaccourciInstant[] = [{ libelle: 'Maintenant', instant: maintenant }];

  // « Ce matin » n'a de sens qu'une fois la matinée passée.
  if (heure > '08:00') {
    liste.push({ libelle: 'Ce matin', instant: `${jour}T08:00:00${decalage}` });
  }
  const hier = new Date(epoch(maintenant) - 86_400_000).toISOString().slice(0, 10);
  liste.push({ libelle: 'Hier soir', instant: `${hier}T21:00:00${decalage}` });

  return liste;
}

export function SelecteurInstant({
  valeur,
  maximum,
  onChanger,
}: {
  readonly valeur: Instant;
  /** Instant courant : rien ne peut être enregistré au-delà. */
  readonly maximum: Instant;
  readonly onChanger: (instant: Instant) => void;
}): ReactNode {
  const [libre, setLibre] = useState(false);
  const options = raccourcis(maximum);
  const dansLePasse = epoch(valeur) < epoch(maximum) - 60_000;

  function changerLibre(champ: 'date' | 'heure', saisi: string): void {
    const decalage = valeur.slice(19);
    const propose =
      champ === 'date'
        ? `${saisi}T${valeur.slice(11, 19)}${decalage}`
        : `${valeur.slice(0, 11)}${saisi}:00${decalage}`;
    // Le futur est refusé : la valeur reste inchangée.
    if (epoch(propose) > epoch(maximum)) return;
    onChanger(propose);
  }

  return (
    <div>
      <Etiquette>Quand</Etiquette>
      <div style={{ display: 'flex', gap: 'var(--espace-4)', flexWrap: 'wrap', marginTop: 'var(--espace-4)' }}>
        {options.map((option) => (
          <Chip
            key={option.libelle}
            actif={option.instant === valeur}
            onClick={() => {
              setLibre(false);
              onChanger(option.instant);
            }}
          >
            {option.libelle}
          </Chip>
        ))}
        <Chip actif={libre} onClick={() => setLibre(!libre)}>
          Date et heure
        </Chip>
      </div>

      {libre ? (
        <div style={{ display: 'flex', gap: 'var(--espace-4)', marginTop: 'var(--espace-5)' }}>
          <input
            type="date"
            className={styles['champ']}
            value={jourLocal(valeur)}
            max={jourLocal(maximum)}
            onChange={(evenement) => changerLibre('date', evenement.target.value)}
            aria-label="Date de la prise"
          />
          <input
            type="time"
            className={styles['champ']}
            value={heureLocale(valeur)}
            onChange={(evenement) => changerLibre('heure', evenement.target.value)}
            aria-label="Heure de la prise"
          />
        </div>
      ) : null}

      {dansLePasse ? (
        <p className={styles['meta']} style={{ marginTop: 'var(--espace-5)' }}>
          Cette prise sera comptée sur le {new Date(valeur).toLocaleDateString('fr-FR')} à{' '}
          {heureLocale(valeur)}.
        </p>
      ) : null}
    </div>
  );
}

/** Écran 2e : corriger ou retirer une prise déjà enregistrée. */
export function ActionsPrisePassee({
  horodatage,
  saisieLe,
  onChangerHeure,
  onDupliquer,
  onRetirer,
}: {
  readonly horodatage: Instant;
  readonly saisieLe: Instant;
  readonly onChangerHeure: () => void;
  readonly onDupliquer: () => void;
  readonly onRetirer: () => void;
}): ReactNode {
  const ajouteeApresCoup = jourLocal(saisieLe) !== jourLocal(horodatage);
  return (
    <div className={styles['blocMoment']}>
      <p className={styles['meta']}>
        {new Date(horodatage).toLocaleDateString('fr-FR')} · {heureLocale(horodatage)}
        {ajouteeApresCoup
          ? ` · ajoutée le ${new Date(saisieLe).toLocaleDateString('fr-FR')} à ${heureLocale(saisieLe)}`
          : ''}
      </p>
      <Bouton variante="secondaire" pleineLargeur onClick={onChangerHeure}>
        Changer l&apos;heure
      </Bouton>
      <Bouton variante="secondaire" pleineLargeur onClick={onDupliquer}>
        Dupliquer sur aujourd&apos;hui
      </Bouton>
      <Bouton variante="secondaire" pleineLargeur onClick={onRetirer}>
        Retirer cette prise
      </Bouton>
    </div>
  );
}
