/**
 * État applicatif (Zustand). Ne contient **aucun calcul** : le domaine décide,
 * la base stocke, ce store ne fait que porter ce que l'écran affiche.
 *
 * ⚠ §15 — aucun `console.*` sur un objet `prise`, `produit` ou `profil`.
 */

import { create } from 'zustand';

import { cumulParSubstance } from '../domain/cumul.js';
import { evaluer, validerBundle } from '../domain/regles.js';
import type { Regle, Signal } from '../domain/regles.js';
import { fenetreGlissante } from '../domain/temps.js';
import type { Instant, PriseAvecSubstances, Produit } from '../domain/types.js';
import { BaseDejaOuverte, baseDeDonnees } from '../db/client.js';
import reglesEmbarquees from '../../data/regles.json';

export interface EtatMedco {
  readonly pret: boolean;
  readonly secondOnglet: boolean;
  readonly catalogueInstalle: boolean;
  readonly profilId: string | null;
  readonly produits: readonly Produit[];
  readonly prises: readonly PriseAvecSubstances[];
  readonly regles: readonly Regle[];
  readonly signaux: readonly Signal[];
  readonly erreur: string | null;

  demarrer(maintenant: Instant): Promise<void>;
  rafraichir(maintenant: Instant): Promise<void>;
  acquitter(signal: Signal, maintenant: Instant): Promise<void>;
}

/** Fenêtre de travail : 90 jours couvrent la Plaquette la plus longue (§14.1). */
const FENETRE_TRAVAIL = 'P90D';

export const useMedco = create<EtatMedco>((set, get) => ({
  pret: false,
  secondOnglet: false,
  catalogueInstalle: false,
  profilId: null,
  produits: [],
  prises: [],
  regles: [],
  signaux: [],
  erreur: null,

  async demarrer(maintenant) {
    try {
      // Les règles sont embarquées : le moteur ne dépend jamais du réseau.
      const bundle = validerBundle(reglesEmbarquees);
      if (bundle.erreurs.length > 0) {
        // Un bundle de règles invalide n'est pas chargé : mieux vaut aucun
        // signal qu'un signal faux (§8.2).
        set({ erreur: `Règles rejetées : ${bundle.erreurs.map((e) => e.code).join(', ')}` });
      }
      const version = await baseDeDonnees.versionCatalogue();
      set({ regles: bundle.regles, catalogueInstalle: version !== null, pret: true });
      await get().rafraichir(maintenant);
    } catch (cause) {
      if (cause instanceof BaseDejaOuverte) set({ secondOnglet: true, pret: true });
      else set({ erreur: cause instanceof Error ? cause.message : String(cause), pret: true });
    }
  },

  async rafraichir(maintenant) {
    const { profilId, regles } = get();
    if (!profilId) return;

    const fenetre = fenetreGlissante(maintenant, FENETRE_TRAVAIL);
    const [produits, prises, acquittements] = await Promise.all([
      baseDeDonnees.produitsActifs(profilId),
      baseDeDonnees.prisesAvecSubstances(profilId, fenetre.debut, maintenant),
      baseDeDonnees.acquittements(profilId),
    ]);

    set({
      produits,
      prises,
      signaux: evaluer({ prises, produits, acquittements }, regles, maintenant),
    });
  },

  async acquitter(signal, maintenant) {
    const { profilId } = get();
    if (!profilId) return;
    await baseDeDonnees.acquitter(signal.regleId, profilId, signal.valeur, maintenant);
    set({ signaux: get().signaux.filter((s) => s.regleId !== signal.regleId) });
  },
}));

/** Cumul du jour pour une substance, calculé par le domaine. */
export function cumulDuJour(
  prises: readonly PriseAvecSubstances[],
  code: string,
  maintenant: Instant,
): { mg: number; fiabiliteMin: 0 | 1 | 2; nbPrises: number } {
  const cumul = cumulParSubstance(prises, fenetreGlissante(maintenant, 'PT24H'));
  return cumul.get(code) ?? { mg: 0, fiabiliteMin: 2, nbPrises: 0 };
}
