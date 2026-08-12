/**
 * Scan du Datamatrix (maquette absente, spec §13).
 *
 * ⚠ Le scan est un **confort**. Trois chemins équivalents en permanence :
 * scan, recherche texte, saisie libre. Une caméra refusée ne dégrade aucun
 * parcours — l'écran propose alors la recherche, sans insister.
 *
 * ⚠ Le numéro de série et le lot ne sont ni stockés ni transmis : `lireGs1`
 * ne les expose pas.
 */

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';

import type { ResultatRecherche } from '../../db/depots.js';
import { baseDeDonnees } from '../../db/client.js';
import { scanner } from '../../services/scan.js';
import { maintenant } from '../App.js';
import { useMedco } from '../etat.js';
import { Bouton, Carte, Etiquette, TitreEcran } from '../composants/primitives.js';
import { LigneResultat } from '../composants/donnees.js';
import styles from '../composants/composants.module.css';

export function Scan(): ReactNode {
  const video = useRef<HTMLVideoElement>(null);
  const naviguer = useNavigate();
  const { profilId, rafraichir } = useMedco();

  const [trouve, setTrouve] = useState<ResultatRecherche | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const abandon = new AbortController();
    const element = video.current;
    if (!element) return undefined;

    void (async () => {
      const resultat = await scanner(element, abandon.signal);
      switch (resultat.etat) {
        case 'trouve': {
          const specialite = await baseDeDonnees.specialiteParCip13(resultat.code.cip13!);
          if (specialite) setTrouve(specialite);
          else setMessage("Cette boîte n'est pas dans le catalogue. La recherche par nom reste possible.");
          break;
        }
        case 'camera-refusee':
          setMessage('Caméra indisponible. La recherche par nom donne le même résultat.');
          break;
        case 'indisponible':
          setMessage('Ce navigateur ne sait pas lire les Datamatrix. Utilisez la recherche par nom.');
          break;
        case 'annule':
          break;
      }
    })();

    return () => abandon.abort();
  }, []);

  async function ajouter(): Promise<void> {
    if (!trouve || !profilId) return;
    const id = crypto.randomUUID();
    await baseDeDonnees.creerProduit({
      id,
      profilId,
      cis: trouve.cis,
      cip13: null,
      element: null,
      nomAffiche: trouve.nom,
      mode: trouve.prescription === 'PMO' ? 'prescrit' : 'libre',
      doseDefaut: 1,
      unite: null,
      creeLe: maintenant(),
    });
    await rafraichir(maintenant());
    naviguer(`/produits/${id}`);
  }

  return (
    <main className={styles['pileEcran']} style={{ paddingTop: 'var(--espace-10)' }}>
      <TitreEcran>Scanner une boîte</TitreEcran>

      <Carte>
        <video
          ref={video}
          playsInline
          muted
          style={{ width: '100%', borderRadius: 'var(--rayon-chip)', background: 'var(--surface-creux)' }}
        />
        <p className={styles['meta']}>
          Visez le carré de points imprimé sur la boîte. Ni le lot ni le numéro de série ne sont
          conservés.
        </p>
      </Carte>

      {trouve ? (
        <Carte>
          <Etiquette>Boîte reconnue</Etiquette>
          <LigneResultat
            nom={trouve.nom}
            substances={trouve.substances}
            prescription={trouve.prescription}
            commercialisee={trouve.commercialisee}
            onChoisir={() => void ajouter()}
          />
          <Bouton pleineLargeur onClick={() => void ajouter()}>
            Ajouter à mes produits
          </Bouton>
        </Carte>
      ) : null}

      {message ? (
        <Carte filet="information">
          <p className={styles['meta']}>{message}</p>
          <Bouton variante="secondaire" onClick={() => naviguer('/produits')}>
            Chercher par nom
          </Bouton>
        </Carte>
      ) : null}
    </main>
  );
}
