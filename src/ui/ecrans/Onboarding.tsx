/**
 * Onboarding — 5 écrans (maquette 1o, spec §14.3, §11.1 et §11.2).
 *
 * ⚠ L'application **refuse de créer un profil** tant qu'elle n'est pas
 * installée sur l'écran d'accueil : sans installation, iOS n'a pas de Push API
 * et purge le stockage au bout de sept jours. Un journal de pilule dans un
 * onglet Safari est un piège. L'installation ferme donc la série.
 *
 * ⚠ L'écran 2 n'est pas passable — la maquette l'écrit : « Cet écran ne peut
 * pas être passé : c'est la définition du produit, pas une formalité. » Il ne
 * porte ni « Passer », ni retour.
 *
 * ⚠ CONTRADICTION SIGNALÉE, NON RECOPIÉE. La maquette fait dire à l'écran 3
 * « Tout reste sur cet appareil, chiffré ». Le carnet n'est **pas** chiffré :
 * le verrou par code barre l'accès, il ne transforme pas le stockage (§15, et
 * réserve explicite dans `docs/livraison.md`). L'écrire serait faux, sur un
 * sujet de sécurité. Le texte dit donc ce qui est vrai — dont le chiffrement
 * de la sauvegarde, lui bien réel. Consigné dans `manques.md` §1.7.
 */

import { useState } from 'react';
import type { ReactNode } from 'react';

import type { EtatInstallation } from '../../pwa/installation.js';
import { proposerInstallation } from '../../pwa/installation.js';
import { MotSymbole } from '../composants/marque.js';
import { Bouton, Carte, Etiquette, TitreEcran } from '../composants/primitives.js';
import styles from '../composants/composants.module.css';

/** Réponse à « Prenez-vous un traitement régulier ? » (écran 4). */
type Regularite = 'pilulier' | 'non' | 'proche';

export function Onboarding({
  installation,
  onReessayer,
}: {
  readonly installation: EtatInstallation;
  readonly onReessayer: () => void;
}): ReactNode {
  const [etape, setEtape] = useState(0);
  const [, setRegularite] = useState<Regularite | null>(null);

  const suivant = (): void => setEtape((precedente) => precedente + 1);

  const ecrans: ReactNode[] = [
    <>
      <MotSymbole taille="grande" />
      <TitreEcran>Enregistrez ce que vous prenez.</TitreEcran>
      <p>Le comptage se fait par substance active, pas par boîte. Deux appuis suffisent.</p>
      <Bouton pleineLargeur onClick={suivant}>
        Continuer
      </Bouton>
    </>,

    <>
      <Etiquette>Ce que l&apos;application ne fait pas</Etiquette>
      <TitreEcran>Elle ne donne pas de conseil médical.</TitreEcran>
      <p>
        Elle ne remplace pas un professionnel de santé et ne recommande aucun traitement. Elle
        compte, affiche, rappelle et imprime.
      </p>
      <Carte filet="information">
        <p className={styles['meta']}>
          Cet écran ne peut pas être passé : c&apos;est la définition du produit, pas une formalité.
        </p>
      </Carte>
      <Bouton pleineLargeur onClick={suivant}>
        J&apos;ai lu
      </Bouton>
    </>,

    <>
      <Etiquette>Vos données</Etiquette>
      <TitreEcran>Tout reste sur cet appareil.</TitreEcran>
      <p>
        Rien n&apos;est envoyé sur un serveur. Aucun compte n&apos;est demandé. La sauvegarde est
        une archive protégée par une phrase de passe que vous choisissez.
      </p>
      <p className={styles['meta']}>
        Un code protège l&apos;accès au carnet sur ce téléphone. Il n&apos;en chiffre pas le
        contenu : c&apos;est le chiffrement de l&apos;appareil, par iOS ou Android, qui s&apos;en
        charge.
      </p>
      <Bouton pleineLargeur onClick={suivant}>
        Continuer
      </Bouton>
    </>,

    <>
      <TitreEcran>Prenez-vous un traitement régulier ?</TitreEcran>
      <p className={styles['meta']}>
        Si oui, l&apos;application s&apos;ouvre sur le pilulier plutôt que sur le comptage du jour.
      </p>
      <div className={styles['choixOnboarding']}>
        {(
          [
            ['pilulier', 'Oui, créer un pilulier'],
            ['non', 'Non, pas pour l’instant'],
            ['proche', 'Je prépare celui d’un proche'],
          ] as const
        ).map(([valeur, libelle]) => (
          <Bouton
            key={valeur}
            variante="secondaire"
            pleineLargeur
            onClick={() => {
              setRegularite(valeur);
              suivant();
            }}
          >
            {libelle}
          </Bouton>
        ))}
      </div>
      <Bouton variante="texte" pleineLargeur onClick={suivant}>
        Passer
      </Bouton>
    </>,

    <>
      <Etiquette>Premier produit</Etiquette>
      <p className={styles['meta']}>
        Scannez le code-barres de la boîte, ou cherchez son nom dans la base BDPM — après
        l&apos;installation. Référentiel d&apos;environ 15 800 spécialités, disponible hors ligne.
      </p>
      <Installation installation={installation} onReessayer={onReessayer} />
    </>,
  ];

  return (
    <main className={styles['pileEcran']} style={{ paddingTop: 'var(--espace-13)' }}>
      <Progression etape={etape} total={ecrans.length} />
      {ecrans[etape]}
    </main>
  );
}

function Progression({
  etape,
  total,
}: {
  readonly etape: number;
  readonly total: number;
}): ReactNode {
  return (
    <div className={styles['progressionOnboarding']} aria-hidden="true">
      {Array.from({ length: total }, (_, index) => (
        <span
          key={index}
          className={`${styles['pointProgression']} ${index <= etape ? styles['pointProgressionFait'] : ''}`}
        />
      ))}
    </div>
  );
}

function Installation({
  installation,
  onReessayer,
}: {
  readonly installation: EtatInstallation;
  readonly onReessayer: () => void;
}): ReactNode {
  return (
    <>
      <TitreEcran>Installer Medco sur l&apos;écran d&apos;accueil</TitreEcran>
      <p>
        Le carnet ne se crée qu&apos;une fois l&apos;application installée. Dans un onglet de
        navigateur, les rappels ne peuvent pas être délivrés et les données peuvent être effacées
        sans préavis.
      </p>

      {installation.navigateurIntegre ? (
        <Carte filet="vigilance">
          <Etiquette>Navigateur intégré</Etiquette>
          <p className={styles['meta']}>
            Cette page est ouverte dans le navigateur d&apos;une autre application, qui ne propose
            pas l&apos;installation. Ouvrez le lien dans Safari, puis reprenez ici.
          </p>
        </Carte>
      ) : null}

      <Carte>
        <Etiquette>{installation.plateforme === 'ios' ? 'Sur iPhone' : 'Sur Android'}</Etiquette>
        {installation.plateforme === 'ios' ? (
          <ol>
            <li>Ouvrir cette page dans Safari.</li>
            <li>Toucher le bouton Partager.</li>
            <li>Choisir « Sur l&apos;écran d&apos;accueil ».</li>
          </ol>
        ) : (
          <ol>
            <li>Ouvrir le menu du navigateur.</li>
            <li>Choisir « Installer l&apos;application ».</li>
          </ol>
        )}
      </Carte>

      {installation.inviteDisponible ? (
        <Bouton pleineLargeur onClick={() => void proposerInstallation().then(onReessayer)}>
          Installer
        </Bouton>
      ) : (
        <Bouton variante="secondaire" pleineLargeur onClick={onReessayer}>
          J&apos;ai installé l&apos;application
        </Bouton>
      )}
    </>
  );
}
