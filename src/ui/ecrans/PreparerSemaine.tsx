/**
 * Préparer la semaine — l'écran de l'aidant (maquette 1h, spec §9.4).
 *
 * Relevé dans la maquette :
 *
 *   Préparer la semaine
 *   Du 3 au 9 août · Robert
 *
 *   Lévothyrox 75 µg      7 cp     Stock : 12 cp
 *   Kardégic 75 mg        7 sach.  Stock : 4 sachets · insuffisant pour la semaine
 *   Inexium 20 mg         7 gél
 *
 * Le besoin de la semaine vient des **occurrences planifiées**, pas d'une
 * estimation : c'est le pilulier qui sait combien de prises sont prévues.
 *
 * ⚠ §12.1 — un stock insuffisant se dit en toutes lettres, sans rouge ni
 * triangle. C'est un fait, pas une alarme.
 *
 * ⚠ Aucun stock n'est deviné. Un produit dont le stock n'est pas renseigné
 * n'affiche rien : `null` veut dire « non suivi », pas « zéro ».
 */

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { ajouterJours, jourLocal } from '../../domain/temps.js';
import type { Occurrence, Plan, Produit } from '../../domain/types.js';
import { baseDeDonnees } from '../../db/client.js';
import { maintenant } from '../App.js';
import { useMedco } from '../etat.js';
import { Bouton, Carte, Etiquette, EtatVide, TitreEcran } from '../composants/primitives.js';
import { JaugeLineaire } from '../composants/donnees.js';
import styles from '../composants/composants.module.css';

interface Besoin {
  readonly produit: Produit;
  /** Doses prévues sur les sept jours, sommées depuis les occurrences. */
  readonly requis: number;
}

export function PreparerSemaine(): ReactNode {
  const { produits, profilId, profilNom, rafraichir } = useMedco();
  const [occurrences, setOccurrences] = useState<readonly Occurrence[]>([]);
  const [plans, setPlans] = useState<readonly Plan[]>([]);
  const [enCours, setEnCours] = useState<string | null>(null);
  const instant = maintenant();

  const debut = jourLocal(instant);
  const fin = jourLocal(ajouterJours(instant, 6));

  useEffect(() => {
    if (!profilId) return;
    void baseDeDonnees
      .occurrencesEntre(profilId, `${debut}T00:00:00+00:00`, `${fin}T23:59:59+00:00`)
      .then(setOccurrences);
    void baseDeDonnees.plansDuProfil(profilId).then(setPlans);
  }, [profilId, debut, fin]);

  const besoins = useMemo<Besoin[]>(() => {
    // Une occurrence porte son plan, pas son produit : le recoupement passe par
    // les plans. Une occurrence sautée ne consomme rien.
    const produitDuPlan = new Map(plans.map((plan) => [plan.id, plan.produitId]));
    const parProduit = new Map<string, number>();
    for (const occurrence of occurrences) {
      if (occurrence.statut === 'sautee') continue;
      const produitId = produitDuPlan.get(occurrence.planId);
      if (!produitId) continue;
      parProduit.set(produitId, (parProduit.get(produitId) ?? 0) + occurrence.dose);
    }
    return produits
      .map((produit) => ({ produit, requis: parProduit.get(produit.id) ?? 0 }))
      .filter((besoin) => besoin.requis > 0);
  }, [occurrences, plans, produits]);

  async function ajusterStock(produit: Produit, valeur: string): Promise<void> {
    const stock = valeur.trim() === '' ? null : Number(valeur);
    if (stock !== null && !Number.isFinite(stock)) return;
    setEnCours(produit.id);
    try {
      await baseDeDonnees.definirStock(produit.id, stock);
      await rafraichir(maintenant());
    } finally {
      setEnCours(null);
    }
  }

  return (
    <main className={styles['pileEcran']} style={{ paddingTop: 'var(--espace-10)' }}>
      <Etiquette>Préparer la semaine</Etiquette>
      <TitreEcran>{periode(debut, fin)}</TitreEcran>
      <p className={styles['meta']}>{profilNom || 'Profil'}</p>

      {besoins.length === 0 ? (
        <EtatVide
          titre="Aucune prise planifiée cette semaine."
          texte="Créez un plan de prise pour qu'un produit apparaisse ici."
        />
      ) : (
        besoins.map(({ produit, requis }) => {
          const unite = produit.unite ?? 'dose';
          const suffisant = produit.stock === null || produit.stock >= requis;
          return (
            <Carte key={produit.id}>
              <div className={styles['entreDeux']}>
                <span className={styles['ligneTitre']}>{produit.nomAffiche}</span>
                <span className={styles['totalJour']}>
                  {requis} {unite}
                </span>
              </div>

              {produit.stock !== null ? (
                <>
                  <div style={{ marginTop: 'var(--espace-5)' }}>
                    {/* Jauge **linéaire**, jamais circulaire (§12, non négociable).
                        Le repère est le besoin de la semaine. */}
                    <JaugeLineaire
                      valeur={Math.min(produit.stock, requis)}
                      repere={requis}
                      couleur="var(--action)"
                      legendeGauche={`${produit.stock} ${unite} en stock`}
                      legendeDroite={`${requis} ${unite} nécessaires`}
                    />
                  </div>
                  <p className={styles['meta']}>
                    Stock : {produit.stock} {unite}
                    {/* Un fait, pas une alarme (§12.1). */}
                    {suffisant ? '' : ' · insuffisant pour la semaine'}
                  </p>
                </>
              ) : (
                <p className={styles['meta']}>Stock non suivi.</p>
              )}

              <label className={styles['meta']} style={{ display: 'block', marginTop: 'var(--espace-5)' }}>
                Stock restant
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  className={styles['champ']}
                  defaultValue={produit.stock ?? ''}
                  disabled={enCours === produit.id}
                  onBlur={(evenement) => void ajusterStock(produit, evenement.target.value)}
                />
              </label>
            </Carte>
          );
        })
      )}

      {besoins.length > 0 ? (
        <Bouton pleineLargeur onClick={() => void rafraichir(maintenant())}>
          Marquer préparé
        </Bouton>
      ) : null}
    </main>
  );
}

function periode(debut: string, fin: string): string {
  const jour = (iso: string, avecMois: boolean): string =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString('fr-FR', {
      day: 'numeric',
      ...(avecMois ? { month: 'long' as const } : {}),
      timeZone: 'UTC',
    });
  return `Du ${jour(debut, debut.slice(5, 7) !== fin.slice(5, 7))} au ${jour(fin, true)}`;
}
