/**
 * Catalogue et recherche (maquette 1l, spec §11.6).
 *
 * Trois chemins équivalents en permanence : recherche texte, scan, saisie
 * libre (§13). Une caméra refusée ne dégrade aucun parcours.
 */

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import { baseDeDonnees } from '../../db/client.js';
import type { ResultatRecherche } from '../../db/depots.js';
import { Bouton, Carte, ChampRecherche, Chip, EtatVide, TitreEcran } from '../composants/primitives.js';
import { LigneResultat } from '../composants/donnees.js';
import styles from '../composants/composants.module.css';

export function Produits(): ReactNode {
  const [terme, setTerme] = useState('');
  const [sansOrdonnance, setSansOrdonnance] = useState(false);
  const [resultats, setResultats] = useState<readonly ResultatRecherche[]>([]);

  useEffect(() => {
    if (terme.trim().length < 2) {
      setResultats([]);
      return;
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
      </div>

      {filtres.length > 0 ? (
        <Carte>
          {filtres.map((resultat) => (
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
      ) : terme.trim().length >= 2 ? (
        <EtatVide
          titre={`Aucun résultat pour « ${terme} ».`}
          texte="Vérifiez l'orthographe, ou créez un produit libre."
          action={<Bouton variante="secondaire">Créer un produit libre</Bouton>}
        />
      ) : (
        <EtatVide
          titre="Cherchez un médicament par son nom ou sa substance."
          texte="Le catalogue couvre l'intégralité de la base publique française."
        />
      )}
    </main>
  );
}
