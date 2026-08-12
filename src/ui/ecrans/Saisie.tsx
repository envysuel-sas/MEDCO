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
import { SelecteurInstant } from '../composants/SelecteurInstant.js';
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
  const [horodatage, setHorodatage] = useState<string | null>(null);
  const [exclues, setExclues] = useState<number>(0);

  const produit = produits.find((p) => p.id === produitId) ?? produits[0] ?? null;
  const instantCourant = maintenant();
  const instantPrise = horodatage ?? instantCourant;

  async function enregistrer(): Promise<void> {
    if (!produit || !profilId) return;
    setEnCours(true);
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
        setExclues(resultat.exclues.length);
        return;
      }
      setHorodatage(null);
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
        <SelecteurInstant
          valeur={instantPrise}
          maximum={instantCourant}
          onChanger={setHorodatage}
        />
      </div>

      {exclues > 0 ? (
        <p className={styles['meta']} style={{ marginTop: 'var(--espace-6)' }}>
          Prise enregistrée. Dosage non exploitable — elle n&apos;entre pas dans le cumul.
        </p>
      ) : null}

      <div style={{ marginTop: 'var(--espace-9)' }}>
        <Bouton pleineLargeur disabled={!produit || enCours} onClick={() => void enregistrer()}>
          Enregistrer
        </Bouton>
      </div>
    </Feuille>
  );
}
