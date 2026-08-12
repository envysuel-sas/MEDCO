/**
 * Réglages et Sources (maquette 1n, spec §11.8 et §6.6).
 *
 * La licence de la BDPM impose de **mentionner la source et sa date de mise à
 * jour** (§6.6). C'est cet écran qui les porte, et le pied du relevé PDF.
 */

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import { baseDeDonnees } from '../../db/client.js';
import { useMedco } from '../etat.js';
import { Carte, Etiquette, TitreEcran } from '../composants/primitives.js';
import styles from '../composants/composants.module.css';

export function Reglages(): ReactNode {
  const { regles } = useMedco();
  const [catalogue, setCatalogue] = useState<{ version: string; dateBdpm: string } | null>(null);

  useEffect(() => {
    void baseDeDonnees.versionCatalogue().then(setCatalogue);
  }, []);

  return (
    <main className={styles['pileEcran']} style={{ paddingTop: 'var(--espace-10)' }}>
      <TitreEcran>Réglages</TitreEcran>

      <Carte>
        <Etiquette>Sources</Etiquette>
        <p>
          Données BDPM du{' '}
          {catalogue ? new Date(catalogue.dateBdpm).toLocaleDateString('fr-FR') : '—'}
        </p>
        <p className={styles['meta']}>
          Base de données publique des médicaments (ANSM · HAS · UNCAM), licence ouverte. Codes ATC
          issus d&apos;Open Medic (Assurance Maladie), licence ouverte. Données non altérées.
        </p>
        <a
          className={styles['source']}
          href="https://base-donnees-publique.medicaments.gouv.fr/telechargement"
          target="_blank"
          rel="noreferrer noopener"
        >
          base-donnees-publique.medicaments.gouv.fr ↗
        </a>
      </Carte>

      <Carte>
        <Etiquette>Règles</Etiquette>
        <p className={styles['meta']}>
          {regles.length} repères chargés. Chacun porte sa source et sa date de consultation.
        </p>
      </Carte>

      <Carte>
        <Etiquette>Données</Etiquette>
        <p className={styles['meta']}>
          Tout est stocké sur cet appareil. Aucune donnée n&apos;est transmise. Une sauvegarde
          chiffrée est proposée toutes les deux semaines : une phrase de passe perdue rend
          l&apos;archive définitivement irrécupérable.
        </p>
      </Carte>
    </main>
  );
}
