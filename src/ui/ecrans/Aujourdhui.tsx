/**
 * Écran « Aujourd'hui » (maquette 1b, spec §11.2).
 *
 * Ordre imposé : le cumul du jour, la Plaquette 30 jours, les signaux, les
 * prises du jour. Aucun quatrième bloc dans une carte de signal (§8.6).
 */

import { useMemo } from 'react';
import type { ReactNode } from 'react';

import { cumulParSubstance, jourLocal } from '../../domain/cumul.js';
import { ajouterJours, fenetreGlissante, heureLocale } from '../../domain/temps.js';
import type { GroupeAtc } from '../../domain/types.js';
import { maintenant } from '../App.js';
import { useMedco } from '../etat.js';
import type { EtatMedco } from '../etat.js';
import { COULEUR_ATC } from '../tokens.js';
import { Carte, Etiquette, EtatVide } from '../composants/primitives.js';
import { EnTete } from '../composants/chrome.js';
import { CarteSignal, CumulJour, ListePrises, Plaquette } from '../composants/donnees.js';
import type { Alveole, LignePriseAffichee } from '../composants/donnees.js';
import styles from '../composants/composants.module.css';

const JOURS_PLAQUETTE = 30;

export function Aujourdhui(): ReactNode {
  const instant = maintenant();
  const { prises, produits, signaux, acquitter } = useMedco();

  const cumul = useMemo(
    () => cumulParSubstance(prises, fenetreGlissante(instant, 'PT24H')),
    [prises, instant],
  );

  // La substance la plus présente du jour porte le chiffre-clé.
  const [codeDominant, dominant] = useMemo(() => {
    let meilleur: [string, { mg: number; fiabiliteMin: 0 | 1 | 2; nbPrises: number }] | null = null;
    for (const entree of cumul) {
      if (!meilleur || entree[1].mg > meilleur[1].mg) meilleur = entree;
    }
    return meilleur ?? ['', { mg: 0, fiabiliteMin: 2 as const, nbPrises: 0 }];
  }, [cumul]);

  const alveoles = useMemo(() => plaquetteDesJours(prises, instant), [prises, instant]);
  const lignes = useMemo(() => lignesDuJour(prises, produits, instant), [prises, produits, instant]);

  return (
    <>
      <EnTete profil="Profil" couleurProfil={COULEUR_ATC._} />

      <main className={styles['pileEcran']}>
        {codeDominant ? (
          <CumulJour
            mg={dominant.mg}
            repere={null}
            substance={codeDominant}
            groupe="_"
            codeSubstance={codeDominant}
            detailPrises={`${dominant.nbPrises} prise${dominant.nbPrises > 1 ? 's' : ''}`}
            fiabiliteMin={dominant.fiabiliteMin}
          />
        ) : (
          <EtatVide
            titre="Aucune prise enregistrée aujourd'hui."
            texte="Le bouton central enregistre une prise en deux appuis."
          />
        )}

        <Carte>
          <div className={styles['entreDeux']}>
            <Etiquette>30 derniers jours</Etiquette>
            <span className={styles['meta']}>
              {alveoles.filter((a) => a.bandes.length > 0).length} j de prise
            </span>
          </div>
          <Plaquette alveoles={alveoles} />
        </Carte>

        {signaux.map((signal) => (
          <CarteSignal
            key={signal.regleId}
            signal={signal}
            fait={`${signal.valeur} ${signal.unite} — ${signal.libelleCible}.`}
            onAcquitter={() => void acquitter(signal, instant)}
          />
        ))}

        <section>
          <Etiquette>Prises du jour</Etiquette>
          <ListePrises prises={lignes} />
        </section>
      </main>
    </>
  );
}

function plaquetteDesJours(
  prises: EtatMedco['prises'],
  instant: string,
): Alveole[] {
  const aujourdhui = jourLocal(instant);
  const premier = ajouterJours(aujourdhui, -(JOURS_PLAQUETTE - 1));

  const parJour = new Map<string, number>();
  for (const prise of prises) {
    if (prise.statut !== 'prise') continue;
    const jour = jourLocal(prise.horodatage);
    if (jour < premier) continue;
    parJour.set(jour, (parJour.get(jour) ?? 0) + 1);
  }

  // Le premier jour de la grille est aligné sur le lundi (semaine française).
  const decalage = (new Date(`${premier}T00:00:00Z`).getUTCDay() + 6) % 7;
  const vides: Alveole[] = Array.from({ length: decalage }, () => ({
    jour: null,
    bandes: [],
    description: 'hors période',
  }));

  const jours: Alveole[] = [];
  for (let index = 0; index < JOURS_PLAQUETTE; index += 1) {
    const jour = ajouterJours(premier, index);
    const nombre = parJour.get(jour) ?? 0;
    jours.push({
      jour,
      aujourdhui: jour === aujourdhui,
      bandes:
        nombre === 0
          ? []
          : [
              {
                hauteur: '100%',
                couleur: COULEUR_ATC._,
                opacite: nombre >= 3 ? 1 : nombre === 2 ? 0.7 : 0.4,
              },
            ],
      description:
        nombre === 0 ? `${jour}, aucune prise` : `${jour}, ${nombre} prise${nombre > 1 ? 's' : ''}`,
    });
  }
  return [...vides, ...jours];
}

function lignesDuJour(
  prises: EtatMedco['prises'],
  produits: EtatMedco['produits'],
  instant: string,
): LignePriseAffichee[] {
  const aujourdhui = jourLocal(instant);
  const parId = new Map(produits.map((produit) => [produit.id, produit]));

  return prises
    .filter((prise) => jourLocal(prise.horodatage) === aujourdhui)
    .sort((a, b) => b.horodatage.localeCompare(a.horodatage))
    .map((prise) => {
      const produit = parId.get(prise.produitId);
      const substance = prise.substances[0];
      return {
        id: prise.id,
        heure: heureLocale(prise.horodatage),
        nom: produit?.nomAffiche ?? '—',
        detail: substance ? `${Math.round(substance.quantiteMg)} mg` : 'dosage non exploitable',
        appoint: `${prise.dose} ${produit?.unite ?? ''}`.trim(),
        groupe: '_' as GroupeAtc,
        codeSubstance: substance?.code ?? prise.produitId,
        ...(prise.statut === 'annulee' ? { annulee: true } : {}),
        ...(prise.substances.length === 0 ? { exclueDuCumul: true } : {}),
      };
    });
}
