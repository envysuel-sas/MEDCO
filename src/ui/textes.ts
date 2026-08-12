/**
 * Textes de l'interface.
 *
 * ⚠ R3 — un signal se lit en trois blocs (§8.6) : le chiffre de
 * l'utilisateur, le repère publié cité mot pour mot, la source datée.
 * Ce fichier ne produit que le **premier** bloc. Il énonce un fait et
 * s'arrête : aucune phrase ne relie ce fait au repère.
 *
 * ⚠ §12.3 — vocabulaire. Le mot est « repère », jamais « limite »,
 * « maximum » ni « objectif ». Sont proscrits : `vous devriez`, `trop`,
 * `excessif`, `anormal`, `votre risque`, `bravo`, `continuez comme ça`.
 */

import type { Signal } from '../domain/regles.js';

const nombreFr = new Intl.NumberFormat('fr-FR');

/** Énoncé du fait mesuré. Un constat, jamais une conclusion. */
export function faitDuSignal(signal: Signal): string {
  const cible = signal.libelleCible || 'cette substance';
  const valeur = nombreFr.format(signal.valeur);

  switch (signal.type) {
    case 'cumul_fenetre':
      return `${valeur} ${signal.unite} de ${cible} sur les dernières 24 heures.`;
    case 'dose_unitaire':
      return `${valeur} ${signal.unite} de ${cible} en une seule prise.`;
    case 'intervalle_min':
      // Sous l'heure, le millième d'heure ne veut rien dire : on passe aux
      // minutes. `0,001 h` était illisible.
      return `${ecartLisible(signal.valeur, signal.unite)} entre deux prises de ${cible}.`;
    case 'duree_consecutive':
      return `${valeur} ${signal.unite} consécutifs avec prise de ${cible}.`;
    case 'jours_de_prise':
      return `${valeur} ${signal.unite} avec prise de ${cible} sur les 30 derniers jours.`;
  }
}

/** Un écart de moins d'une heure s'exprime en minutes. */
export function ecartLisible(valeur: number, unite: string): string {
  if (unite !== 'h' || valeur >= 1) return `${nombreFr.format(Math.round(valeur * 10) / 10)} ${unite}`;
  const minutes = Math.round(valeur * 60);
  return minutes <= 1 ? "moins d'une minute" : `${nombreFr.format(minutes)} minutes`;
}

/** Libellé d'une quantité, avec l'espace insécable fine du français. */
export function formaterQuantite(valeur: number, unite: string): string {
  return `${nombreFr.format(valeur)} ${unite}`;
}
