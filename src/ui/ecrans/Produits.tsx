/**
 * Catalogue, recherche et ajout de produit (maquette 1l, spec §11.6).
 *
 * Trois chemins équivalents en permanence : recherche texte, scan, saisie
 * libre (§13). Une caméra refusée ne dégrade aucun parcours.
 *
 * ⚠ Quand une spécialité porte plusieurs éléments pharmaceutiques — HUMEX
 * RHUME est une boîte de comprimés *et* de gélules —, l'écran **demande**
 * lequel est pris. Rien n'est compté tant que la question n'a pas de réponse :
 * sommer les deux compterait deux comprimés pour un seul avalé (R1).
 */

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';

import { elementsDe } from '../../domain/cumul.js';
import type { LigneComposition } from '../../domain/types.js';
import { baseDeDonnees } from '../../db/client.js';
import type { ResultatRecherche } from '../../db/depots.js';
import { maintenant } from '../App.js';
import { useMedco } from '../etat.js';
import {
  Bouton,
  Carte,
  ChampRecherche,
  Chip,
  Etiquette,
  EtatVide,
  Feuille,
  TitreEcran,
} from '../composants/primitives.js';
import { LigneResultat } from '../composants/donnees.js';
import styles from '../composants/composants.module.css';

export function Produits(): ReactNode {
  const naviguer = useNavigate();
  const { produits, profilId, rafraichir } = useMedco();

  const [terme, setTerme] = useState('');
  const [sansOrdonnance, setSansOrdonnance] = useState(false);
  const [resultats, setResultats] = useState<readonly ResultatRecherche[]>([]);
  const [candidate, setCandidate] = useState<ResultatRecherche | null>(null);
  const [composition, setComposition] = useState<LigneComposition[]>([]);
  const [element, setElement] = useState<string | null>(null);

  useEffect(() => {
    if (terme.trim().length < 2) {
      setResultats([]);
      return undefined;
    }
    let annule = false;
    void baseDeDonnees.rechercherSpecialites(terme).then((liste) => {
      if (!annule) setResultats(liste);
    });
    return () => {
      annule = true;
    };
  }, [terme]);

  const filtres = sansOrdonnance ? resultats.filter((r) => r.prescription !== 'PMO') : resultats;
  const elements = elementsDe(composition);

  async function choisir(resultat: ResultatRecherche): Promise<void> {
    const lignes = await baseDeDonnees.compositionDe(resultat.cis);
    setComposition(lignes);
    setElement(elementsDe(lignes).length === 1 ? (elementsDe(lignes)[0] ?? null) : null);
    setCandidate(resultat);
  }

  async function ajouter(): Promise<void> {
    if (!candidate || !profilId) return;
    if (elements.length > 1 && element === null) return;

    const id = crypto.randomUUID();
    const ligne = composition.find((l) => l.comptee && (element === null || l.element === element));
    await baseDeDonnees.creerProduit({
      id,
      profilId,
      cis: candidate.cis,
      cip13: null,
      element: elements.length > 1 ? element : null,
      nomAffiche: candidate.nom,
      // La condition de délivrance du catalogue donne le mode de départ ;
      // la fiche produit permet de le corriger (R2).
      mode: candidate.prescription === 'PMO' ? 'prescrit' : 'libre',
      doseDefaut: 1,
      unite: ligne?.unite ?? null,
      creeLe: maintenant(),
    });
    setCandidate(null);
    await rafraichir(maintenant());
    naviguer(`/produits/${id}`);
  }

  return (
    <main className={styles['pileEcran']} style={{ paddingTop: 'var(--espace-10)' }}>
      <TitreEcran>Produits</TitreEcran>

      <ChampRecherche
        value={terme}
        placeholder="Nom du médicament ou substance"
        onChange={(evenement) => setTerme(evenement.target.value)}
      />

      <div style={{ display: 'flex', gap: 'var(--espace-4)', flexWrap: 'wrap' }}>
        <Chip actif={sansOrdonnance} onClick={() => setSansOrdonnance(!sansOrdonnance)}>
          Sans ordonnance
        </Chip>
        <Bouton variante="texte" onClick={() => naviguer('/scan')}>
          ⛶ Scanner
        </Bouton>
      </div>

      {terme.trim().length >= 2 ? (
        filtres.length > 0 ? (
          <Carte>
            {filtres.map((resultat) => (
              <LigneResultat
                key={resultat.cis}
                nom={resultat.nom}
                substances={resultat.substances}
                prescription={resultat.prescription}
                commercialisee={resultat.commercialisee}
                onChoisir={() => void choisir(resultat)}
              />
            ))}
          </Carte>
        ) : (
          <EtatVide
            titre={`Aucun résultat pour « ${terme} ».`}
            texte="Vérifiez l'orthographe, ou créez un produit libre."
            action={<Bouton variante="secondaire">Créer un produit libre</Bouton>}
          />
        )
      ) : produits.length > 0 ? (
        <Carte>
          <Etiquette>Mes produits</Etiquette>
          {produits.map((produit) => (
            <Link key={produit.id} to={`/produits/${produit.id}`} className={styles['lignePrise']}>
              <span className={styles['ligneCorps']}>
                <span className={styles['ligneTitre']}>{produit.nomAffiche}</span>
                <span className={styles['ligneDetail']}>
                  {produit.mode === 'prescrit' ? 'Prescrit' : 'Sans ordonnance'}
                  {produit.element ? ` · ${produit.element}` : ''}
                </span>
              </span>
            </Link>
          ))}
        </Carte>
      ) : (
        <EtatVide
          titre="Cherchez un médicament par son nom ou sa substance."
          texte="Le catalogue couvre l'intégralité de la base publique française."
        />
      )}

      <Feuille
        ouverte={candidate !== null}
        titre="Ajouter ce produit"
        onFermer={() => setCandidate(null)}
      >
        <p className={styles['ligneTitre']}>{candidate?.nom}</p>
        <p className={styles['meta']}>{candidate?.substances.toLowerCase()}</p>

        {elements.length > 1 ? (
          <div style={{ marginTop: 'var(--espace-8)' }}>
            <Etiquette>Quel élément prenez-vous ?</Etiquette>
            <p className={styles['meta']}>
              Cette boîte en contient plusieurs, dosés différemment. Sans cette précision, une prise
              ne peut pas être comptée.
            </p>
            <div style={{ display: 'flex', gap: 'var(--espace-4)', flexWrap: 'wrap', marginTop: 'var(--espace-5)' }}>
              {elements.map((nom) => (
                <Chip key={nom} actif={element === nom} onClick={() => setElement(nom)}>
                  {nom}
                </Chip>
              ))}
            </div>
          </div>
        ) : null}

        <div style={{ marginTop: 'var(--espace-9)' }}>
          <Bouton
            pleineLargeur
            disabled={elements.length > 1 && element === null}
            onClick={() => void ajouter()}
          >
            Ajouter à mes produits
          </Bouton>
        </div>
      </Feuille>
    </main>
  );
}
