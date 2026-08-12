/**
 * Historique — journal par jour (maquette 2a).
 *
 * Raison d'être, mot pour mot dans la maquette :
 *
 *   « La Plaquette montre une forme sur 30 jours ; elle ne dit pas ce qui a
 *     été pris. L'historique est la lecture ligne à ligne : jour, heure,
 *     produit, dose. »
 *
 * ⚠ Règle explicite, et facile à trahir dans les deux sens :
 *
 *   « Les jours sans prise sont écrits. Un trou dans une liste se lit comme un
 *     oubli de saisie ; "aucune prise" est une information, pas un vide. »
 *
 * Un jour sans prise n'est donc jamais sauté — mais il tient sur **une ligne**,
 * comme 2a le dessine. Lui donner un en-tête de section et un paragraphe
 * transformait vingt-neuf jours calmes en mur de « Aucune prise. », où plus
 * rien ne se lisait : l'information devenait le vide qu'elle devait empêcher.
 *
 * ⚠ La maquette pose la question « journal (2a) ou ruban (2b) » et ne la
 * tranche pas. 2a est retenu : c'est celle qu'elle dessine en entier, et la
 * seule dont chaque valeur soit lisible. Le sélecteur qui permettait de
 * basculer entre les deux n'existait dans aucune des deux — c'était un motif
 * ajouté, et il empilait deux rangées de puces en tête d'écran. Consigné dans
 * `docs/maquette/manques.md` §1.6.
 *
 * ⚠ §12.1 — aucun rouge, aucun pourcentage, aucune conclusion. Le total du
 * jour est un fait posé à droite, rien de plus.
 */

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { cumulDePrises } from '../../domain/cumul.js';
import { baseDeDonnees } from '../../db/client.js';
import { jourLocal } from '../../domain/temps.js';
import type { CodeSubstance, PriseAvecSubstances, Produit, Substance } from '../../domain/types.js';
import { maintenant } from '../App.js';
import { useMedco } from '../etat.js';
import { couleurSubstance } from '../tokens.js';
import { Bouton, Chip, TitreEcran } from '../composants/primitives.js';
import { JourJournal, JourSansPrise } from '../composants/donnees.js';
import type { LigneJournalAffichee } from '../composants/donnees.js';
import { PrisePassee } from '../composants/PrisePassee.js';
import styles from '../composants/composants.module.css';

/** Fenêtre lue par le journal. La Plaquette en couvre 30 ; le journal l'égale. */
const JOURS_AFFICHES = 30;

export function Historique(): ReactNode {
  const { prises, produits, profilNom, rafraichir, ouvrirSaisie } = useMedco();
  const [filtre, setFiltre] = useState<CodeSubstance | null>(null);
  const [substances, setSubstances] = useState<ReadonlyMap<CodeSubstance, Substance>>(new Map());
  // Maquette 2e — toute prise du journal est corrigeable ou retirable.
  const [ouverte, setOuverte] = useState<string | null>(null);
  const instant = maintenant();

  const codes = useMemo(
    () => [...new Set(prises.flatMap((prise) => prise.substances.map((s) => s.code)))],
    [prises],
  );

  useEffect(() => {
    if (codes.length === 0) return;
    void baseDeDonnees
      .substancesDuCatalogue(codes)
      .then((table) => setSubstances(new Map(table as unknown as [CodeSubstance, Substance][])));
  }, [codes]);

  const produitsParId = useMemo(
    () => new Map<string, Produit>(produits.map((p) => [p.id, p])),
    [produits],
  );

  // Les substances réellement prises sur la période : le filtre ne propose que
  // ce qui existe, jamais une liste théorique.
  const presentes = useMemo(() => {
    const vues = new Map<CodeSubstance, string>();
    for (const prise of prises) {
      for (const s of prise.substances) {
        if (!vues.has(s.code)) vues.set(s.code, substances.get(s.code)?.nom ?? s.code);
      }
    }
    return [...vues].sort((a, b) => a[1].localeCompare(b[1], 'fr'));
  }, [prises, substances]);

  const retenues = useMemo(
    () =>
      filtre === null
        ? prises
        : prises.filter((prise) => prise.substances.some((s) => s.code === filtre)),
    [prises, filtre],
  );

  // ⚠ `jourLocal` lit la date **telle qu'écrite** dans l'horodatage, décalage
  // compris : jamais de conversion en UTC, qui déplacerait les prises du soir
  // au lendemain (piège connu, CLAUDE.md).
  const parJour = useMemo(() => {
    const groupes = new Map<string, PriseAvecSubstances[]>();
    for (const prise of retenues) {
      const jour = jourLocal(prise.horodatage);
      const liste = groupes.get(jour) ?? [];
      liste.push(prise);
      groupes.set(jour, liste);
    }
    return groupes;
  }, [retenues]);

  const jours = useMemo(() => joursDescendants(instant, JOURS_AFFICHES), [instant]);

  return (
    <main className={styles['pileEcran']} style={{ paddingTop: 'var(--espace-10)' }}>
      <div>
        <TitreEcran>Historique</TitreEcran>
        <p className={styles['meta']}>
          {profilNom || 'Profil'} · {moisEnCours(instant)}
        </p>
      </div>

      {presentes.length > 0 ? (
        <div className={styles['filtresHistorique']}>
          <Chip actif={filtre === null} onClick={() => setFiltre(null)}>
            Tout
          </Chip>
          {presentes.map(([code, nom]) => (
            <Chip key={code} actif={filtre === code} onClick={() => setFiltre(code)}>
              {/* 2a — la puce porte la couleur ATC de sa substance : sans elle,
                  le filtre ne se relie pas aux pastilles des lignes. */}
              <span
                className={styles['pastilleChip']}
                style={{
                  background: couleurSubstance(substances.get(code)?.groupeAtc ?? '_', code),
                }}
              />
              {nom.toLowerCase()}
            </Chip>
          ))}
        </div>
      ) : null}

      {jours.map((jour) => {
        const duJour = parJour.get(jour) ?? [];
        const date = libelleJour(jour, instant);

        return duJour.length === 0 ? (
          <JourSansPrise key={jour} date={date} />
        ) : (
          <JourJournal
            key={jour}
            date={date}
            total={totauxDuJour(duJour)}
            lignes={[...duJour]
              .sort((a, b) => b.horodatage.localeCompare(a.horodatage))
              .map((prise) => ligneAffichee(prise, produitsParId.get(prise.produitId), substances))}
            onChoisir={setOuverte}
          />
        );
      })}

      <Bouton variante="secondaire" pleineLargeur onClick={ouvrirSaisie}>
        + Ajouter une prise antérieure
      </Bouton>

      {/* Mot pour mot dans 2a : la méthode est dite, aucune conclusion ne l'est. */}
      <p className={styles['meta']}>
        Le total du jour additionne les doses d&apos;une même substance. Aucune moyenne, aucune
        série, aucun classement des journées entre elles.
      </p>

      <PrisePassee
        prise={prises.find((p) => p.id === ouverte) ?? null}
        produit={produitsParId.get(prises.find((p) => p.id === ouverte)?.produitId ?? '')}
        substances={substances}
        maintenant={instant}
        onFerme={() => setOuverte(null)}
        onModifiee={() => rafraichir(maintenant())}
      />
    </main>
  );
}

/** Projette une prise vers ce que le journal en affiche (maquette 2a). */
function ligneAffichee(
  prise: PriseAvecSubstances,
  produit: Produit | undefined,
  substances: ReadonlyMap<CodeSubstance, Substance>,
): LigneJournalAffichee {
  const dominante = [...prise.substances].sort((a, b) => b.quantiteMg - a.quantiteMg)[0];
  const substance = dominante ? substances.get(dominante.code) : undefined;

  const dosage =
    dominante && substance
      ? `${substance.nom.toLowerCase()} ${formaterMg(dominante.quantiteMg)}`
      : 'dosage non exploitable';

  return {
    id: prise.id,
    heure: heure(prise.horodatage),
    couleur: couleurSubstance(substance?.groupeAtc ?? '_', dominante?.code ?? ''),
    titre: produit?.nomAffiche ?? 'Produit retiré',
    detail: `${dosage} · ${prise.dose} ${produit?.unite ?? 'dose'}${
      prise.statut === 'annulee' ? ' · annulée' : ''
    }`,
    ajouteeApresCoup: ajouteeApresCoup(prise),
  };
}

/**
 * Une prise saisie plus d'une heure après son horodatage a été ajoutée après
 * coup. Le seuil absorbe la saisie immédiate, qui se fait toujours avec
 * quelques secondes de décalage.
 *
 * ⚠ Valeur dérivée, absente de la maquette — consignée dans manques.md §1.6.
 */
const SEUIL_APRES_COUP_MS = 3_600_000;

function ajouteeApresCoup(prise: PriseAvecSubstances): boolean {
  if (!prise.saisieLe) return false;
  return Date.parse(prise.saisieLe) - Date.parse(prise.horodatage) > SEUIL_APRES_COUP_MS;
}

/** Total du jour, par substance, posé à droite de l'en-tête (maquette 2a). */
function totauxDuJour(duJour: readonly PriseAvecSubstances[]): string {
  return [...cumulDePrises(duJour).values()]
    .filter((entree) => entree.mg > 0)
    .sort((a, b) => b.mg - a.mg)
    .map((entree) => formaterMg(entree.mg))
    .join(' · ');
}

/**
 * ⚠ En milligrammes, toujours. 2a écrit « 2 000 mg », « 3 000 mg »,
 * « 1 000 mg · 400 mg » — jamais de conversion en grammes. Un total qui change
 * d'unité selon sa valeur ne se compare plus d'un jour à l'autre d'un coup
 * d'œil, ce qui est précisément l'usage de cette colonne.
 */
function formaterMg(mg: number): string {
  return `${Math.round(mg).toLocaleString('fr-FR')} mg`;
}

function heure(horodatage: string): string {
  return horodatage.slice(11, 16);
}

/**
 * Les `JOURS_AFFICHES` derniers jours, du plus récent au plus ancien.
 *
 * ⚠ Ancré à midi UTC, jamais à minuit : minuit est à un cheveu de la veille
 * pour tout fuseau négatif, et la liste sautait un jour.
 */
function joursDescendants(instant: string, combien: number): string[] {
  const depart = Date.parse(`${instant.slice(0, 10)}T12:00:00Z`);
  return Array.from({ length: combien }, (_, recul) =>
    new Date(depart - recul * 86_400_000).toISOString().slice(0, 10),
  );
}

function libelleJour(jour: string, instant: string): string {
  const aujourdhui = instant.slice(0, 10);
  const hier = new Date(Date.parse(`${aujourdhui}T12:00:00Z`) - 86_400_000)
    .toISOString()
    .slice(0, 10);
  const date = new Date(`${jour}T12:00:00Z`).toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
  if (jour === aujourdhui) return `Aujourd'hui · ${date}`;
  if (jour === hier) return `Hier · ${date}`;
  return date.charAt(0).toUpperCase() + date.slice(1);
}

function moisEnCours(instant: string): string {
  return new Date(`${instant.slice(0, 10)}T12:00:00Z`).toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
