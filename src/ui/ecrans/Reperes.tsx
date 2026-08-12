/**
 * Repères (maquette 1m, spec §11.7).
 *
 * ⚠ §12.3 — le mot est « repère », jamais « limite », « maximum » ni
 * « objectif ». Chaque repère est cité mot pour mot, avec sa source datée.
 * Atteint uniquement par appui délibéré : aucun repère ne s'impose à l'écran.
 */

import type { ReactNode } from 'react';

import { useMedco } from '../etat.js';
import { Carte, Etiquette, TitreEcran } from '../composants/primitives.js';
import { Citation } from '../composants/donnees.js';
import styles from '../composants/composants.module.css';

export function Reperes(): ReactNode {
  const { regles } = useMedco();

  return (
    <main className={styles['pileEcran']} style={{ paddingTop: 'var(--espace-10)' }}>
      <TitreEcran>Repères</TitreEcran>
      <p className={styles['meta']}>
        Les repères publiés par les autorités de santé, cités tels quels. Ils ne décrivent pas
        votre situation.
      </p>

      {regles.map((regle) => (
        <Carte key={regle.id}>
          <Etiquette>{regle.cible.libelle ?? regle.id}</Etiquette>
          <p className={styles['chiffreSecondaire']}>
            {regle.seuil} {regle.unite}
          </p>
          <Citation texte={regle.citation} />
          <a
            className={styles['source']}
            href={regle.source.url}
            target="_blank"
            rel="noreferrer noopener"
          >
            {regle.source.libelle} · consultée le{' '}
            {new Date(regle.source.consulte_le).toLocaleDateString('fr-FR')} ↗
          </a>
        </Carte>
      ))}
    </main>
  );
}
