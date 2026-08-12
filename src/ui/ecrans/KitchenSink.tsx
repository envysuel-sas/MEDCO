/**
 * `/kitchen-sink` — **tous** les composants, dans **tous** leurs états.
 *
 * C'est la page comparée à la maquette côte à côte, sur téléphone. Un
 * composant absent d'ici est considéré comme non livré (`/CLAUDE.md`).
 *
 * Les valeurs affichées sont des exemples d'interface, pas des données
 * médicales : aucune composition n'est inventée ici, seuls des libellés
 * servent à faire rendre les états.
 */

import { useState } from 'react';
import type { ReactNode } from 'react';

import type { GroupeAtc } from '../../domain/types.js';
import type { Signal } from '../../domain/regles.js';
import { COULEUR_ATC, LIBELLE_GROUPE_ATC, couleurSubstance } from '../tokens.js';
import {
  Bouton,
  Carte,
  ChampRecherche,
  Chip,
  Etiquette,
  EtatVide,
  Feuille,
  Pas,
  TitreEcran,
} from '../composants/primitives.js';
import {
  CarteSignal,
  ChipProduit,
  Citation,
  CumulJour,
  JaugeLineaire,
  LigneResultat,
  ListePrises,
  PastilleAtc,
  Plaquette,
  SelecteurDose,
} from '../composants/donnees.js';
import type { Alveole, LignePriseAffichee } from '../composants/donnees.js';
import { BlocMoment, PilulierSemaine } from '../composants/pilulier.js';
import type { CelluleSemaine, OccurrenceAffichee } from '../composants/pilulier.js';
import styles from '../composants/composants.module.css';

const GROUPES: GroupeAtc[] = ['N', 'M', 'A', 'R', 'J', 'C', 'D', 'G', 'B', 'S', 'H', '_'];

const SIGNAL: Signal = {
  regleId: 'ANTALG-30J',
  type: 'jours_de_prise',
  niveau: 'vigilance',
  valeur: 18,
  seuil: 15,
  unite: 'jours',
  libelleCible: 'antalgique',
  message: 'MSG_ANTALG_30J',
  citation:
    "L'abus médicamenteux est défini par la prise régulière depuis plus de trois mois, plus de 15 jours par mois, d'antalgiques non opioïdes (paracétamol, aspirine, anti-inflammatoires non stéroïdiens).",
  source: {
    libelle: 'HAS — Céphalées chroniques quotidiennes',
    url: 'https://www.has-sante.fr/upload/docs/application/pdf/ccq_recos.pdf',
    consulte_le: '2026-08-12',
  },
  declencheLe: '2026-08-12T20:00:00+02:00',
};

function alveolesExemple(nbJours: number, avecPrises: boolean): Alveole[] {
  // Motif déterministe : la page doit être identique d'un rendu à l'autre pour
  // pouvoir être comparée à la maquette.
  const alveoles: Alveole[] = Array.from({ length: 2 }, () => ({
    jour: null,
    bandes: [],
    description: 'hors période',
  }));
  for (let index = 0; index < nbJours; index += 1) {
    const nb = avecPrises ? [0, 1, 0, 2, 3, 0, 1][index % 7]! : 0;
    const groupe: GroupeAtc = index % 5 === 0 ? 'M' : 'N';
    const double = avecPrises && index % 9 === 4;
    alveoles.push({
      jour: `j-${index}`,
      aujourdhui: index === nbJours - 1,
      bandes:
        nb === 0
          ? []
          : double
            ? [
                { hauteur: '58%', couleur: COULEUR_ATC.N, opacite: 0.7 },
                { hauteur: '42%', couleur: COULEUR_ATC.A, opacite: 0.4 },
              ]
            : [{ hauteur: '100%', couleur: COULEUR_ATC[groupe], opacite: nb >= 3 ? 1 : nb === 2 ? 0.7 : 0.4 }],
      description: nb === 0 ? 'aucune prise' : `${nb} prise${nb > 1 ? 's' : ''}`,
    });
  }
  return alveoles;
}

const PRISES: LignePriseAffichee[] = [
  {
    id: '1',
    heure: '08:12',
    nom: 'Doliprane 1000 mg',
    detail: 'paracétamol 1 000 mg',
    appoint: '1 cp',
    groupe: 'N',
    codeSubstance: '02202',
  },
  {
    id: '2',
    heure: '14:30',
    nom: 'Advil 400 mg',
    detail: 'ibuprofène 400 mg',
    appoint: '1 cp',
    groupe: 'M',
    codeSubstance: '02092',
    ajouteeApresCoup: true,
  },
  {
    id: '3',
    heure: '19:05',
    nom: 'Humex gorge irritée',
    detail: 'lidocaïne',
    appoint: '1 gomme',
    groupe: '_',
    codeSubstance: '05432',
    exclueDuCumul: true,
  },
  {
    id: '4',
    heure: '21:40',
    nom: 'Spasfon',
    detail: 'phloroglucinol 80 mg',
    appoint: '2 cp',
    groupe: 'A',
    codeSubstance: '03102',
    annulee: true,
  },
];

const OCCURRENCES: OccurrenceAffichee[] = (
  [
    ['attendue', 'Lévothyrox 75 µg', 'H'],
    ['validee', 'Doliprane 1000 mg', 'N'],
    ['sautee', 'Advil 400 mg', 'M'],
    ['expiree', 'Kardégic 75 mg', 'B'],
  ] as const
).map(([statut, nom, groupe], index) => ({
  occurrence: {
    id: `occ-${index}`,
    planId: 'plan-1',
    profilId: 'p1',
    prevueLe: '2026-08-12T08:00:00+02:00',
    momentId: 'm-matin',
    dose: 1,
    statut,
    priseId: null,
  },
  nomProduit: nom,
  doseLibelle: '1 comprimé',
  groupe: groupe as GroupeAtc,
  codeSubstance: `code-${index}`,
  ...(statut === 'validee' ? { heureReelle: '08:23' } : {}),
}));

function Bloc({ titre, children }: { readonly titre: string; readonly children: ReactNode }): ReactNode {
  return (
    <section style={{ display: 'grid', gap: 'var(--espace-6)' }}>
      <Etiquette>{titre}</Etiquette>
      {children}
    </section>
  );
}

export function KitchenSink(): ReactNode {
  const [feuilleOuverte, setFeuilleOuverte] = useState(false);
  const [dose, setDose] = useState(1);
  const [recherche, setRecherche] = useState('');
  const [filtre, setFiltre] = useState(true);

  const cellules = new Map<string, readonly CelluleSemaine[]>();
  const jours = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  for (const [index, jour] of jours.entries()) {
    cellules.set(`m-matin#${jour}`, [
      { statut: index < 2 ? 'validee' : index === 2 ? 'attendue' : 'attendue', groupe: 'H' },
      { statut: index === 1 ? 'sautee' : 'validee', groupe: 'N' },
    ]);
    cellules.set(`m-soir#${jour}`, [{ statut: index < 2 ? 'validee' : 'attendue', groupe: 'A' }]);
  }

  return (
    <main className={styles['pileEcran']} style={{ paddingTop: 'var(--espace-10)' }}>
      <TitreEcran>Kitchen sink</TitreEcran>
      <p className={styles['meta']}>
        Tous les composants, tous leurs états. Page de comparaison avec la maquette.
      </p>

      <Bloc titre="Boutons">
        <div style={{ display: 'flex', gap: 'var(--espace-5)', flexWrap: 'wrap' }}>
          <Bouton>Enregistrer</Bouton>
          <Bouton disabled>Enregistrer</Bouton>
          <Bouton variante="secondaire">J&apos;ai vu</Bouton>
          <Bouton variante="secondaire" disabled>
            J&apos;ai vu
          </Bouton>
          <Bouton variante="texte">＋ Autre produit</Bouton>
        </div>
        <Bouton pleineLargeur>Enregistrer</Bouton>
        <div style={{ display: 'flex', gap: 'var(--espace-5)' }}>
          <Pas sens="moins" />
          <Pas sens="moins" disabled />
          <Pas sens="plus" />
        </div>
      </Bloc>

      <Bloc titre="Groupes ATC — la couleur porte la molécule">
        <div style={{ display: 'flex', gap: 'var(--espace-5)', flexWrap: 'wrap' }}>
          {GROUPES.map((groupe) => (
            <span key={groupe} style={{ display: 'flex', alignItems: 'center', gap: 'var(--espace-3)' }}>
              <PastilleAtc groupe={groupe} />
              <span className={styles['meta']}>
                {groupe} · {LIBELLE_GROUPE_ATC[groupe]}
              </span>
            </span>
          ))}
        </div>
        <div className={styles['meta']}>
          Variation intra-groupe par hachage stable du code substance (§12.2) :
        </div>
        <div style={{ display: 'flex', gap: 'var(--espace-3)' }}>
          {['02202', '02092', '00005', '00467', '86571'].map((code) => (
            <span
              key={code}
              className={styles['legendePastille']}
              style={{ background: couleurSubstance('N', code) }}
              title={code}
            />
          ))}
        </div>
      </Bloc>

      <Bloc titre="Cumul et jauge — linéaire, jamais circulaire">
        <Carte>
          <CumulJour
            mg={2000}
            repere={3000}
            substance="paracétamol"
            groupe="N"
            codeSubstance="02202"
            detailPrises="2 prises · 08:12 · 14:30"
            fiabiliteMin={2}
          />
        </Carte>
        <Carte>
          <CumulJour
            mg={3400}
            repere={3000}
            substance="paracétamol"
            groupe="N"
            codeSubstance="02202"
            detailPrises="4 prises"
            fiabiliteMin={1}
          />
        </Carte>
        <Carte>
          <CumulJour
            mg={0}
            repere={null}
            substance="aucune substance comptée"
            groupe="_"
            codeSubstance="—"
            detailPrises=""
            fiabiliteMin={2}
          />
        </Carte>
        <Carte>
          <JaugeLineaire valeur={400} repere={1200} couleur={COULEUR_ATC.M} legendeGauche="1 prise" legendeDroite="repère 1 200 mg" />
        </Carte>
      </Bloc>

      <Bloc titre="Plaquette">
        <Carte>
          <div className={styles['entreDeux']}>
            <Etiquette>30 derniers jours</Etiquette>
            <span className={styles['meta']}>18 j de prise</span>
          </div>
          <Plaquette
            alveoles={alveolesExemple(30, true)}
            legende={[
              { couleur: COULEUR_ATC.N, libelle: 'nerveux' },
              { couleur: COULEUR_ATC.M, libelle: 'musculo' },
              { couleur: COULEUR_ATC.A, libelle: 'digestif' },
              { couleur: COULEUR_ATC.R, libelle: 'respiratoire' },
            ]}
          />
        </Carte>
        <Carte>
          <Etiquette>90 derniers jours</Etiquette>
          <Plaquette alveoles={alveolesExemple(90, true)} />
        </Carte>
        <Carte>
          <Etiquette>Aucune prise</Etiquette>
          <Plaquette alveoles={alveolesExemple(30, false)} />
        </Carte>
      </Bloc>

      <Bloc titre="Signal — trois blocs, jamais un quatrième">
        <CarteSignal
          signal={SIGNAL}
          fait="18 jours avec prise d'antalgique sur les 30 derniers jours."
          onAcquitter={() => undefined}
          onDetail={() => undefined}
        />
        <CarteSignal
          signal={{ ...SIGNAL, niveau: 'information', regleId: 'IBU-DUREE' }}
          fait="5 jours consécutifs avec prise d'ibuprofène."
        />
        <CarteSignal
          signal={{ ...SIGNAL, niveau: 'attention', regleId: 'ASSOC-30J' }}
          fait="12 jours avec prise d'antalgique en association sur les 30 derniers jours."
        />
        <Carte>
          <Citation texte="La dose maximale journalière est de 60 mg/kg/jour (avec un maximum de 3 g/j sans ordonnance)." />
        </Carte>
      </Bloc>

      <Bloc titre="Prises du jour">
        <Carte>
          <ListePrises prises={PRISES} />
        </Carte>
        <Carte>
          <ListePrises prises={[]} />
        </Carte>
      </Bloc>

      <Bloc titre="Produits">
        <div className={styles['grilleProduits']}>
          <ChipProduit nom="Doliprane" dosage="1000" groupe="N" codeSubstance="02202" selectionne />
          <ChipProduit nom="Advil" dosage="400" groupe="M" codeSubstance="02092" />
          <ChipProduit nom="Spasfon" dosage="80" groupe="A" codeSubstance="03102" />
          <ChipProduit nom="Aerius" dosage="5" groupe="R" codeSubstance="06431" />
        </div>
        <SelecteurDose
          dose={dose}
          unite={dose > 1 ? 'comprimés' : 'comprimé'}
          equivalent={`${(dose * 1000).toLocaleString('fr-FR')} mg de paracétamol`}
          onChanger={setDose}
        />
      </Bloc>

      <Bloc titre="Recherche">
        <ChampRecherche
          value={recherche}
          placeholder="Nom du médicament ou substance"
          onChange={(evenement) => setRecherche(evenement.target.value)}
        />
        <div style={{ display: 'flex', gap: 'var(--espace-4)', flexWrap: 'wrap' }}>
          <Chip actif={filtre} onClick={() => setFiltre(!filtre)}>
            Sans ordonnance
          </Chip>
          <Chip>Comprimé</Chip>
          <Chip>Groupe N</Chip>
          <Chip>Générique</Chip>
        </div>
        <Carte>
          <LigneResultat
            nom="DOLIPRANE 1000 mg, comprimé"
            substances="PARACÉTAMOL"
            prescription="PMF"
            commercialisee
            onChoisir={() => undefined}
          />
          <LigneResultat
            nom="CODOLIPRANE 500 mg/30 mg, comprimé"
            substances="PARACÉTAMOL CODÉINE"
            prescription="PMO"
            commercialisee
            onChoisir={() => undefined}
          />
          <LigneResultat
            nom="DOLIPRANE 500 mg, gélule"
            substances="PARACÉTAMOL"
            prescription="PMF"
            commercialisee={false}
            onChoisir={() => undefined}
          />
        </Carte>
        <EtatVide
          titre="Aucun résultat pour « doliprne »."
          texte="Vérifiez l'orthographe, ou créez un produit libre."
          action={<Bouton variante="secondaire">Créer un produit libre</Bouton>}
        />
      </Bloc>

      <Bloc titre="Pilulier — vue jour">
        <Carte>
          <BlocMoment
            moment={{ libelle: 'Matin', heure: '08:00' }}
            occurrences={OCCURRENCES}
            onValider={() => undefined}
            onSauter={() => undefined}
            onToutValider={() => undefined}
          />
        </Carte>
      </Bloc>

      <Bloc titre="Pilulier — vue semaine">
        <Carte>
          <PilulierSemaine
            moments={[
              { id: 'm-matin', libelle: 'Matin', heure: '08:00' },
              { id: 'm-soir', libelle: 'Soir', heure: '20:00' },
            ]}
            jours={jours}
            cellules={cellules}
            indexAujourdhui={2}
          />
        </Carte>
      </Bloc>

      <Bloc titre="États vides">
        <Carte>
          <EtatVide
            titre="Aucune prise enregistrée aujourd'hui."
            texte="Le bouton central enregistre une prise en deux appuis."
          />
        </Carte>
        <Carte>
          <EtatVide
            titre="Aucun traitement planifié."
            texte="Créez un plan de prise pour un produit."
            action={<Bouton variante="secondaire">Créer un plan</Bouton>}
          />
        </Carte>
      </Bloc>

      <Bloc titre="Feuille modale">
        <Bouton onClick={() => setFeuilleOuverte(true)}>Ouvrir la feuille</Bouton>
        <Feuille
          ouverte={feuilleOuverte}
          titre="Enregistrer une prise"
          onFermer={() => setFeuilleOuverte(false)}
          enTeteSecondaire={<Bouton variante="texte">maintenant ▾</Bouton>}
        >
          <div className={styles['grilleProduits']}>
            <ChipProduit nom="Doliprane" dosage="1000" groupe="N" codeSubstance="02202" selectionne />
            <ChipProduit nom="Advil" dosage="400" groupe="M" codeSubstance="02092" />
          </div>
          <SelecteurDose dose={1} unite="comprimé" equivalent="1 000 mg de paracétamol" onChanger={() => undefined} />
          <div style={{ marginTop: 'var(--espace-9)' }}>
            <Bouton pleineLargeur onClick={() => setFeuilleOuverte(false)}>
              Enregistrer
            </Bouton>
          </div>
        </Feuille>
      </Bloc>

      <Bloc titre="Typographie">
        <div className={styles['cumulChiffre']}>2 000 mg</div>
        <div className={styles['chiffreSecondaire']}>18 jours</div>
        <TitreEcran>Titre d&apos;écran</TitreEcran>
        <p>Texte courant de l&apos;application, en grotesque géométrique.</p>
        <p className={styles['mono']}>CIS 61234567 · 08:12 · 1 000 mg</p>
        <Citation texte="Le sérif cite, et lui seul." />
        <p className={styles['meta']}>Source ANSM · consultée le 27/07/2026 ↗</p>
      </Bloc>
    </main>
  );
}
