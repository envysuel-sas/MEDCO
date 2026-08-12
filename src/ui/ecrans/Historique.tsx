/**
 * Historique — journal par jour (maquette 2a).
 *
 * Raison d'être, mot pour mot dans la maquette :
 *
 *   « La Plaquette montre une forme sur 30 jours ; elle ne dit pas ce qui a
 *     été pris. L'historique est la lecture ligne à ligne : jour, heure,
 *     produit, dose. »
 *
 * ⚠ Règle explicite, et facile à trahir par omission :
 *
 *   « Les jours sans prise sont écrits. Un trou dans une liste se lit comme un
 *     oubli de saisie ; "aucune prise" est une information, pas un vide. »
 *
 * Un jour sans prise n'est donc **jamais** sauté.
 *
 * ⚠ La maquette ne tranche pas entre journal (2a) et ruban (2b) : « Deux mises
 * en page à trancher ». Le journal est retenu, l'arbitrage est consigné dans
 * `docs/maquette/manques.md` §1.6.
 *
 * ⚠ §12.1 — aucun rouge, aucun pourcentage, aucune conclusion. Le total du
 * jour est un fait posé à droite, rien de plus.
 */

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { cumulParSubstance } from '../../domain/cumul.js';
import { baseDeDonnees } from '../../db/client.js';
import { jourLocal } from '../../domain/temps.js';
import type { CodeSubstance, PriseAvecSubstances, Produit, Substance } from '../../domain/types.js';
import { maintenant } from '../App.js';
import { useMedco } from '../etat.js';
import { couleurSubstance } from '../tokens.js';
import { Carte, Chip, Etiquette, TitreEcran } from '../composants/primitives.js';
import { PrisePassee } from '../composants/PrisePassee.js';
import styles from '../composants/composants.module.css';

/** Fenêtre lue par le journal. La Plaquette en couvre 30 ; le journal va plus loin. */
const JOURS_AFFICHES = 30;

export function Historique(): ReactNode {
  const { prises, produits, profilNom, rafraichir } = useMedco();
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
      <TitreEcran>Historique</TitreEcran>
      <p className={styles['meta']}>
        {profilNom || 'Profil'} · {moisEnCours(instant)}
      </p>

      {presentes.length > 0 ? (
        <div className={styles['filtresHistorique']}>
          <Chip actif={filtre === null} onClick={() => setFiltre(null)}>
            Tout
          </Chip>
          {presentes.map(([code, nom]) => (
            <Chip key={code} actif={filtre === code} onClick={() => setFiltre(code)}>
              {nom.toLowerCase()}
            </Chip>
          ))}
        </div>
      ) : null}

      {jours.map((jour) => {
        const duJour = parJour.get(jour) ?? [];
        return (
          <section key={jour} className={styles['jourHistorique']}>
            <header className={styles['entreDeux']}>
              <Etiquette>{libelleJour(jour, instant)}</Etiquette>
              <span className={styles['totalJour']}>{totauxDuJour(duJour)}</span>
            </header>

            {duJour.length === 0 ? (
              // « Les jours sans prise sont écrits » — un vide se lirait comme
              // un oubli de saisie.
              <p className={styles['meta']}>Aucune prise.</p>
            ) : (
              <Carte>
                {[...duJour]
                  .sort((a, b) => b.horodatage.localeCompare(a.horodatage))
                  .map((prise) => (
                    <button
                      key={prise.id}
                      type="button"
                      className={styles['ligneJournalCliquable']}
                      onClick={() => setOuverte(prise.id)}
                    >
                      <LigneJournal
                        prise={prise}
                        produit={produitsParId.get(prise.produitId)}
                        substances={substances}
                      />
                    </button>
                  ))}
              </Carte>
            )}
          </section>
        );
      })}

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

function LigneJournal({
  prise,
  produit,
  substances,
}: {
  readonly prise: PriseAvecSubstances;
  readonly produit: Produit | undefined;
  readonly substances: ReadonlyMap<CodeSubstance, Substance>;
}): ReactNode {
  const dominante = [...prise.substances].sort((a, b) => b.quantiteMg - a.quantiteMg)[0];
  const substance = dominante ? substances.get(dominante.code) : undefined;
  const groupe = substance?.groupeAtc ?? '_';

  return (
    <div className={styles['ligneJournal']}>
      <span className={styles['heureJournal']}>{heure(prise.horodatage)}</span>
      <span
        className={styles['pastille']}
        style={{ background: couleurSubstance(groupe, dominante?.code ?? '') }}
      />
      <span>
        <span className={styles['ligneTitre']}>{produit?.nomAffiche ?? 'Produit retiré'}</span>
        <span className={styles['ligneDetail']}>
          {dominante && substance
            ? `${substance.nom.toLowerCase()} ${formaterMg(dominante.quantiteMg)}`
            : 'dosage non exploitable'}
          {` · ${prise.dose} ${produit?.unite ?? 'dose'}`}
          {/* La maquette l'exige : une prise ajoutée après coup est marquée. */}
          {ajouteeApresCoup(prise) ? ' · ajoutée après coup' : ''}
          {prise.statut === 'annulee' ? ' · annulée' : ''}
        </span>
      </span>
    </div>
  );
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
  if (duJour.length === 0) return '';
  const cumul = cumulParSubstance(duJour, { debut: '', fin: '' });
  const totaux = [...cumul.values()]
    .filter((entree) => entree.mg > 0)
    .sort((a, b) => b.mg - a.mg)
    .map((entree) => formaterMg(entree.mg));
  return totaux.join(' · ');
}

function formaterMg(mg: number): string {
  return mg >= 1000
    ? `${(mg / 1000).toLocaleString('fr-FR')} g`
    : `${Math.round(mg).toLocaleString('fr-FR')} mg`;
}

function heure(horodatage: string): string {
  return horodatage.slice(11, 16);
}

/** Les `JOURS_AFFICHES` derniers jours, du plus récent au plus ancien. */
function joursDescendants(instant: string, combien: number): string[] {
  const jours: string[] = [];
  const depart = new Date(instant.slice(0, 10));
  for (let recul = 0; recul < combien; recul += 1) {
    const jour = new Date(depart);
    jour.setDate(depart.getDate() - recul);
    jours.push(jour.toISOString().slice(0, 10));
  }
  return jours;
}

function libelleJour(jour: string, instant: string): string {
  const aujourdhui = instant.slice(0, 10);
  const hier = new Date(new Date(aujourdhui).getTime() - 86_400_000).toISOString().slice(0, 10);
  const date = new Date(`${jour}T12:00:00Z`).toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
  if (jour === aujourdhui) return `Aujourd'hui · ${date}`;
  if (jour === hier) return `Hier · ${date}`;
  return date;
}

function moisEnCours(instant: string): string {
  return new Date(`${instant.slice(0, 10)}T12:00:00Z`).toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
