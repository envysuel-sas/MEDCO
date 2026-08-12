/**
 * Onboarding et installation (maquette 1o, spec §11.1 et §11.2).
 *
 * ⚠ L'application **refuse de créer un profil** tant qu'elle n'est pas
 * installée sur l'écran d'accueil : sans installation, iOS n'a pas de Push API
 * et purge le stockage au bout de sept jours. Un journal de pilule dans un
 * onglet Safari est un piège.
 */

import type { ReactNode } from 'react';

import type { EtatInstallation } from '../../pwa/installation.js';
import { proposerInstallation } from '../../pwa/installation.js';
import { Bouton, Carte, Etiquette, TitreEcran } from '../composants/primitives.js';
import styles from '../composants/composants.module.css';

export function Onboarding({
  installation,
  onReessayer,
}: {
  readonly installation: EtatInstallation;
  readonly onReessayer: () => void;
}): ReactNode {
  return (
    <main className={styles['pileEcran']} style={{ paddingTop: 'var(--espace-13)' }}>
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
    </main>
  );
}
