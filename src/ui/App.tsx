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

import { BaseDejaOuverte, baseDeDonnees } from '../db/client.js';
import { demanderPersistance, etatInstallation } from '../pwa/installation.js';
import { useMedco } from './etat.js';
import { Verrou } from './ecrans/Verrou.js';
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

/**
 * §15 — délai avant que l'application en arrière-plan se referme. Verrouiller
 * dès la mise en arrière-plan rendrait l'app pénible à l'usage : on consulte
 * une notice, on répond à un message, on revient. Deux minutes suffisent à
 * couvrir le téléphone posé sur une table.
 */
const DELAI_VERROUILLAGE_MS = 120_000;

export function App(): ReactNode {
  const { pret, secondOnglet, erreur, profilId, demarrer, choisirProfil } = useMedco();
  const [installation, setInstallation] = useState(etatInstallation);
  const [saisieOuverte, setSaisieOuverte] = useState(false);
  const [verrou, setVerrou] = useState<{ configure: boolean; ouvert: boolean } | null>(null);
  const [dejaOuverte, setDejaOuverte] = useState(false);
  const naviguer = useNavigate();

  // Le verrou est interrogé **avant** tout accès au carnet : `demarrer()` lit
  // les profils, que le Worker refuse tant que le code n'a pas été donné.
  useEffect(() => {
    void (async () => {
      try {
        const etat = await baseDeDonnees.verrouEtat();
        setVerrou({ configure: etat.configure, ouvert: etat.ouvert });
      } catch (cause) {
        if (cause instanceof BaseDejaOuverte) setDejaOuverte(true);
        else setVerrou({ configure: false, ouvert: false });
      }
    })();
    // §11.3 — la permission de persistance n'est pas durable : on la redemande.
    void demanderPersistance();
    setInstallation(etatInstallation());
  }, []);

  useEffect(() => {
    if (verrou?.ouvert) void demarrer(maintenant());
  }, [verrou?.ouvert, demarrer]);

  // §15 — la session se referme quand l'application quitte l'écran.
  useEffect(() => {
    if (!verrou?.ouvert) return undefined;
    let minuterie: ReturnType<typeof setTimeout> | undefined;

    const fermer = (): void => {
      void baseDeDonnees.verrouFermer();
      setVerrou((actuel) => (actuel ? { ...actuel, ouvert: false } : actuel));
    };
    const surVisibilite = (): void => {
      if (document.visibilityState === 'hidden') {
        minuterie = setTimeout(fermer, DELAI_VERROUILLAGE_MS);
      } else if (minuterie) {
        clearTimeout(minuterie);
        minuterie = undefined;
      }
    };

    document.addEventListener('visibilitychange', surVisibilite);
    return () => {
      document.removeEventListener('visibilitychange', surVisibilite);
      if (minuterie) clearTimeout(minuterie);
    };
  }, [verrou?.ouvert]);

  // `/kitchen-sink` est consultable sans installation : c'est la page comparée
  // à la maquette sur téléphone, dans un navigateur ordinaire.
  if (window.location.pathname.endsWith('/kitchen-sink')) return <KitchenSink />;

  if (secondOnglet || dejaOuverte) return <SecondOnglet />;

  // L'installation d'abord : sur iOS, un carnet dans un onglet Safari est purgé
  // au bout de sept jours. Poser un code sur des données condamnées serait un
  // faux confort.
  if (!installation.installee) {
    return <Onboarding installation={installation} onReessayer={() => setInstallation(etatInstallation())} />;
  }

  if (!verrou) return <Patiente />;
  if (!verrou.ouvert) {
    return (
      <Verrou
        aPoser={!verrou.configure}
        onOuvert={() => setVerrou({ configure: true, ouvert: true })}
      />
    );
  }

  if (!pret) return <Patiente />;

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
