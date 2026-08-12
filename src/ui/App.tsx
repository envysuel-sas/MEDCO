/**
 * Coquille de l'application : garde-fous d'ouverture, routage, barre d'onglets.
 *
 * Deux refus assumés avant tout écran :
 *  · §5.5 — un second onglet ne peut pas ouvrir la base ;
 *  · §11.1 — sans installation sur l'écran d'accueil, aucun profil n'est créé.
 */

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router';

import { demanderPersistance, etatInstallation } from '../pwa/installation.js';
import { useMedco } from './etat.js';
import { BarreOnglets } from './composants/chrome.js';
import { Bouton, Carte, TitreEcran } from './composants/primitives.js';
import { Aujourdhui } from './ecrans/Aujourdhui.js';
import { Saisie } from './ecrans/Saisie.js';
import { Produits } from './ecrans/Produits.js';
import { PilulierJourEcran, PilulierSemaineEcran } from './ecrans/Pilulier.js';
import { Reperes } from './ecrans/Reperes.js';
import { Reglages } from './ecrans/Reglages.js';
import { Onboarding } from './ecrans/Onboarding.js';
import { Bienvenue } from './ecrans/Bienvenue.js';
import { Produit } from './ecrans/Produit.js';
import { Substance } from './ecrans/Substance.js';
import { Plan } from './ecrans/Plan.js';
import { Scan } from './ecrans/Scan.js';
import { KitchenSink } from './ecrans/KitchenSink.js';
import styles from './composants/composants.module.css';

/** L'instant est injecté partout : le domaine ne lit jamais l'horloge. */
export function maintenant(): string {
  const date = new Date();
  const decalage = -date.getTimezoneOffset();
  const signe = decalage >= 0 ? '+' : '-';
  const deuxChiffres = (valeur: number): string => String(Math.floor(Math.abs(valeur))).padStart(2, '0');
  return (
    new Date(date.getTime() + decalage * 60_000).toISOString().slice(0, 19) +
    `${signe}${deuxChiffres(decalage / 60)}:${deuxChiffres(decalage % 60)}`
  );
}

export function App(): ReactNode {
  const { pret, secondOnglet, erreur, profilId, demarrer, choisirProfil } = useMedco();
  const [installation, setInstallation] = useState(etatInstallation);
  const [saisieOuverte, setSaisieOuverte] = useState(false);
  const naviguer = useNavigate();

  useEffect(() => {
    void demarrer(maintenant());
    // §11.3 — la permission de persistance n'est pas durable : on la redemande.
    void demanderPersistance();
    setInstallation(etatInstallation());
  }, [demarrer]);

  // `/kitchen-sink` est consultable sans installation : c'est la page comparée
  // à la maquette sur téléphone, dans un navigateur ordinaire.
  if (window.location.pathname.endsWith('/kitchen-sink')) return <KitchenSink />;

  if (secondOnglet) return <SecondOnglet />;
  if (!pret) return <Patiente />;

  if (!installation.installee) {
    return <Onboarding installation={installation} onReessayer={() => setInstallation(etatInstallation())} />;
  }

  // Premier lancement : catalogue puis profil, dans cet ordre.
  if (!profilId) {
    return <Bienvenue onPret={(id) => void choisirProfil(id, maintenant())} />;
  }

  return (
    <div className={styles['pileEcran']} style={{ padding: 0, gap: 0 }}>
      {erreur ? (
        <Carte filet="information">
          <p className={styles['meta']}>{erreur}</p>
        </Carte>
      ) : null}

      <Routes>
        <Route path="/" element={<Aujourdhui />} />
        <Route path="/pilulier" element={<PilulierJourEcran />} />
        <Route path="/pilulier/semaine" element={<PilulierSemaineEcran />} />
        <Route path="/produits" element={<Produits />} />
        <Route path="/produits/:produitId" element={<Produit />} />
        <Route path="/substances/:code" element={<Substance />} />
        <Route path="/plans/:produitId" element={<Plan />} />
        <Route path="/scan" element={<Scan />} />
        <Route path="/reperes" element={<Reperes />} />
        <Route path="/reglages" element={<Reglages />} />
        <Route path="/kitchen-sink" element={<KitchenSink />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <Saisie ouverte={saisieOuverte} onFermer={() => setSaisieOuverte(false)} />
      <BarreOnglets
        onSaisie={() => {
          setSaisieOuverte(true);
          // §11.4 — l'historique est géré explicitement, sans quoi le bouton
          // retour d'Android éjecte de l'application.
          naviguer('.', { replace: false });
        }}
      />
    </div>
  );
}

function Patiente(): ReactNode {
  return (
    <main className={styles['pileEcran']}>
      <p className={styles['meta']}>Ouverture…</p>
    </main>
  );
}

/** §5.5 — le VFS prend un verrou exclusif : une seule fenêtre à la fois. */
function SecondOnglet(): ReactNode {
  return (
    <main className={styles['pileEcran']} style={{ paddingTop: 'var(--espace-13)' }}>
      <TitreEcran>L&apos;application est déjà ouverte dans un autre onglet</TitreEcran>
      <p className={styles['meta']}>
        Une seule fenêtre peut accéder au carnet à la fois. Fermez l&apos;autre onglet, puis
        rechargez cette page.
      </p>
      <Bouton onClick={() => window.location.reload()}>Recharger</Bouton>
    </main>
  );
}
