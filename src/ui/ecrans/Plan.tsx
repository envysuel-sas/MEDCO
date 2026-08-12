/**
 * Création d'un plan de prise (spec §9.2).
 *
 * Trois modes, comme la spec : moments du profil, heures absolues, intervalle.
 * Le cycle 21/7 est proposé explicitement — c'est le cas de la pilule
 * combinée, et RFC 5545 ne sait pas l'exprimer autrement (§10.4).
 *
 * ⚠ R4 — aucune conduite à tenir en cas d'oubli n'est proposée ici, ni
 * ailleurs.
 */

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router';

import type { Moment, Plan as PlanDomaine, Produit } from '../../domain/types.js';
import { baseDeDonnees } from '../../db/client.js';
import { regenererPlan } from '../../services/pilulier.js';
import { maintenant } from '../App.js';
import { FUSEAU, useMedco } from '../etat.js';
import { Bouton, Carte, Chip, Etiquette, TitreEcran } from '../composants/primitives.js';
import styles from '../composants/composants.module.css';

type ModePlan = PlanDomaine['mode'];

export function Plan(): ReactNode {
  const { produitId } = useParams();
  const naviguer = useNavigate();
  const { profilId } = useMedco();

  const [produit, setProduit] = useState<Produit | null>(null);
  const [moments, setMoments] = useState<Moment[]>([]);
  const [mode, setMode] = useState<ModePlan>('moments');
  const [choisis, setChoisis] = useState<string[]>([]);
  const [heure, setHeure] = useState('21:00');
  const [intervalle, setIntervalle] = useState(8);
  const [cycle, setCycle] = useState(false);
  const [dose, setDose] = useState(1);
  const [rappel, setRappel] = useState(true);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    if (!produitId || !profilId) return;
    void baseDeDonnees.produit(produitId).then(setProduit);
    void baseDeDonnees
      .momentsDuProfil(profilId)
      .then((table) => setMoments([...new Map(table as unknown as [string, Moment][]).values()]));
  }, [produitId, profilId]);

  async function enregistrer(): Promise<void> {
    if (!produitId || !profilId) return;
    setEnCours(true);
    const instant = maintenant();
    try {
      const plan: PlanDomaine = {
        id: crypto.randomUUID(),
        produitId,
        profilId,
        mode,
        // ⚠ X-CYCLE est une extension : RFC 5545 ne sait pas exprimer 21/7.
        rrule: cycle ? 'FREQ=DAILY;X-CYCLE=21/7' : 'FREQ=DAILY',
        moments: mode === 'moments' ? choisis : null,
        heures: mode === 'heures' ? [heure] : null,
        intervalleH: mode === 'intervalle' ? intervalle : null,
        dose,
        debut: instant,
        fin: null,
        rappel,
      };
      await baseDeDonnees.enregistrerPlan(plan);
      const table = new Map(moments.map((moment) => [moment.id, moment]));
      await regenererPlan(plan, table, instant, FUSEAU());
      naviguer('/pilulier');
    } finally {
      setEnCours(false);
    }
  }

  return (
    <main className={styles['pileEcran']} style={{ paddingTop: 'var(--espace-10)' }}>
      <TitreEcran>Plan de prise</TitreEcran>
      <p className={styles['meta']}>{produit?.nomAffiche ?? '—'}</p>

      <Carte>
        <Etiquette>Rythme</Etiquette>
        <div style={{ display: 'flex', gap: 'var(--espace-4)', flexWrap: 'wrap', marginTop: 'var(--espace-5)' }}>
          <Chip actif={mode === 'moments'} onClick={() => setMode('moments')}>
            Moments de la journée
          </Chip>
          <Chip actif={mode === 'heures'} onClick={() => setMode('heures')}>
            Heure fixe
          </Chip>
          <Chip actif={mode === 'intervalle'} onClick={() => setMode('intervalle')}>
            Toutes les N heures
          </Chip>
        </div>

        {mode === 'moments' ? (
          <div style={{ display: 'flex', gap: 'var(--espace-4)', flexWrap: 'wrap', marginTop: 'var(--espace-8)' }}>
            {moments.map((moment) => (
              <Chip
                key={moment.id}
                actif={choisis.includes(moment.id)}
                onClick={() =>
                  setChoisis((precedent) =>
                    precedent.includes(moment.id)
                      ? precedent.filter((id) => id !== moment.id)
                      : [...precedent, moment.id],
                  )
                }
              >
                {moment.libelle} · {moment.heure}
              </Chip>
            ))}
          </div>
        ) : null}

        {mode === 'heures' ? (
          <input
            type="time"
            className={styles['champ']}
            value={heure}
            onChange={(evenement) => setHeure(evenement.target.value)}
            aria-label="Heure de la prise"
            style={{ marginTop: 'var(--espace-8)' }}
          />
        ) : null}

        {mode === 'intervalle' ? (
          <input
            type="number"
            className={styles['champ']}
            value={intervalle}
            min={1}
            max={24}
            onChange={(evenement) => setIntervalle(Number(evenement.target.value))}
            aria-label="Intervalle en heures"
            style={{ marginTop: 'var(--espace-8)' }}
          />
        ) : null}
      </Carte>

      <Carte>
        <Etiquette>Cycle</Etiquette>
        <p className={styles['meta']}>
          Certaines plaquettes s&apos;interrompent sept jours après vingt-et-un jours de prise.
        </p>
        <div style={{ display: 'flex', gap: 'var(--espace-4)', marginTop: 'var(--espace-5)' }}>
          <Chip actif={!cycle} onClick={() => setCycle(false)}>
            Tous les jours
          </Chip>
          <Chip actif={cycle} onClick={() => setCycle(true)}>
            21 jours puis 7 jours d&apos;arrêt
          </Chip>
        </div>
      </Carte>

      <Carte>
        <Etiquette>Dose et rappel</Etiquette>
        <input
          type="number"
          className={styles['champ']}
          value={dose}
          min={0.5}
          step={0.5}
          onChange={(evenement) => setDose(Number(evenement.target.value))}
          aria-label="Dose par prise"
        />
        <div style={{ display: 'flex', gap: 'var(--espace-4)', marginTop: 'var(--espace-5)' }}>
          <Chip actif={rappel} onClick={() => setRappel(true)}>
            Rappel actif
          </Chip>
          <Chip actif={!rappel} onClick={() => setRappel(false)}>
            Sans rappel
          </Chip>
        </div>
      </Carte>

      <Bouton
        pleineLargeur
        disabled={enCours || (mode === 'moments' && choisis.length === 0)}
        onClick={() => void enregistrer()}
      >
        Créer le plan
      </Bouton>
    </main>
  );
}
