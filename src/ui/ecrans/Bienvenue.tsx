/**
 * Premier lancement : installation du catalogue, puis création du profil
 * (spec §6.1, §11.1).
 *
 * L'ordre compte. Le catalogue est téléchargé **avant** que le premier profil
 * n'existe : sans lui, aucune prise ne peut être décomposée en substances, et
 * une prise enregistrée sans cumul serait pire qu'une prise non enregistrée.
 */

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import { baseDeDonnees } from '../../db/client.js';
import { installerSiNecessaire } from '../../services/catalogue.js';
import type { EtapeInstallation } from '../../services/catalogue.js';
import { maintenant } from '../App.js';
import { Bouton, Carte, Etiquette, TitreEcran } from '../composants/primitives.js';
import styles from '../composants/composants.module.css';

export function Bienvenue({ onPret }: { readonly onPret: (profilId: string) => void }): ReactNode {
  const [etape, setEtape] = useState<EtapeInstallation>({ etat: 'installation' });
  const [nom, setNom] = useState('');
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    void installerSiNecessaire(import.meta.env.BASE_URL, setEtape);
  }, []);

  const catalogueDisponible = etape.etat === 'installe' || etape.etat === 'a-jour';

  async function creer(): Promise<void> {
    if (!nom.trim()) return;
    setEnCours(true);
    const id = crypto.randomUUID();
    try {
      await baseDeDonnees.creerProfil({
        id,
        nom: nom.trim(),
        couleur: null,
        creeLe: maintenant(),
      });
      onPret(id);
    } finally {
      setEnCours(false);
    }
  }

  return (
    <main className={styles['pileEcran']} style={{ paddingTop: 'var(--espace-13)' }}>
      <TitreEcran>Bienvenue</TitreEcran>

      <Carte>
        <Etiquette>Catalogue</Etiquette>
        <p className={styles['meta']}>{libelleEtape(etape)}</p>
        {etape.etat === 'telechargement' ? (
          <progress value={etape.recus} max={etape.total} style={{ width: '100%' }} />
        ) : null}
        {etape.etat === 'echec' ? (
          <Bouton
            variante="secondaire"
            onClick={() => void installerSiNecessaire(import.meta.env.BASE_URL, setEtape)}
          >
            Réessayer
          </Bouton>
        ) : null}
      </Carte>

      <Carte>
        <Etiquette>Profil</Etiquette>
        <p className={styles['meta']}>
          Un prénom suffit. Tout reste sur cet appareil ; rien n&apos;est transmis.
        </p>
        <input
          className={styles['champ']}
          value={nom}
          placeholder="Prénom"
          autoComplete="off"
          onChange={(evenement) => setNom(evenement.target.value)}
        />
        <div style={{ marginTop: 'var(--espace-8)' }}>
          <Bouton
            pleineLargeur
            disabled={!catalogueDisponible || !nom.trim() || enCours}
            onClick={() => void creer()}
          >
            Commencer
          </Bouton>
        </div>
      </Carte>
    </main>
  );
}

function libelleEtape(etape: EtapeInstallation): string {
  switch (etape.etat) {
    case 'telechargement':
      return `Téléchargement du catalogue… ${Math.round((etape.recus / etape.total) * 100)} %`;
    case 'installation':
      return 'Installation du catalogue…';
    case 'installe':
      return `Catalogue installé — données BDPM du ${new Date(etape.dateBdpm).toLocaleDateString('fr-FR')}.`;
    case 'a-jour':
      return 'Catalogue déjà installé et à jour.';
    case 'echec':
      return etape.raison;
  }
}
