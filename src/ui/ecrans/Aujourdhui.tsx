/**
 * Écran « Aujourd'hui » (maquette 1b, spec §11.2).
 *
 * Ordre imposé : le cumul du jour, la Plaquette 30 jours, les signaux, les
 * prises du jour. Aucun quatrième bloc dans une carte de signal (§8.6).
 */

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { cumulParSubstance, jourLocal } from '../../domain/cumul.js';
import { ajouterJours, fenetreGlissante, heureLocale } from '../../domain/temps.js';
import type { GroupeAtc, Substance } from '../../domain/types.js';
import { baseDeDonnees } from '../../db/client.js';
import { maintenant } from '../App.js';
import { useMedco } from '../etat.js';
import type { EtatMedco } from '../etat.js';
import { couleurSubstance } from '../tokens.js';
import { faitDuSignal, formaterQuantite } from '../textes.js';
import { Carte, Etiquette, EtatVide } from '../composants/primitives.js';
import { CarteSignal, CumulJour, ListePrises, Plaquette } from '../composants/donnees.js';
import type { Alveole, LignePriseAffichee } from '../composants/donnees.js';
import styles from '../composants/composants.module.css';
import { Link } from 'react-router';

const JOURS_PLAQUETTE = 30;

export function Aujourdhui(): ReactNode {
  const instant = maintenant();
  const { prises, produits, signaux, regles, acquitter } = useMedco();
  const [substances, setSubstances] = useState<Map<string, Substance>>(new Map());

  const codes = useMemo(
    () => [...new Set(prises.flatMap((prise) => prise.substances.map((s) => s.code)))],
    [prises],
  );

  useEffect(() => {
    if (codes.length === 0) return;
    void baseDeDonnees
      .substancesDuCatalogue(codes)
      .then((table) => setSubstances(new Map(table as unknown as [string, Substance][])));
  }, [codes]);

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

  const dominante = substances.get(codeDominant) ?? null;
  // Le repère affiché est celui d'une règle de cumul ciblant cette substance,
  // jamais une valeur choisie par l'app.
  const repere =
    regles.find(
      (regle) => regle.type === 'cumul_fenetre' && regle.cible.substances?.includes(codeDominant),
    )?.seuil ?? null;

  const alveoles = useMemo(
    () => plaquetteDesJours(prises, instant, substances),
    [prises, instant, substances],
  );
  const lignes = useMemo(
    () => lignesDuJour(prises, produits, instant, substances),
    [prises, produits, instant, substances],
  );

  return (
    <>
      <main className={styles['pileEcran']}>
        {codeDominant ? (
          <CumulJour
            mg={dominant.mg}
            repere={repere}
            substance={dominante?.nom.toLowerCase() ?? codeDominant}
            groupe={dominante?.groupeAtc ?? '_'}
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
            fait={faitDuSignal(signal)}
            onAcquitter={() => void acquitter(signal, instant)}
          />
        ))}

        <section>
          <div className={styles['entreDeux']}>
            <Etiquette>Prises du jour</Etiquette>
            {/* La maquette 2a pose l'historique en écran de détail, refermé par
                un retour vers « Aujourd'hui » — pas en onglet. */}
            <Link className={styles['source']} to="/historique">
              Historique →
            </Link>
          </div>
          <ListePrises prises={lignes} />
        </section>
      </main>
    </>
  );
}

function plaquetteDesJours(
  prises: EtatMedco['prises'],
  instant: string,
  substances: ReadonlyMap<string, Substance>,
): Alveole[] {
  const aujourdhui = jourLocal(instant);
  const premier = ajouterJours(aujourdhui, -(JOURS_PLAQUETTE - 1));

  // La teinte porte le groupe ATC dominant du jour, l'intensité le nombre de
  // prises : sur un mois, on voit quelle famille domine (§12.2).
  const parJour = new Map<string, { nombre: number; groupe: GroupeAtc; code: string }>();
  for (const prise of prises) {
    if (prise.statut !== 'prise') continue;
    const jour = jourLocal(prise.horodatage);
    if (jour < premier) continue;
    const premiere = prise.substances[0];
    const substance = premiere ? substances.get(premiere.code) : undefined;
    const existant = parJour.get(jour);
    parJour.set(jour, {
      nombre: (existant?.nombre ?? 0) + 1,
      groupe: existant?.groupe ?? substance?.groupeAtc ?? '_',
      code: existant?.code ?? premiere?.code ?? jour,
    });
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
    const entree = parJour.get(jour);
    const nombre = entree?.nombre ?? 0;
    jours.push({
      jour,
      aujourdhui: jour === aujourdhui,
      bandes:
        entree === undefined
          ? []
          : [
              {
                hauteur: '100%',
                couleur: couleurSubstance(entree.groupe, entree.code),
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
  substances: ReadonlyMap<string, Substance>,
): LignePriseAffichee[] {
  const aujourdhui = jourLocal(instant);
  const parId = new Map(produits.map((produit) => [produit.id, produit]));

  return prises
    .filter((prise) => jourLocal(prise.horodatage) === aujourdhui)
    .sort((a, b) => b.horodatage.localeCompare(a.horodatage))
    .map((prise) => {
      const produit = parId.get(prise.produitId);
      const premiere = prise.substances[0];
      const substance = premiere ? substances.get(premiere.code) : undefined;
      return {
        id: prise.id,
        heure: heureLocale(prise.horodatage),
        nom: produit?.nomAffiche ?? '—',
        detail: premiere
          ? `${substance?.nom.toLowerCase() ?? premiere.code} · ${formaterQuantite(Math.round(premiere.quantiteMg), 'mg')}`
          : 'dosage non exploitable',
        appoint: `${prise.dose} ${produit?.unite ?? ''}`.trim(),
        groupe: substance?.groupeAtc ?? ('_' as GroupeAtc),
      // La maquette 2a l'exige : une prise saisie longtemps après son heure
      // est marquée comme telle. Le champ existait, rien ne le remplissait.
      ...(prise.saisieLe && Date.parse(prise.saisieLe) - Date.parse(prise.horodatage) > 3_600_000
        ? { ajouteeApresCoup: true }
        : {}),
        codeSubstance: premiere?.code ?? prise.produitId,
        ...(prise.statut === 'annulee' ? { annulee: true } : {}),
        ...(prise.substances.length === 0 ? { exclueDuCumul: true } : {}),
      };
    });
}
