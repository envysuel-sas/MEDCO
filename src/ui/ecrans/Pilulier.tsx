/**
 * Pilulier — vue jour et vue semaine (maquette 1f/1g, spec §9).
 *
 * ⚠ R4 — aucune conduite à tenir en cas d'oubli. L'écran affiche l'heure
 * prévue et l'heure réelle, et renvoie à la notice ou au pharmacien.
 */

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { jourLocal } from '../../domain/cumul.js';
import { ajouterJours } from '../../domain/temps.js';
import type { GroupeAtc, Moment, Occurrence, Plan } from '../../domain/types.js';
import { baseDeDonnees } from '../../db/client.js';
import { maintenant } from '../App.js';
import { useMedco } from '../etat.js';
import { Bouton, Carte, EtatVide, TitreEcran } from '../composants/primitives.js';
import { PilulierJour, PilulierSemaine } from '../composants/pilulier.js';
import type { CelluleSemaine, OccurrenceAffichee } from '../composants/pilulier.js';
import styles from '../composants/composants.module.css';
import { Link } from 'react-router';

const RAPPEL_NOTICE =
  "En cas de prise oubliée, reportez-vous à la notice du médicament ou demandez conseil à votre pharmacien.";

function useDonneesPilulier(debut: string, fin: string): {
  moments: Moment[];
  occurrences: Occurrence[];
  plans: Plan[];
  recharger: () => void;
} {
  const { profilId, produits } = useMedco();
  const [moments, setMoments] = useState<Moment[]>([]);
  const [occurrences, setOccurrences] = useState<Occurrence[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [rang, setRang] = useState(0);

  useEffect(() => {
    if (!profilId) return;
    void Promise.all([
      baseDeDonnees.momentsDuProfil(profilId),
      baseDeDonnees.occurrencesEntre(profilId, debut, fin),
      baseDeDonnees.plansDuProfil(profilId),
    ]).then(([listeMoments, listeOccurrences, listePlans]) => {
      setMoments([...new Map(listeMoments as unknown as [string, Moment][]).values()]);
      setOccurrences(listeOccurrences);
      setPlans(listePlans);
    });
  }, [profilId, debut, fin, rang, produits]);

  return { moments, occurrences, plans, recharger: () => setRang((valeur) => valeur + 1) };
}

export function PilulierJourEcran(): ReactNode {
  const instant = maintenant();
  const jour = jourLocal(instant);
  const { profilId, produits, rafraichir } = useMedco();
  const { moments, occurrences, plans, recharger } = useDonneesPilulier(
    `${jour}T00:00:00+00:00`,
    `${ajouterJours(jour, 1)}T00:00:00+00:00`,
  );

  // Une occurrence porte un `plan_id` ; c'est le plan qui porte le produit.
  const produitDuPlan = useMemo(() => {
    const parProduit = new Map(produits.map((produit) => [produit.id, produit]));
    return new Map(plans.map((plan) => [plan.id, parProduit.get(plan.produitId) ?? null]));
  }, [plans, produits]);

  const blocs = useMemo(
    () =>
      moments.map((moment) => ({
        moment,
        occurrences: occurrences
          .filter((occurrence) => occurrence.momentId === moment.id)
          .map<OccurrenceAffichee>((occurrence) => {
            const produit = produitDuPlan.get(occurrence.planId) ?? null;
            return {
              occurrence,
              nomProduit: produit?.nomAffiche ?? 'Traitement',
              doseLibelle: `${occurrence.dose} ${produit?.unite ?? ''}`.trim(),
              groupe: '_' as GroupeAtc,
              codeSubstance: produit?.id ?? occurrence.planId,
            };
          }),
      })),
    [moments, occurrences, produitDuPlan],
  );

  async function valider(occurrence: Occurrence): Promise<void> {
    if (!profilId) return;
    const produitId = produitDuPlan.get(occurrence.planId)?.id;
    if (!produitId) return;
    const instantValidation = maintenant();
    await baseDeDonnees.validerOccurrences([
      {
        occurrence,
        prise: {
          id: crypto.randomUUID(),
          profilId,
          produitId,
          occurrenceId: occurrence.id,
          horodatage: instantValidation,
          fuseau: Intl.DateTimeFormat().resolvedOptions().timeZone,
          dose: occurrence.dose,
          saisieLe: instantValidation,
          source: 'manuelle',
        },
      },
    ]);
    recharger();
    await rafraichir(instantValidation);
  }

  /** « Tout valider » : une seule transaction sur toutes les occurrences (§9.3). */
  async function toutValider(momentId: string): Promise<void> {
    if (!profilId) return;
    const instantValidation = maintenant();
    const fuseau = Intl.DateTimeFormat().resolvedOptions().timeZone;

    const lot = occurrences
      .filter((occurrence) => occurrence.momentId === momentId && occurrence.statut === 'attendue')
      .flatMap((occurrence) => {
        const produitId = produitDuPlan.get(occurrence.planId)?.id;
        if (!produitId) return [];
        return [
          {
            occurrence,
            prise: {
              id: crypto.randomUUID(),
              profilId,
              produitId,
              occurrenceId: occurrence.id,
              horodatage: instantValidation,
              fuseau,
              dose: occurrence.dose,
              saisieLe: instantValidation,
              source: 'manuelle' as const,
            },
          },
        ];
      });

    if (lot.length === 0) return;
    await baseDeDonnees.validerOccurrences(lot);
    recharger();
    await rafraichir(instantValidation);
  }

  if (moments.length === 0) {
    return (
      <main className={styles['pileEcran']} style={{ paddingTop: 'var(--espace-10)' }}>
        <TitreEcran>Pilulier</TitreEcran>
      <Link className={styles['source']} to="/pilulier/preparer">
        Préparer la semaine →
      </Link>
        <EtatVide
          titre="Aucun traitement planifié."
          texte="Créez un plan de prise pour un produit."
          action={<Bouton variante="secondaire">Créer un plan</Bouton>}
        />
      </main>
    );
  }

  return (
    <main className={styles['pileEcran']} style={{ paddingTop: 'var(--espace-10)' }}>
      <TitreEcran>Pilulier</TitreEcran>
      <Carte>
        <PilulierJour
          blocs={blocs}
          onValider={(occurrence) => void valider(occurrence)}
          onSauter={(occurrence) => {
            void baseDeDonnees.sauterOccurrence(occurrence.id).then(recharger);
          }}
          onToutValider={(momentId) => void toutValider(momentId)}
        />
      </Carte>
      <p className={styles['meta']}>{RAPPEL_NOTICE}</p>
    </main>
  );
}

export function PilulierSemaineEcran(): ReactNode {
  const instant = maintenant();
  const jour = jourLocal(instant);
  const lundi = ajouterJours(jour, -((new Date(`${jour}T00:00:00Z`).getUTCDay() + 6) % 7));
  const { moments, occurrences } = useDonneesPilulier(
    `${lundi}T00:00:00+00:00`,
    `${ajouterJours(lundi, 7)}T00:00:00+00:00`,
  );

  const jours = Array.from({ length: 7 }, (_, index) => ajouterJours(lundi, index));
  const cellules = new Map<string, CelluleSemaine[]>();
  for (const occurrence of occurrences) {
    if (!occurrence.momentId) continue;
    const cle = `${occurrence.momentId}#${jourLocal(occurrence.prevueLe)}`;
    const liste = cellules.get(cle) ?? [];
    liste.push({ statut: occurrence.statut, groupe: '_' as GroupeAtc });
    cellules.set(cle, liste);
  }

  return (
    <main className={styles['pileEcran']} style={{ paddingTop: 'var(--espace-10)' }}>
      <TitreEcran>Semaine</TitreEcran>
      <Carte>
        <PilulierSemaine
          moments={moments}
          jours={jours.map((date) => ({ date, libelle: date.slice(8) }))}
          cellules={cellules}
          indexAujourdhui={jours.indexOf(jour)}
        />
      </Carte>
      <p className={styles['meta']}>{RAPPEL_NOTICE}</p>
    </main>
  );
}
