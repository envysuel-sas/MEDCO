/**
 * Notice / RCP — intégralement en sérif (maquette 1j, spec §10.3).
 *
 * ⚠ LIMITE STRUCTURELLE, ASSUMÉE ET AFFICHÉE.
 *
 * La maquette montre le texte de la posologie mot pour mot. Ce texte **n'est
 * pas dans le bundle** : le pipeline ingère `CIS_bdpm.txt` et ses fichiers
 * frères, qui ne contiennent ni notice ni résumé des caractéristiques du
 * produit. Ces textes vivent sur le site de l'ANSM, page par page.
 *
 * Deux issues, et une seule est acceptable :
 *
 *  · fabriquer un texte plausible — exclu. Une posologie inventée sur un écran
 *    de médicament est exactement le genre de faute qui rend l'application plus
 *    dangereuse que son absence ;
 *  · afficher ce que l'on a réellement — identité de la spécialité, sommaire
 *    des rubriques officielles — et ouvrir la source. C'est ce qui est fait.
 *
 * L'écart est consigné dans `docs/maquette/manques.md` §5.6.
 *
 * ⚠ La maquette insiste : « Reproduit sans modification, sans surlignage ni
 * synthèse. » Reproduire suppose de détenir. Tant qu'on ne détient pas, on
 * renvoie — on ne résume pas, on ne paraphrase pas.
 */

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import { useParams } from 'react-router';

import { baseDeDonnees } from '../../db/client.js';
import { Carte, Etiquette, TitreEcran } from '../composants/primitives.js';
import styles from '../composants/composants.module.css';

/** Rubriques du RCP, dans l'ordre de la maquette. */
const RUBRIQUES = [
  'Indications',
  'Posologie',
  'Contre-indications',
  'Interactions',
  'Effets indésirables',
  'Grossesse et allaitement',
] as const;

interface Fiche {
  readonly cis: string;
  readonly nom: string;
  readonly substances: string;
  readonly dateBdpm: string;
}

export function Notice(): ReactNode {
  const { cis } = useParams<{ cis: string }>();
  const [fiche, setFiche] = useState<Fiche | null>(null);

  useEffect(() => {
    if (!cis) return;
    void (async () => {
      const [specialite, catalogue] = await Promise.all([
        baseDeDonnees.specialite(cis),
        baseDeDonnees.versionCatalogue(),
      ]);
      if (!specialite) return;
      setFiche({
        cis,
        nom: specialite.nom,
        substances: specialite.substances ?? '',
        dateBdpm: catalogue?.dateBdpm ?? '',
      });
    })();
  }, [cis]);

  if (!fiche) {
    return (
      <main className={styles['pileEcran']} style={{ paddingTop: 'var(--espace-10)' }}>
        <p className={styles['meta']}>Chargement…</p>
      </main>
    );
  }

  return (
    <main className={`${styles['pileEcran']} ${styles['notice']}`} style={{ paddingTop: 'var(--espace-10)' }}>
      <TitreEcran>{fiche.nom}</TitreEcran>
      <p className={styles['meta']}>{fiche.substances}</p>
      <p className={styles['mono']}>CIS {fiche.cis}</p>

      <Carte>
        <Etiquette>Rubriques officielles</Etiquette>
        <ul className={styles['rubriquesNotice']}>
          {RUBRIQUES.map((rubrique) => (
            <li key={rubrique}>{rubrique}</li>
          ))}
        </ul>
      </Carte>

      <Carte filet="information">
        <p className={styles['meta']}>
          Le texte de ces rubriques n&apos;est pas embarqué dans l&apos;application : le référentiel
          téléchargé contient les compositions et les présentations, pas les notices. Il est publié
          par l&apos;ANSM, spécialité par spécialité.
        </p>
        <p className={styles['meta']}>
          Il est reproduit sans modification, sans surlignage ni synthèse — donc consulté à la
          source, jamais résumé ici.
        </p>
      </Carte>

      <a
        className={styles['source']}
        href={`https://base-donnees-publique.medicaments.gouv.fr/extrait.php?specid=${fiche.cis}`}
        target="_blank"
        rel="noreferrer noopener"
      >
        Ouvrir la notice officielle ↗
      </a>

      <p className={styles['meta']}>
        Source Base de données publique des médicaments (ANSM · HAS · UNCAM)
        {fiche.dateBdpm ? ` · référentiel du ${new Date(fiche.dateBdpm).toLocaleDateString('fr-FR')}` : ''}
      </p>
    </main>
  );
}
