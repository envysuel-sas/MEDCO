/**
 * Saisie rapide (maquette 1e, spec §12.4).
 *
 * Contrainte qui prime sur toute considération de mise en page : enregistrer
 * une prise en **moins de cinq secondes**, deux appuis dans le cas courant —
 * produit récent, puis Enregistrer.
 */

import { useState } from 'react';
import type { ReactNode } from 'react';

import type { GroupeAtc } from '../../domain/types.js';
import { baseDeDonnees } from '../../db/client.js';
import { maintenant } from '../App.js';
import { useMedco } from '../etat.js';
import { Bouton, Feuille } from '../composants/primitives.js';
import { ChipProduit, SelecteurDose } from '../composants/donnees.js';
import styles from '../composants/composants.module.css';

export function Saisie({
  ouverte,
  onFermer,
}: {
  readonly ouverte: boolean;
  readonly onFermer: () => void;
}): ReactNode {
  const { produits, profilId, rafraichir } = useMedco();
  const [produitId, setProduitId] = useState<string | null>(null);
  const [dose, setDose] = useState(1);
  const [enCours, setEnCours] = useState(false);

  const produit = produits.find((p) => p.id === produitId) ?? produits[0] ?? null;

  async function enregistrer(): Promise<void> {
    if (!produit || !profilId) return;
    setEnCours(true);
    const instant = maintenant();
    try {
      await baseDeDonnees.enregistrerPrise({
        id: crypto.randomUUID(),
        profilId,
        produitId: produit.id,
        horodatage: instant,
        fuseau: Intl.DateTimeFormat().resolvedOptions().timeZone,
        dose,
        saisieLe: instant,
        source: 'manuelle',
      });
      await rafraichir(instant);
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
      enTeteSecondaire={<Bouton variante="texte">maintenant ▾</Bouton>}
    >
      <div className={styles['grilleProduits']}>
        {produits.slice(0, 8).map((entree) => (
          <ChipProduit
            key={entree.id}
            nom={entree.nomAffiche}
            dosage={entree.unite ?? ''}
            groupe={'_' as GroupeAtc}
            codeSubstance={entree.id}
            selectionne={entree.id === produit?.id}
            onClick={() => setProduitId(entree.id)}
          />
        ))}
      </div>

      <SelecteurDose
        dose={dose}
        unite={produit?.unite ?? 'dose'}
        equivalent={produit?.nomAffiche ?? ''}
        onChanger={setDose}
      />

      <div style={{ marginTop: 'var(--espace-9)' }}>
        <Bouton pleineLargeur disabled={!produit || enCours} onClick={() => void enregistrer()}>
          Enregistrer
        </Bouton>
      </div>
    </Feuille>
  );
}
