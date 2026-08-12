/**
 * Fiche substance (maquette 1k, spec §11.5).
 *
 * La couleur vient du groupe ATC, la Plaquette 90 jours montre la répartition
 * dans le temps. Aucun taux, aucun score : des faits (§12).
 */

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useParams } from 'react-router';

import { cumulParSubstance, jourLocal } from '../../domain/cumul.js';
import { ajouterJours, fenetreVivante } from '../../domain/temps.js';
import type { Substance as SubstanceDomaine } from '../../domain/types.js';
import type { ResultatRecherche } from '../../db/depots.js';
import { baseDeDonnees } from '../../db/client.js';
import { maintenant } from '../App.js';
import { FUSEAU, useMedco } from '../etat.js';
import { LIBELLE_GROUPE_ATC, couleurSubstance } from '../tokens.js';
import { Carte, Etiquette, TitreEcran } from '../composants/primitives.js';
import { CumulJour, LigneResultat, Plaquette } from '../composants/donnees.js';
import type { Alveole } from '../composants/donnees.js';
import styles from '../composants/composants.module.css';

const JOURS = 90;

export function Substance(): ReactNode {
  const { code } = useParams();
  const instant = maintenant();
  const { prises, regles } = useMedco();
  const [substance, setSubstance] = useState<SubstanceDomaine | null>(null);
  const [specialites, setSpecialites] = useState<readonly ResultatRecherche[]>([]);

  useEffect(() => {
    if (!code) return;
    void baseDeDonnees.substanceParCode(code).then(setSubstance);
    void baseDeDonnees.specialitesAvecSubstance(code, 20).then(setSpecialites);
  }, [code]);

  const cumul = useMemo(
    () => cumulParSubstance(prises, fenetreVivante(instant, 'PT24H', FUSEAU())).get(code ?? ''),
    [prises, instant, code],
  );

  const alveoles = useMemo<Alveole[]>(() => {
    if (!code || !substance) return [];
    const aujourdhui = jourLocal(instant);
    const premier = ajouterJours(aujourdhui, -(JOURS - 1));
    const parJour = new Map<string, number>();
    for (const prise of prises) {
      if (prise.statut !== 'prise') continue;
      if (!prise.substances.some((s) => s.code === code)) continue;
      const jour = jourLocal(prise.horodatage);
      if (jour < premier) continue;
      parJour.set(jour, (parJour.get(jour) ?? 0) + 1);
    }

    const decalage = (new Date(`${premier}T00:00:00Z`).getUTCDay() + 6) % 7;
    const vides: Alveole[] = Array.from({ length: decalage }, () => ({
      jour: null,
      bandes: [],
      description: 'hors période',
    }));
    const grille: Alveole[] = [];
    for (let index = 0; index < JOURS; index += 1) {
      const jour = ajouterJours(premier, index);
      const nombre = parJour.get(jour) ?? 0;
      grille.push({
        jour,
        aujourdhui: jour === aujourdhui,
        bandes:
          nombre === 0
            ? []
            : [
                {
                  hauteur: '100%',
                  couleur: couleurSubstance(substance.groupeAtc, substance.code),
                  opacite: nombre >= 3 ? 1 : nombre === 2 ? 0.7 : 0.4,
                },
              ],
        description: nombre === 0 ? `${jour}, aucune prise` : `${jour}, ${nombre} prise(s)`,
      });
    }
    return [...vides, ...grille];
  }, [prises, instant, code, substance]);

  if (!substance) {
    return (
      <main className={styles['pileEcran']} style={{ paddingTop: 'var(--espace-10)' }}>
        <p className={styles['meta']}>Substance introuvable dans le catalogue.</p>
      </main>
    );
  }

  const repere =
    regles.find((regle) => regle.type === 'cumul_fenetre' && regle.cible.substances?.includes(substance.code))
      ?.seuil ?? null;

  return (
    <main className={styles['pileEcran']} style={{ paddingTop: 'var(--espace-10)' }}>
      <TitreEcran>{substance.nom.toLowerCase()}</TitreEcran>
      <p className={styles['mono']}>
        {substance.atc ?? 'sans ATC'} · {LIBELLE_GROUPE_ATC[substance.groupeAtc]}
      </p>

      <CumulJour
        mg={cumul?.mg ?? 0}
        repere={repere}
        substance={substance.nom.toLowerCase()}
        groupe={substance.groupeAtc}
        codeSubstance={substance.code}
        detailPrises={`${cumul?.nbPrises ?? 0} prise${(cumul?.nbPrises ?? 0) > 1 ? 's' : ''} sur 24 h`}
        fiabiliteMin={cumul?.fiabiliteMin ?? 2}
      />

      <Carte>
        <Etiquette>90 derniers jours</Etiquette>
        <Plaquette alveoles={alveoles} />
      </Carte>

      <Carte>
        <Etiquette>Spécialités contenant cette substance</Etiquette>
        {specialites.map((resultat) => (
          <LigneResultat
            key={resultat.cis}
            nom={resultat.nom}
            substances={resultat.substances}
            prescription={resultat.prescription}
            commercialisee={resultat.commercialisee}
            onChoisir={() => undefined}
          />
        ))}
      </Carte>
    </main>
  );
}
