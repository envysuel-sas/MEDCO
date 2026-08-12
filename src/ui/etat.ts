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
import { regenererTout } from '../services/pilulier.js';
import reglesEmbarquees from '../../data/regles.json';

export interface EtatMedco {
  readonly pret: boolean;
  readonly secondOnglet: boolean;
  readonly catalogueInstalle: boolean;
  readonly profilId: string | null;
  readonly profilNom: string;
  readonly produits: readonly Produit[];
  readonly prises: readonly PriseAvecSubstances[];
  readonly regles: readonly Regle[];
  readonly versionRegles: string;
  readonly signaux: readonly Signal[];
  readonly erreur: string | null;

  demarrer(maintenant: Instant): Promise<void>;
  rafraichir(maintenant: Instant): Promise<void>;
  acquitter(signal: Signal, maintenant: Instant): Promise<void>;
  choisirProfil(profilId: string, maintenant: Instant): Promise<void>;
}

export const FUSEAU = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Fenêtre de travail : 90 jours couvrent la Plaquette la plus longue (§14.1). */
const FENETRE_TRAVAIL = 'P90D';

export const useMedco = create<EtatMedco>((set, get) => ({
  pret: false,
  secondOnglet: false,
  catalogueInstalle: false,
  profilId: null,
  profilNom: '',
  produits: [],
  prises: [],
  regles: [],
  versionRegles: '',
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
      const [version, listeProfils] = await Promise.all([
        baseDeDonnees.versionCatalogue(),
        baseDeDonnees.profils(),
      ]);
      const premier = listeProfils[0]?.id ?? null;

      set({
        regles: bundle.regles,
        versionRegles: bundle.version,
        catalogueInstalle: version !== null,
        profilId: premier,
        profilNom: listeProfils[0]?.nom ?? '',
        pret: true,
      });

      if (premier) {
        // §9.1 — les occurrences sont régénérées à chaque ouverture, puis les
        // non traitées passent à `expiree` : sans notification, sans badge.
        await regenererTout(premier, maintenant, FUSEAU());
        await get().rafraichir(maintenant);
      }
    } catch (cause) {
      if (cause instanceof BaseDejaOuverte) set({ secondOnglet: true, pret: true });
      else set({ erreur: cause instanceof Error ? cause.message : String(cause), pret: true });
    }
  },

  async rafraichir(maintenant) {
    const { profilId, regles } = get();
    if (!profilId) return;

    const fenetre = fenetreGlissante(maintenant, FENETRE_TRAVAIL);
    // La borne de fin des fenêtres du domaine est **exclue** (§7.3). Le jeu de
    // travail, lui, doit contenir la prise qui vient d'être enregistrée : sa
    // borne dépasse donc l'instant courant d'une seconde.
    const fin = new Date(Date.parse(maintenant) + 1000).toISOString();
    const [produits, prises, acquittements] = await Promise.all([
      baseDeDonnees.produitsActifs(profilId),
      baseDeDonnees.prisesAvecSubstances(profilId, fenetre.debut, fin),
      baseDeDonnees.acquittements(profilId),
    ]);

    set({
      produits,
      prises,
      signaux: evaluer({ prises, produits, acquittements }, regles, maintenant),
    });
  },

  async choisirProfil(profilId, maintenant) {
    const profil = (await baseDeDonnees.profils()).find((p) => p.id === profilId);
    set({ profilId, profilNom: profil?.nom ?? '' });
    await regenererTout(profilId, maintenant, FUSEAU());
    await get().rafraichir(maintenant);
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
