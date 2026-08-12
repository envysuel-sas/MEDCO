/**
 * Mot-symbole et monogramme.
 *
 * ⚠ La maquette borne strictement leur emploi :
 *
 *   « Marque tirée du logo. Dans l'app, le mot-symbole n'apparaît qu'à
 *     l'onboarding et dans les documents exportés — les écrans portent le nom
 *     du profil, pas celui du produit. »
 *
 * Ne pas le poser dans l'en-tête courant : cet emplacement revient au nom du
 * profil. Trois lieux légitimes, et pas un de plus — premier lancement, écran
 * de verrou, documents exportés.
 *
 * ⚠ Elle borne aussi ce qu'on en tire :
 *
 *   « Ce que je n'ai pas repris du logo : la croix, la gélule et les feuilles.
 *     Le logo reste en marque ; l'iconographie de l'app reste géométrique. »
 *
 * Le monogramme ne sert donc jamais d'icône d'interface.
 */

import type { ReactNode } from 'react';

import logo from '../marque/logo.png';
import monogramme from '../marque/monogramme.png';
import styles from './composants.module.css';

/** Verrouillage complet : pictogramme et mot « Medco ». */
export function MotSymbole({ taille = 'normale' }: { readonly taille?: 'normale' | 'grande' }): ReactNode {
  return (
    <img
      src={logo}
      alt="Medco"
      className={`${styles['motSymbole']} ${taille === 'grande' ? styles['motSymboleGrand'] : ''}`}
      // Le rapport est celui du fichier : le poser évite le saut de mise en
      // page pendant le chargement.
      width={1098}
      height={398}
    />
  );
}

/** Pictogramme seul, quand la largeur ne permet pas le verrouillage complet. */
export function Monogramme(): ReactNode {
  return <img src={monogramme} alt="Medco" className={styles['monogramme']} width={427} height={427} />;
}
