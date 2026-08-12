/**
 * Primitives — boutons, étiquettes, cartes, champs, feuille modale.
 *
 * ⚠ Aucune valeur en dur : tout passe par `composants.module.css`, qui ne
 * consomme lui-même que des jetons de `../tokens.css`.
 */

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { useEffect, useRef } from 'react';

import styles from './composants.module.css';

export type Niveau = 'information' | 'vigilance' | 'attention';

// --- Bouton ---------------------------------------------------------------

interface ProprietesBouton extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variante?: 'primaire' | 'secondaire' | 'texte';
  readonly pleineLargeur?: boolean;
}

export function Bouton({
  variante = 'primaire',
  pleineLargeur = false,
  className,
  children,
  ...reste
}: ProprietesBouton): ReactNode {
  const classes = [
    styles['bouton'],
    variante === 'secondaire' ? styles['secondaire'] : '',
    variante === 'texte' ? styles['texte'] : '',
    pleineLargeur ? styles['pleineLargeur'] : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button type="button" className={classes} {...reste}>
      {children}
    </button>
  );
}

// --- Pas (− / +) -----------------------------------------------------------

export function Pas({
  sens,
  ...reste
}: { readonly sens: 'moins' | 'plus' } & ButtonHTMLAttributes<HTMLButtonElement>): ReactNode {
  return (
    <button
      type="button"
      className={styles['pas']}
      aria-label={sens === 'moins' ? 'Diminuer la dose' : 'Augmenter la dose'}
      {...reste}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        {sens === 'plus' && <path d="M8 1v14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
        <path d="M1 8h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </button>
  );
}

// --- Étiquette de section ---------------------------------------------------

export function Etiquette({ children }: { readonly children: ReactNode }): ReactNode {
  return <div className={styles['etiquette']}>{children}</div>;
}

export function TitreEcran({ children }: { readonly children: ReactNode }): ReactNode {
  return <h1 className={styles['titreEcran']}>{children}</h1>;
}

// --- Carte -------------------------------------------------------------------

const FILET: Readonly<Record<Niveau, string>> = {
  information: styles['filetInformation'] ?? '',
  vigilance: styles['filetVigilance'] ?? '',
  attention: styles['filetAttention'] ?? '',
};

export function Carte({
  filet,
  children,
  ...reste
}: {
  readonly filet?: Niveau;
  readonly children: ReactNode;
} & React.HTMLAttributes<HTMLElement>): ReactNode {
  return (
    <section className={[styles['carte'], filet ? FILET[filet] : ''].filter(Boolean).join(' ')} {...reste}>
      {children}
    </section>
  );
}

// --- Chip ---------------------------------------------------------------------

export function Chip({
  actif = false,
  children,
  ...reste
}: { readonly actif?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>): ReactNode {
  return (
    <button
      type="button"
      aria-pressed={actif}
      className={[styles['chip'], actif ? styles['chipActif'] : ''].filter(Boolean).join(' ')}
      {...reste}
    >
      {children}
    </button>
  );
}

// --- Champ de recherche ---------------------------------------------------------

export function ChampRecherche(props: InputHTMLAttributes<HTMLInputElement>): ReactNode {
  return <input type="search" className={styles['champ']} {...props} />;
}

// --- État vide --------------------------------------------------------------------

export function EtatVide({
  titre,
  texte,
  action,
}: {
  readonly titre: string;
  readonly texte?: string;
  readonly action?: ReactNode;
}): ReactNode {
  return (
    <div className={styles['etatVide']}>
      <p className={styles['etatVideTitre']}>{titre}</p>
      {texte ? <p className={styles['meta']}>{texte}</p> : null}
      {action}
    </div>
  );
}

// --- Feuille modale ------------------------------------------------------------------

export function Feuille({
  ouverte,
  titre,
  onFermer,
  enTeteSecondaire,
  children,
}: {
  readonly ouverte: boolean;
  readonly titre: string;
  readonly onFermer: () => void;
  readonly enTeteSecondaire?: ReactNode;
  readonly children: ReactNode;
}): ReactNode {
  const feuille = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ouverte) return undefined;
    // Le bouton retour d'Android éjecte de l'app si l'historique n'est pas
    // géré explicitement (§11.4) : la feuille consomme une entrée.
    const fermerAuRetour = (): void => onFermer();
    window.addEventListener('popstate', fermerAuRetour);
    window.history.pushState({ feuille: titre }, '');
    feuille.current?.focus();
    return () => {
      window.removeEventListener('popstate', fermerAuRetour);
    };
  }, [ouverte, onFermer, titre]);

  if (!ouverte) return null;
  return (
    <>
      <button type="button" className={styles['voile']} aria-label="Fermer" onClick={onFermer} />
      <div
        ref={feuille}
        className={styles['feuille']}
        role="dialog"
        aria-modal="true"
        aria-label={titre}
        tabIndex={-1}
      >
        <div className={styles['feuilleEntete']}>
          <Etiquette>{titre}</Etiquette>
          {enTeteSecondaire}
        </div>
        {children}
      </div>
    </>
  );
}
