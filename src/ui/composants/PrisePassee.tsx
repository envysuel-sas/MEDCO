/**
 * Feuille « Prise passée — corriger ou retirer » (maquette 2e).
 *
 * Contenu relevé dans la maquette, dans l'ordre :
 *
 *   Doliprane 1000 mg
 *   paracétamol 1 000 mg · 1 comprimé
 *   mardi 11 août · 21:30
 *   ajoutée le 12 août à 08:40
 *
 *   Changer l'heure          21:30
 *   Changer la dose          1 cp
 *   Dupliquer sur aujourd'hui
 *   Retirer cette prise
 *   « Le retrait recalcule le total du 11 août et la plaquette.
 *     Rien n'est conservé en double. »
 *   Terminé
 *
 * ⚠ §12.1 — le retrait n'est pas en rouge et ne porte pas d'avertissement
 * alarmiste. Sa conséquence est écrite en toutes lettres, c'est tout.
 *
 * ⚠ La ligne « ajoutée le … » ne s'affiche que si la prise l'a réellement été
 * après coup : elle n'est pas un ornement, elle porte une information.
 */

import { useState } from 'react';
import type { ReactNode } from 'react';

import type { CodeSubstance, PriseAvecSubstances, Produit, Substance } from '../../domain/types.js';
import { baseDeDonnees } from '../../db/client.js';
import { Bouton, Feuille } from './primitives.js';
import { SelecteurDose } from './donnees.js';
import { SelecteurInstant } from './SelecteurInstant.js';
import styles from './composants.module.css';

/** Au-delà d'une heure d'écart, la prise a été ajoutée après coup (manques.md §1.6). */
const SEUIL_APRES_COUP_MS = 3_600_000;

export function PrisePassee({
  prise,
  produit,
  substances,
  maintenant,
  onFerme,
  onModifiee,
}: {
  readonly prise: PriseAvecSubstances | null;
  readonly produit: Produit | undefined;
  readonly substances: ReadonlyMap<CodeSubstance, Substance>;
  readonly maintenant: string;
  readonly onFerme: () => void;
  readonly onModifiee: () => void | Promise<void>;
}): ReactNode {
  const [volet, setVolet] = useState<'aucun' | 'heure' | 'dose'>('aucun');
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!prise) return null;

  const dominante = [...prise.substances].sort((a, b) => b.quantiteMg - a.quantiteMg)[0];
  const substance = dominante ? substances.get(dominante.code) : undefined;
  const unite = produit?.unite ?? 'dose';

  async function agir(action: () => Promise<unknown>): Promise<void> {
    setEnCours(true);
    setMessage(null);
    try {
      await action();
      await onModifiee();
      setVolet('aucun');
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setEnCours(false);
    }
  }

  return (
    <Feuille ouverte titre={produit?.nomAffiche ?? 'Prise'} onFermer={onFerme}>
      <p className={styles['meta']}>
        {dominante && substance
          ? `${substance.nom.toLowerCase()} ${formaterMg(dominante.quantiteMg)} · ${prise.dose} ${unite}`
          : `${prise.dose} ${unite} · dosage non exploitable`}
      </p>
      <p className={styles['meta']}>{dateLongue(prise.horodatage)}</p>
      {apresCoup(prise) ? (
        <p className={styles['meta']}>ajoutée le {dateSaisie(prise.saisieLe ?? '')}</p>
      ) : null}

      {volet === 'heure' ? (
        <div style={{ marginTop: 'var(--espace-9)' }}>
          <SelecteurInstant
            valeur={prise.horodatage}
            maximum={maintenant}
            onChanger={(horodatage) =>
              void agir(() => baseDeDonnees.corrigerPrise(prise.id, { horodatage }))
            }
          />
        </div>
      ) : null}

      {volet === 'dose' ? (
        <div style={{ marginTop: 'var(--espace-9)' }}>
          <SelecteurDose
            dose={prise.dose}
            unite={unite}
            equivalent={
              dominante && substance
                ? `${formaterMg(dominante.quantiteMg / prise.dose)} de ${substance.nom.toLowerCase()} par ${unite}`
                : ''
            }
            onChanger={(dose) => void agir(() => baseDeDonnees.corrigerPrise(prise.id, { dose }))}
          />
        </div>
      ) : null}

      <div className={styles['actionsPrisePassee']}>
        <Bouton
          variante="secondaire"
          pleineLargeur
          disabled={enCours}
          onClick={() => setVolet(volet === 'heure' ? 'aucun' : 'heure')}
        >
          Changer l&apos;heure · {prise.horodatage.slice(11, 16)}
        </Bouton>
        <Bouton
          variante="secondaire"
          pleineLargeur
          disabled={enCours}
          onClick={() => setVolet(volet === 'dose' ? 'aucun' : 'dose')}
        >
          Changer la dose · {prise.dose} {unite}
        </Bouton>
        <Bouton
          variante="secondaire"
          pleineLargeur
          disabled={enCours}
          onClick={() =>
            void agir(() =>
              baseDeDonnees.enregistrerPrise({
                id: crypto.randomUUID(),
                profilId: prise.profilId,
                produitId: prise.produitId,
                horodatage: maintenant,
                fuseau: Intl.DateTimeFormat().resolvedOptions().timeZone,
                dose: prise.dose,
                saisieLe: maintenant,
                source: 'manuelle',
              }),
            )
          }
        >
          Dupliquer sur aujourd&apos;hui
        </Bouton>
        <Bouton
          variante="texte"
          pleineLargeur
          disabled={enCours}
          onClick={() =>
            void agir(async () => {
              await baseDeDonnees.supprimerPrise(prise.id);
              onFerme();
            })
          }
        >
          Retirer cette prise
        </Bouton>
      </div>

      <p className={styles['meta']}>
        Le retrait recalcule le total du {jourCourt(prise.horodatage)} et la plaquette. Rien
        n&apos;est conservé en double.
      </p>

      {message ? <p className={styles['meta']}>{message}</p> : null}

      <div style={{ marginTop: 'var(--espace-9)' }}>
        <Bouton pleineLargeur disabled={enCours} onClick={onFerme}>
          Terminé
        </Bouton>
      </div>
    </Feuille>
  );
}

function apresCoup(prise: PriseAvecSubstances): boolean {
  if (!prise.saisieLe) return false;
  return Date.parse(prise.saisieLe) - Date.parse(prise.horodatage) > SEUIL_APRES_COUP_MS;
}

function formaterMg(mg: number): string {
  return mg >= 1000
    ? `${(mg / 1000).toLocaleString('fr-FR')} g`
    : `${Math.round(mg).toLocaleString('fr-FR')} mg`;
}

function dateLongue(horodatage: string): string {
  const jour = new Date(`${horodatage.slice(0, 10)}T12:00:00Z`).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
  return `${jour} · ${horodatage.slice(11, 16)}`;
}

function jourCourt(horodatage: string): string {
  return new Date(`${horodatage.slice(0, 10)}T12:00:00Z`).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}

function dateSaisie(saisieLe: string): string {
  const jour = new Date(`${saisieLe.slice(0, 10)}T12:00:00Z`).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
  return `${jour} à ${saisieLe.slice(11, 16)}`;
}
