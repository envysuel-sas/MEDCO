/**
 * Chrome d'application — en-tête et barre d'onglets.
 *
 * La barre reprend la géométrie du composant `MedcoTabBar` de la maquette :
 * cinq colonnes, l'action de saisie au centre. Les icônes sont redessinées en
 * SVG inline plutôt que reprises du markup exporté, conformément au protocole.
 */

import type { ReactNode } from 'react';
import { NavLink } from 'react-router';

import styles from './composants.module.css';

/**
 * En-tête d'application.
 *
 * Deux variantes, et une seule est montée à la fois par la coquille :
 *
 *  · `profil` — écrans de premier niveau. La maquette veut le nom du profil à
 *    cet emplacement, **pas** le mot-symbole.
 *  · `retour` — écrans de détail. Sans elle, ces écrans sont des culs-de-sac :
 *    ni retour, ni accès aux réglages.
 */
export function EnTete({
  variante = 'profil',
  profil,
  couleurProfil,
  onProfil,
  onRetour,
  onReglages,
}: {
  readonly variante?: 'profil' | 'retour';
  readonly profil?: string;
  readonly couleurProfil?: string;
  readonly onProfil?: () => void;
  readonly onRetour?: () => void;
  readonly onReglages?: () => void;
}): ReactNode {
  if (variante === 'retour') {
    return (
      <header className={styles['enTete']}>
        <button type="button" className={styles['retour']} onClick={onRetour}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M15 5l-7 7 7 7"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Retour
        </button>
        <BoutonReglages onReglages={onReglages} />
      </header>
    );
  }

  return (
    <header className={styles['enTete']}>
      <button type="button" className={styles['profil']} onClick={onProfil}>
        <span
          className={styles['pastille']}
          style={{ background: couleurProfil, width: 'var(--espace-5)', height: 'var(--espace-5)' }}
        />
        {profil ?? 'Profil'}
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden="true">
          <path
            d="M1 1l4 4 4-4"
            stroke="var(--encre-3)"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>
      <BoutonReglages onReglages={onReglages} />
    </header>
  );
}

function BoutonReglages({ onReglages }: { readonly onReglages?: (() => void) | undefined }): ReactNode {
  return (
    <button type="button" className={styles['icone']} aria-label="Réglages" onClick={onReglages}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M12 3.5v3M12 17.5v3M4.5 12h3M16.5 12h3M6.7 6.7l2.1 2.1M15.2 15.2l2.1 2.1M17.3 6.7l-2.1 2.1M8.8 15.2l-2.1 2.1"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}

function IconeAujourdhui(): ReactNode {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {[0, 1, 2].map((ligne) =>
        [0, 1, 2].map((colonne) => (
          <rect
            key={`${ligne}-${colonne}`}
            x={4 + colonne * 5.7}
            y={4 + ligne * 5.7}
            width="4.6"
            height="4.6"
            rx="1.2"
            fill={ligne === 0 && colonne === 1 ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="1.5"
          />
        )),
      )}
    </svg>
  );
}

function IconePilulier(): ReactNode {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="6" width="18" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7.5 6v12M12 6v12M16.5 6v12M3 12h18" stroke="currentColor" strokeWidth="1.2" opacity="0.75" />
    </svg>
  );
}

function IconeProduits(): ReactNode {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.5" y="4.5" width="17" height="6" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <rect x="3.5" y="13.5" width="17" height="6" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M13.5 7.5h3.5M13.5 16.5h3.5" stroke="currentColor" strokeWidth="1.2" opacity="0.7" />
    </svg>
  );
}

function IconeReperes(): ReactNode {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5.5 4.5h13v15l-6.5-4-6.5 4v-15z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M8.8 9h6.4" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

const ONGLETS = [
  { chemin: '/', libelle: "Aujourd'hui", Icone: IconeAujourdhui },
  { chemin: '/pilulier', libelle: 'Pilulier', Icone: IconePilulier },
  { chemin: '/produits', libelle: 'Produits', Icone: IconeProduits },
  { chemin: '/reperes', libelle: 'Repères', Icone: IconeReperes },
] as const;

/**
 * Cinq colonnes, l'action de saisie au centre.
 * §12.4 — enregistrer une prise en moins de cinq secondes, deux appuis.
 */
export function BarreOnglets({ onSaisie }: { readonly onSaisie: () => void }): ReactNode {
  const [aujourdhui, pilulier, produits, reperes] = ONGLETS;
  return (
    <nav className={styles['barreOnglets']} aria-label="Navigation principale">
      {[aujourdhui, pilulier].map(({ chemin, libelle, Icone }) => (
        <NavLink
          key={chemin}
          to={chemin}
          end={chemin === '/'}
          className={({ isActive }) =>
            [styles['onglet'], isActive ? styles['ongletActif'] : ''].filter(Boolean).join(' ')
          }
        >
          <Icone />
          <span>{libelle}</span>
        </NavLink>
      ))}

      <button
        type="button"
        className={styles['actionCentrale']}
        onClick={onSaisie}
        aria-label="Enregistrer une prise"
      >
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
          <path d="M11 4.5v13M4.5 11h13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>

      {[produits, reperes].map(({ chemin, libelle, Icone }) => (
        <NavLink
          key={chemin}
          to={chemin}
          className={({ isActive }) =>
            [styles['onglet'], isActive ? styles['ongletActif'] : ''].filter(Boolean).join(' ')
          }
        >
          <Icone />
          <span>{libelle}</span>
        </NavLink>
      ))}
    </nav>
  );
}
