/**
 * Saisie rapide (maquette 1e, spec §12.4).
 *
 * Contrainte qui prime sur toute considération de mise en page : enregistrer
 * une prise en **moins de cinq secondes**, deux appuis dans le cas courant —
 * produit récent, puis Enregistrer.
 *
 * ⚠ §12.2 — la couleur d'un produit vient du groupe ATC de sa substance
 * dominante, jamais d'une valeur par défaut. C'est une des trois règles qui
 * priment sur la maquette.
 *
 * ⚠ §6.4 — l'équivalent en milligrammes est la raison d'être de l'écran :
 * c'est lui qui dit ce qu'on verse réellement, indépendamment de la boîte.
 * Il ne s'affiche que si le dosage est exploitable ; sinon l'écran le dit.
 */

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import type { CodeSubstance, GroupeAtc, Produit, Substance } from '../../domain/types.js';
import { baseDeDonnees } from '../../db/client.js';
import { maintenant } from '../App.js';
import { useMedco } from '../etat.js';
import { Bouton, ChampRecherche, EtatVide, Feuille } from '../composants/primitives.js';
import { ChipProduit, SelecteurDose } from '../composants/donnees.js';
import { SelecteurInstant } from '../composants/SelecteurInstant.js';
import styles from '../composants/composants.module.css';

/** Ce qu'un produit verse par unité, une fois le catalogue interrogé. */
interface Apport {
  readonly groupe: GroupeAtc;
  readonly nomSubstance: string;
  readonly mgParUnite: number;
  readonly dosage: string;
  /** Éléments pharmaceutiques quand la boîte en porte plusieurs (§5.1). */
  readonly elements: readonly string[];
}

export function Saisie({
  ouverte,
  onFermer,
  onAjouterProduit,
}: {
  readonly ouverte: boolean;
  readonly onFermer: () => void;
  readonly onAjouterProduit: () => void;
}): ReactNode {
  const { produits, profilId, rafraichir } = useMedco();
  const [produitId, setProduitId] = useState<string | null>(null);
  const [dose, setDose] = useState(1);
  const [enCours, setEnCours] = useState(false);
  const [horodatage, setHorodatage] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [recherche, setRecherche] = useState('');
  const [apports, setApports] = useState<ReadonlyMap<string, Apport>>(new Map());

  // Une recherche, parce que la liste n'était bornée qu'aux huit premiers :
  // au-delà, les produits étaient inatteignables.
  const filtres = useMemo(() => {
    const terme = recherche.trim().toLowerCase();
    if (!terme) return produits;
    return produits.filter((p) => p.nomAffiche.toLowerCase().includes(terme));
  }, [produits, recherche]);

  const produit = filtres.find((p) => p.id === produitId) ?? filtres[0] ?? null;
  const apport = produit ? apports.get(produit.id) : undefined;
  const instantCourant = maintenant();
  const instantPrise = horodatage ?? instantCourant;

  // Le groupe ATC et le dosage viennent du catalogue, pas d'une constante.
  useEffect(() => {
    if (!ouverte || produits.length === 0) return;
    let annule = false;
    void (async () => {
      const trouves = await Promise.all(produits.map((p) => apportDe(p)));
      if (annule) return;
      setApports(new Map(trouves.filter((entree): entree is [string, Apport] => entree !== null)));
    })();
    return () => {
      annule = true;
    };
  }, [ouverte, produits]);

  async function enregistrer(): Promise<void> {
    if (!produit || !profilId) return;
    setEnCours(true);
    setMessage(null);
    try {
      const resultat = await baseDeDonnees.enregistrerPrise({
        id: crypto.randomUUID(),
        profilId,
        produitId: produit.id,
        horodatage: instantPrise,
        fuseau: Intl.DateTimeFormat().resolvedOptions().timeZone,
        dose,
        // `saisie_le` distingue la saisie a posteriori de la prise elle-même.
        saisieLe: instantCourant,
        source: 'manuelle',
      });
      await rafraichir(maintenant());

      // §6.4 — si une ligne n'entre pas dans le cumul, l'UI le dit plutôt que
      // de taire l'absence.
      if (resultat.substances === 0) {
        setMessage(
          resultat.exclues.length > 0
            ? `Prise enregistrée. Dosage non exploitable pour ${resultat.exclues
                .map((e) => e.nom.toLowerCase())
                .join(', ')} — elle n’entre pas dans le cumul.`
            : 'Prise enregistrée. Aucune substance exploitable — elle n’entre pas dans le cumul.',
        );
        return;
      }
      setHorodatage(null);
      setRecherche('');
      onFermer();
    } finally {
      setEnCours(false);
    }
  }

  return (
    <Feuille
      ouverte={ouverte}
      titre="Enregistrer une prise"
      onFermer={onFermer}
      enTeteSecondaire={
        <span className={styles['meta']}>
          {horodatage ? new Date(horodatage).toLocaleString('fr-FR') : 'maintenant'}
        </span>
      }
    >
      {produits.length === 0 ? (
        <EtatVide
          titre="Aucun produit dans votre carnet."
          texte="Ajoutez d’abord un médicament : c’est sa composition qui permet de compter les substances."
          action={
            <Bouton
              onClick={() => {
                onFermer();
                onAjouterProduit();
              }}
            >
              Ajouter un produit
            </Bouton>
          }
        />
      ) : (
        <>
          {produits.length > 6 ? (
            <ChampRecherche
              value={recherche}
              placeholder="Chercher un produit"
              onChange={(evenement) => setRecherche(evenement.target.value)}
            />
          ) : null}

          {filtres.length === 0 ? (
            <EtatVide
              titre={`Aucun produit ne correspond à « ${recherche.trim()} ».`}
              texte="Il n’est peut-être pas encore dans votre carnet."
              action={
                <Bouton
                  variante="secondaire"
                  onClick={() => {
                    onFermer();
                    onAjouterProduit();
                  }}
                >
                  Ajouter un produit
                </Bouton>
              }
            />
          ) : (
            <div className={styles['grilleProduits']}>
              {filtres.map((entree) => {
                const sien = apports.get(entree.id);
                return (
                  <ChipProduit
                    key={entree.id}
                    nom={entree.nomAffiche}
                    dosage={sien?.dosage ?? ''}
                    groupe={sien?.groupe ?? '_'}
                    codeSubstance={entree.id}
                    selectionne={entree.id === produit?.id}
                    onClick={() => setProduitId(entree.id)}
                  />
                );
              })}
            </div>
          )}

          {produit ? (
            <>
              <SelecteurDose
                dose={dose}
                unite={produit.unite ?? 'dose'}
                equivalent={equivalent(apport, dose)}
                onChanger={setDose}
              />

              {apport && apport.elements.length > 1 && !produit.element ? (
                <p className={styles['meta']} style={{ marginTop: 'var(--espace-5)' }}>
                  Cette boîte contient plusieurs formes ({apport.elements.join(', ')}). Précisez
                  laquelle dans la fiche du produit : sans ce choix, la prise est enregistrée mais
                  n’entre pas dans le cumul.
                </p>
              ) : null}

              <div style={{ marginTop: 'var(--espace-9)' }}>
                <SelecteurInstant
                  valeur={instantPrise}
                  maximum={instantCourant}
                  onChanger={setHorodatage}
                />
              </div>
            </>
          ) : null}

          {message ? (
            <p className={styles['meta']} style={{ marginTop: 'var(--espace-6)' }}>
              {message}
            </p>
          ) : null}

          <div style={{ marginTop: 'var(--espace-9)' }}>
            <Bouton pleineLargeur disabled={!produit || enCours} onClick={() => void enregistrer()}>
              Enregistrer
            </Bouton>
          </div>
        </>
      )}
    </Feuille>
  );
}

/** Texte sous le sélecteur de dose : ce que la prise verse réellement. */
function equivalent(apport: Apport | undefined, dose: number): string {
  if (!apport) return '';
  if (apport.mgParUnite <= 0) return 'dosage non exploitable — hors cumul';
  const total = apport.mgParUnite * dose;
  const valeur = total >= 1000 ? `${(total / 1000).toLocaleString('fr-FR')} g` : `${total.toLocaleString('fr-FR')} mg`;
  return `${valeur} de ${apport.nomSubstance.toLowerCase()}`;
}

/**
 * Interroge le catalogue pour un produit : groupe ATC, dosage et substance
 * dominante. Un produit libre, sans CIS, n'a pas de composition catalogue.
 */
async function apportDe(produit: Produit): Promise<[string, Apport] | null> {
  if (!produit.cis) return null;

  const composition = await baseDeDonnees.compositionDe(produit.cis);
  // ⚠ R1 — une seule ligne comptée par liaison. `comptee` porte déjà l'arbitrage
  // fait par le pipeline : ne jamais resommer SA et FT ici.
  const comptees = composition.filter((l) => l.comptee);
  const elements = [...new Set(composition.map((l) => l.element))];
  const retenues = produit.element ? comptees.filter((l) => l.element === produit.element) : comptees;
  if (retenues.length === 0) return null;

  // La substance dominante donne la couleur et le libellé, comme sur les
  // autres écrans.
  const dominante = [...retenues].sort((a, b) => (b.doseParUnite ?? 0) - (a.doseParUnite ?? 0))[0];
  if (!dominante) return null;

  const substances = new Map(
    (await baseDeDonnees.substancesDuCatalogue([dominante.codeSubstance])) as unknown as [
      CodeSubstance,
      Substance,
    ][],
  );
  const substance = substances.get(dominante.codeSubstance);

  return [
    produit.id,
    {
      groupe: substance?.groupeAtc ?? '_',
      nomSubstance: substance?.nom ?? dominante.codeSubstance,
      mgParUnite: dominante.doseParUnite ?? 0,
      dosage: dominante.doseParUnite ? String(dominante.doseParUnite) : '',
      elements,
    },
  ];
}
