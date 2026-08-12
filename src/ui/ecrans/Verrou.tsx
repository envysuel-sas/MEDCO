/**
 * Écran de verrou — pose du code au premier lancement, puis ouverture (§15).
 *
 * ⚠ Écran absent de la maquette : recomposé à partir des composants et des
 * jetons existants, sans introduire de motif visuel nouveau. Le pavé reprend
 * la géométrie de l'alvéole, les points d'état celle des points d'occurrence.
 * Consigné dans `docs/maquette/manques.md` §2.8.
 *
 * ⚠ §12.1 — aucun rouge, aucun triangle. Un code faux se dit en toutes
 * lettres, dans l'encre du texte.
 *
 * ⚠ Ne jamais écrire ici que les données sont « chiffrées » : elles ne le sont
 * pas. Le verrou barre l'accès, il ne transforme pas le stockage.
 */

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import { LONGUEUR_MAX, LONGUEUR_MIN } from '../../db/verrou.js';
import { baseDeDonnees } from '../../db/client.js';
import { MotSymbole } from '../composants/marque.js';
import { Etiquette, TitreEcran } from '../composants/primitives.js';
import styles from '../composants/composants.module.css';

type Etape = 'pose' | 'confirmation' | 'ouverture';

export interface ProprietesVerrou {
  /** `true` au premier lancement sur l'appareil : il faut poser un code. */
  readonly aPoser: boolean;
  readonly onOuvert: () => void;
}

export function Verrou({ aPoser, onOuvert }: ProprietesVerrou): ReactNode {
  const [etape, setEtape] = useState<Etape>(aPoser ? 'pose' : 'ouverture');
  const [saisie, setSaisie] = useState('');
  const [premier, setPremier] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);

  // La dérivation Argon2id prend une demi-seconde : elle se déclenche seule
  // quand le code atteint sa longueur, sans bouton à chercher.
  useEffect(() => {
    if (occupe) return;
    if (etape === 'pose' && saisie.length >= LONGUEUR_MIN) return;
    if (etape === 'confirmation' && saisie.length === premier.length) void confirmer();
    if (etape === 'ouverture' && saisie.length >= LONGUEUR_MIN) void ouvrir();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saisie]);

  async function confirmer(): Promise<void> {
    if (saisie !== premier) {
      setMessage('Les deux codes ne correspondent pas. Recommencez.');
      setPremier('');
      setSaisie('');
      setEtape('pose');
      return;
    }
    setOccupe(true);
    try {
      await baseDeDonnees.verrouDefinir(premier);
      onOuvert();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : String(cause));
      setPremier('');
      setSaisie('');
      setEtape('pose');
    } finally {
      setOccupe(false);
    }
  }

  async function ouvrir(): Promise<void> {
    setOccupe(true);
    try {
      if (await baseDeDonnees.verrouOuvrir(saisie)) {
        onOuvert();
        return;
      }
      const etat = await baseDeDonnees.verrouEtat();
      setMessage(
        etat.attenteMs > 0
          ? `Code incorrect. Prochain essai dans ${Math.round(etat.attenteMs / 1000)} secondes.`
          : 'Code incorrect.',
      );
      setSaisie('');
    } finally {
      setOccupe(false);
    }
  }

  function taper(chiffre: string): void {
    setMessage(null);
    setSaisie((actuelle) => (actuelle.length >= LONGUEUR_MAX ? actuelle : actuelle + chiffre));
  }

  function valider(): void {
    if (saisie.length < LONGUEUR_MIN) return;
    setPremier(saisie);
    setSaisie('');
    setMessage(null);
    setEtape('confirmation');
  }

  const longueurAffichee = etape === 'confirmation' ? premier.length : Math.max(saisie.length, LONGUEUR_MIN);

  return (
    <main className={styles['verrou']}>
      <div className={styles['verrouEntete']}>
        {etape === 'ouverture' ? <MotSymbole /> : <Etiquette>Premier lancement</Etiquette>}
        <TitreEcran>
          {etape === 'pose' ? 'Choisissez un code' : null}
          {etape === 'confirmation' ? 'Saisissez-le à nouveau' : null}
          {etape === 'ouverture' ? 'Votre code' : null}
        </TitreEcran>
        <p className={styles['meta']}>
          {etape === 'ouverture'
            ? 'Le carnet reste sur cet appareil. Aucun compte, rien à retenir d’autre.'
            : `De ${LONGUEUR_MIN} à ${LONGUEUR_MAX} chiffres. Il protège le carnet sur ce téléphone ; il ne se récupère pas et ne se transmet nulle part.`}
        </p>
      </div>

      <div className={styles['verrouPoints']} aria-hidden="true">
        {Array.from({ length: longueurAffichee }, (_, index) => (
          <span
            key={index}
            className={`${styles['verrouPoint']} ${index < saisie.length ? styles['verrouPointRempli'] : ''}`}
          />
        ))}
      </div>

      <p className={styles['meta']} role="status" style={{ minHeight: 'var(--interligne-meta)' }}>
        {occupe ? 'Vérification…' : (message ?? '')}
      </p>

      <div className={styles['verrouPave']}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((chiffre) => (
          <button
            key={chiffre}
            type="button"
            className={styles['verrouTouche']}
            disabled={occupe}
            onClick={() => taper(chiffre)}
          >
            {chiffre}
          </button>
        ))}

        {etape === 'pose' && saisie.length >= LONGUEUR_MIN ? (
          <button
            type="button"
            className={`${styles['verrouTouche']} ${styles['verrouToucheTexte']}`}
            disabled={occupe}
            onClick={valider}
          >
            Suivant
          </button>
        ) : (
          <span className={`${styles['verrouTouche']} ${styles['verrouToucheVide']}`} />
        )}

        <button
          type="button"
          className={styles['verrouTouche']}
          disabled={occupe}
          onClick={() => taper('0')}
        >
          0
        </button>

        <button
          type="button"
          className={`${styles['verrouTouche']} ${styles['verrouToucheTexte']}`}
          disabled={occupe || saisie.length === 0}
          aria-label="Effacer le dernier chiffre"
          onClick={() => setSaisie((actuelle) => actuelle.slice(0, -1))}
        >
          Effacer
        </button>
      </div>
    </main>
  );
}
