/**
 * Fiche produit (maquette 1i, spec §11.4).
 *
 * ⚠ R2 — c'est ici que se règle `mode`. Un produit « prescrit » est exempté
 * des signaux de fréquence : le bouton dit ce qu'il change, et l'écran ne
 * suggère jamais de réduire, d'espacer ou d'arrêter.
 */

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import type { LigneComposition, Mode, Produit as ProduitDomaine, Substance } from '../../domain/types.js';
import { baseDeDonnees } from '../../db/client.js';
import { useMedco } from '../etat.js';
import { maintenant } from '../App.js';
import { Bouton, Carte, Chip, Etiquette, TitreEcran } from '../composants/primitives.js';
import { PastilleAtc } from '../composants/donnees.js';
import styles from '../composants/composants.module.css';

export function Produit(): ReactNode {
  const { produitId } = useParams();
  const naviguer = useNavigate();
  const { rafraichir } = useMedco();

  const [produit, setProduit] = useState<ProduitDomaine | null>(null);
  const [composition, setComposition] = useState<LigneComposition[]>([]);
  const [substances, setSubstances] = useState<Map<string, Substance>>(new Map());

  useEffect(() => {
    if (!produitId) return;
    void (async () => {
      const fiche = await baseDeDonnees.produit(produitId);
      setProduit(fiche);
      if (!fiche?.cis) return;
      const lignes = await baseDeDonnees.compositionDe(fiche.cis);
      const retenues = fiche.element ? lignes.filter((l) => l.element === fiche.element) : lignes;
      setComposition(retenues);
      setSubstances(
        new Map(
          (await baseDeDonnees.substancesDuCatalogue(
            retenues.map((l) => l.codeSubstance),
          )) as unknown as [string, Substance][],
        ),
      );
    })();
  }, [produitId]);

  if (!produit) {
    return (
      <main className={styles['pileEcran']} style={{ paddingTop: 'var(--espace-10)' }}>
        <p className={styles['meta']}>Produit introuvable.</p>
      </main>
    );
  }

  async function changerMode(mode: Mode): Promise<void> {
    if (!produitId) return;
    await baseDeDonnees.definirModeProduit(produitId, mode);
    setProduit((precedent) => (precedent ? { ...precedent, mode } : precedent));
    await rafraichir(maintenant());
  }

  return (
    <main className={styles['pileEcran']} style={{ paddingTop: 'var(--espace-10)' }}>
      <TitreEcran>{produit.nomAffiche}</TitreEcran>
      {produit?.cis ? (
        <Link className={styles['source']} to={`/notice/${produit.cis}`}>
          Notice et RCP officiels →
        </Link>
      ) : null}
      {produit.cis ? <p className={styles['mono']}>CIS {produit.cis}</p> : null}
      {produit.element ? <p className={styles['meta']}>Élément : {produit.element}</p> : null}

      <Carte>
        <Etiquette>Composition</Etiquette>
        {composition.length === 0 ? (
          <p className={styles['meta']}>Composition non disponible pour ce produit.</p>
        ) : (
          composition.map((ligne) => {
            const substance = substances.get(ligne.codeSubstance);
            return (
              <div key={`${ligne.element}-${ligne.codeSubstance}-${ligne.nature}`} className={styles['lignePrise']}>
                <PastilleAtc
                  groupe={substance?.groupeAtc ?? '_'}
                  codeSubstance={ligne.codeSubstance}
                  taille="petite"
                />
                <span className={styles['ligneCorps']}>
                  <Link to={`/substances/${ligne.codeSubstance}`} className={styles['ligneTitre']}>
                    {substance?.nom ?? ligne.codeSubstance}
                  </Link>
                  <span className={styles['ligneDetail']}>
                    {ligne.comptee && ligne.doseParUnite !== null
                      ? `${ligne.doseParUnite} mg par ${ligne.unite ?? 'unité'}`
                      : 'Dosage non exploitable — cette ligne n’entre pas dans le cumul'}
                    {ligne.fiabilite === 1 ? ' · valeur dérivée' : ''}
                  </span>
                </span>
              </div>
            );
          })
        )}
      </Carte>

      <Carte>
        <Etiquette>Mode</Etiquette>
        <p className={styles['meta']}>
          Un traitement prescrit n&apos;est jamais concerné par les repères de fréquence.
        </p>
        <div style={{ display: 'flex', gap: 'var(--espace-4)', marginTop: 'var(--espace-5)' }}>
          <Chip actif={produit.mode === 'libre'} onClick={() => void changerMode('libre')}>
            Sans ordonnance
          </Chip>
          <Chip actif={produit.mode === 'prescrit'} onClick={() => void changerMode('prescrit')}>
            Prescrit
          </Chip>
        </div>
      </Carte>

      <Bouton variante="secondaire" pleineLargeur onClick={() => naviguer(`/plans/${produit.id}`)}>
        Créer un plan de prise
      </Bouton>

      <Bouton
        variante="texte"
        onClick={() =>
          void baseDeDonnees.archiverProduit(produit.id).then(() => {
            void rafraichir(maintenant());
            naviguer('/produits');
          })
        }
      >
        Retirer de mes produits
      </Bouton>
    </main>
  );
}
