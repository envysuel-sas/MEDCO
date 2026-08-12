/**
 * Complément du jeu doré : les branches que les cas fondateurs ne traversent
 * pas. Spec §16 — couverture de branches à 100 % sur `cumul`, `regles` et
 * `occurrences`.
 *
 * Les compositions viennent toujours du catalogue réel. Seules les entrées du
 * validateur sont écrites à la main : ce sont des cas de format, pas des
 * données médicales.
 */

import { describe, expect, it } from 'vitest';

import { classeSpecialite, compositionDe, nomSpecialite, substance } from './catalogue-reel.js';
import {
  cumulParSubstance,
  elementsDe,
  joursDePrise,
  quantiteDe,
  substancesPourPrise,
} from '../cumul.js';
import { evaluer, filtrerAcquittes, validerBundle } from '../regles.js';
import type { Regle } from '../regles.js';
import { analyserRrule, expirer, genererOccurrences, regenerer } from '../occurrences.js';
import {
  ajouterJours,
  dureeMs,
  ecartEnJours,
  epoch,
  fenetreGlissante,
  heureLocale,
  instantDepuisEpoch,
  instantLocal,
  jourSemaine,
} from '../temps.js';
import type {
  Classe,
  CodeSubstance,
  Instant,
  Mode,
  Plan,
  PriseAvecSubstances,
  Produit,
} from '../types.js';

const PARIS = 'Europe/Paris';
const DOLIPRANE_1000 = '60234100';
const ADVIL_400 = '63646874';
const CODOLIPRANE = '60904643';
const ATURGYL = '63581266';

function prise(
  cis: string,
  horodatage: Instant,
  options: { dose?: number; mode?: Mode; statut?: 'prise' | 'annulee'; element?: string } = {},
): { prise: PriseAvecSubstances; produit: Produit } {
  const lignes = compositionDe(cis);
  const classes = new Map<CodeSubstance, Classe>(
    lignes.map((l) => [l.codeSubstance, substance(l.codeSubstance)?.classe ?? 'AUTRE']),
  );
  const dose = options.dose ?? 1;
  const { substances } = substancesPourPrise(lignes, dose, classes, options.element ?? null);
  return {
    prise: {
      id: `${cis}@${horodatage}`,
      profilId: 'p1',
      produitId: `prod-${cis}`,
      horodatage,
      fuseau: PARIS,
      dose,
      statut: options.statut ?? 'prise',
      substances,
    },
    produit: {
      id: `prod-${cis}`,
      profilId: 'p1',
      cis,
      element: options.element ?? null,
      nomAffiche: nomSpecialite(cis) ?? cis,
      mode: options.mode ?? 'libre',
      unite: lignes.find((l) => l.comptee)?.unite ?? null,
      stock: null,
      classe: classeSpecialite(cis),
    },
  };
}

const SOURCE = {
  libelle: 'Source de test',
  url: 'https://exemple.fr/repere',
  consulte_le: '2026-01-01',
};

function regleValide(partiel: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'TEST',
    type: 'cumul_fenetre',
    cible: { substances: ['02202'] },
    mode: ['libre'],
    fenetre: 'PT24H',
    seuil: 3000,
    unite: 'mg',
    niveau: 'vigilance',
    message: 'MSG',
    citation: 'Repère publié.',
    source: SOURCE,
    ...partiel,
  };
}

function chargee(partiel: Partial<Record<string, unknown>> = {}): Regle {
  const bundle = validerBundle({ version: '2026.01.01', regles: [regleValide(partiel)] });
  expect(bundle.erreurs).toEqual([]);
  return bundle.regles[0]!;
}

// ---------------------------------------------------------------------------

describe('temps', () => {
  it('lit une durée ISO 8601 et rejette ce qu’il ne sait pas lire', () => {
    expect(dureeMs('PT24H')).toBe(86_400_000);
    expect(dureeMs('P30D')).toBe(30 * 86_400_000);
    expect(dureeMs('PT90M')).toBe(90 * 60_000);
    expect(() => dureeMs('P1Y')).toThrow(/non gérée/);
    expect(() => dureeMs('PT0H')).toThrow(/nulle/);
  });

  it('refuse un instant illisible plutôt que de produire un calcul faux', () => {
    expect(() => epoch('pas une date')).toThrow(/illisible/);
  });

  it('sait décaler des jours et mesurer un écart', () => {
    expect(ajouterJours('2026-02-28', 1)).toBe('2026-03-01');
    expect(ecartEnJours('2026-08-01', '2026-08-31')).toBe(30);
    expect(jourSemaine('2026-08-12')).toBe('WE');
    expect(heureLocale('2026-08-12T21:30:00+02:00')).toBe('21:30');
  });

  it('construit une fenêtre glissante finissant à l’instant donné', () => {
    const fenetre = fenetreGlissante('2026-08-12T22:00:00+02:00', 'PT24H');
    expect(epoch(fenetre.fin) - epoch(fenetre.debut)).toBe(86_400_000);
  });

  it('écrit un instant absolu dans un fuseau donné', () => {
    const instant = epoch('2026-08-12T12:00:00Z');
    expect(instantDepuisEpoch(instant, PARIS)).toBe('2026-08-12T14:00:00+02:00');
    expect(instantDepuisEpoch(instant, 'UTC')).toBe('2026-08-12T12:00:00+00:00');
  });

  it('décale une heure murale inexistante au lieu de la perdre', () => {
    // 29 mars 2026, 02:30 n'existe pas à Paris.
    const instant = instantLocal('2026-03-29', '02:30', PARIS);
    expect(instant.slice(0, 10)).toBe('2026-03-29');
    expect(instant.endsWith('+02:00')).toBe(true);
  });
});

describe('cumul — branches complémentaires', () => {
  it('fusionne une substance présente sur deux lignes du même élément', () => {
    // ACTIFED RHUME JOUR ET NUIT : deux comprimés distincts dans la boîte.
    const lignes = compositionDe('60206332');
    expect(elementsDe(lignes).length).toBeGreaterThan(1);

    const duplique = lignes
      .filter((l) => l.element === 'comprimé bleu')
      .flatMap((l) => [l, { ...l, numLiaison: l.numLiaison + 100 }]);
    const { substances } = substancesPourPrise(duplique, 1, new Map(), 'comprimé bleu');
    const paracetamol = substances.find((s) => s.code === '02202');
    expect(paracetamol?.quantiteMg).toBe(1000); // 500 + 500, une seule entrée
    expect(substances.filter((s) => s.code === '02202')).toHaveLength(1);
  });

  it('retient la fiabilité la plus basse lors d’une fusion', () => {
    const lignes = compositionDe(DOLIPRANE_1000);
    const melange = [
      ...lignes,
      { ...lignes[0]!, numLiaison: 99, fiabilite: 1 as const, doseParUnite: 10 },
    ];
    const { substances } = substancesPourPrise(melange, 1, new Map());
    expect(substances[0]!.fiabilite).toBe(1);
  });

  it('classe une substance inconnue en AUTRE plutôt que d’inventer', () => {
    const { substances } = substancesPourPrise(compositionDe(DOLIPRANE_1000), 1, new Map());
    expect(substances[0]!.classe).toBe('AUTRE');
  });

  it('multiplie par la dose', () => {
    const classes = new Map<CodeSubstance, Classe>([['02202', 'ANTALGIQUE_SIMPLE']]);
    const { substances } = substancesPourPrise(compositionDe(DOLIPRANE_1000), 2, classes);
    expect(substances[0]!.quantiteMg).toBe(2000);
    expect(substances[0]!.classe).toBe('ANTALGIQUE_SIMPLE');
  });

  it('exclut une prise hors fenêtre', () => {
    const dedans = prise(DOLIPRANE_1000, '2026-08-12T08:00:00+02:00').prise;
    const dehors = prise(DOLIPRANE_1000, '2026-08-14T08:00:00+02:00').prise;
    const cumul = cumulParSubstance([dedans, dehors], {
      debut: '2026-08-12T00:00:00+02:00',
      fin: '2026-08-13T00:00:00+02:00',
    });
    expect(cumul.get('02202')?.mg).toBe(1000);
  });

  it('ne compte pas une prise annulée dans les jours de prise', () => {
    const jours = joursDePrise([
      prise(DOLIPRANE_1000, '2026-08-12T08:00:00+02:00').prise,
      prise(DOLIPRANE_1000, '2026-08-13T08:00:00+02:00', { statut: 'annulee' }).prise,
    ]);
    expect([...jours]).toEqual(['2026-08-12']);
  });

  it('retourne 0 pour une substance absente d’une prise', () => {
    const { prise: doliprane } = prise(DOLIPRANE_1000, '2026-08-12T08:00:00+02:00');
    expect(quantiteDe(doliprane, '02202')).toBe(1000);
    expect(quantiteDe(doliprane, '02092')).toBe(0);
  });
});

describe('règles — validation', () => {
  it('accepte une règle complète', () => {
    expect(validerBundle({ version: '1', regles: [regleValide()] }).erreurs).toEqual([]);
  });

  it('supporte une entrée qui n’est pas un bundle', () => {
    expect(validerBundle(null).regles).toEqual([]);
    expect(validerBundle({ regles: 'pas un tableau' }).version).toBe('');
  });

  const refus: [string, Record<string, unknown>, string][] = [
    ['sans identifiant', { id: undefined }, 'identifiant_manquant'],
    ['de type inconnu', { type: 'interaction' }, 'type_inconnu'],
    ['sans mode', { mode: [] }, 'mode_invalide'],
    ['à mode non listé', { mode: 'libre' }, 'mode_invalide'],
    ['sans cible du tout', { cible: undefined }, 'cible_vide'],
    ['sans bloc source', { source: undefined }, 'source_incomplete'],
    ['de mode inconnu', { mode: ['peut-être'] }, 'mode_invalide'],
    ['sans cible', { cible: {} }, 'cible_vide'],
    ['à cible inconnue', { cible: { substances: ['02202'], produits: ['x'] } }, 'cible_inconnue'],
    ['à seuil nul', { seuil: 0 }, 'seuil_invalide'],
    ['à seuil non numérique', { seuil: 'beaucoup' }, 'seuil_invalide'],
    ['à niveau inconnu', { niveau: 'urgence' }, 'niveau_invalide'],
    ['sans fenêtre', { fenetre: undefined }, 'fenetre_manquante'],
    ['sans citation', { citation: '' }, 'citation_manquante'],
    ['sans source', { source: {} }, 'source_incomplete'],
    ['à source non chiffrée', { source: { ...SOURCE, url: 'http://exemple.fr' } }, 'source_incomplete'],
    ['à date mal formée', { source: { ...SOURCE, consulte_le: '27/07/2026' } }, 'source_incomplete'],
    ['à libellé de source vide', { source: { ...SOURCE, libelle: '' } }, 'source_incomplete'],
  ];

  it.each(refus)('rejette une règle %s', (_libelle, partiel, code) => {
    const bundle = validerBundle({ version: '1', regles: [regleValide(partiel)] });
    expect(bundle.regles).toHaveLength(0);
    expect(bundle.erreurs.map((e) => e.code)).toContain(code);
  });

  it('tolère l’absence d’unité et de message sans inventer de contenu', () => {
    const regle = chargee({ unite: undefined, message: undefined });
    expect(regle.unite).toBe('');
    expect(regle.message).toBe('');
  });

  it('conserve le libellé de cible quand il est fourni', () => {
    const regle = chargee({ cible: { substances: ['02202'], libelle: 'paracétamol' } });
    expect(regle.cible.libelle).toBe('paracétamol');
  });

  it('accepte une cible par classes seules', () => {
    const regle = chargee({
      type: 'jours_de_prise',
      fenetre: 'P30D',
      cible: { classes: ['ANTALGIQUE_SIMPLE'] },
      seuil: 15,
    });
    expect(regle.cible.classes).toEqual(['ANTALGIQUE_SIMPLE']);
    expect(regle.cible.substances).toBeUndefined();
  });
});

describe('règles — évaluation', () => {
  it('ignore une prise dont le produit est inconnu', () => {
    const { prise: p } = prise(DOLIPRANE_1000, '2026-08-12T08:00:00+02:00');
    expect(evaluer({ prises: [p], produits: [] }, [chargee()], '2026-08-12T09:00:00+02:00')).toEqual(
      [],
    );
  });

  it('ignore une règle qu’aucune prise ne concerne', () => {
    const { prise: p, produit } = prise(ADVIL_400, '2026-08-12T08:00:00+02:00');
    expect(
      evaluer({ prises: [p], produits: [produit] }, [chargee()], '2026-08-12T09:00:00+02:00'),
    ).toEqual([]);
  });

  it('ne déclenche pas sous le seuil', () => {
    const { prise: p, produit } = prise(DOLIPRANE_1000, '2026-08-12T08:00:00+02:00');
    expect(
      evaluer({ prises: [p], produits: [produit] }, [chargee()], '2026-08-12T09:00:00+02:00'),
    ).toEqual([]);
  });

  it('cible par classe de substance', () => {
    const { prise: p, produit } = prise(DOLIPRANE_1000, '2026-08-12T08:00:00+02:00');
    const avecClasse: PriseAvecSubstances = {
      ...p,
      substances: p.substances.map((s) => ({ ...s, classe: 'ANTALGIQUE_SIMPLE' as const })),
    };
    const signaux = evaluer(
      { prises: [avecClasse], produits: [produit] },
      [chargee({ cible: { classes: ['ANTALGIQUE_SIMPLE'] }, seuil: 500 })],
      '2026-08-12T09:00:00+02:00',
    );
    expect(signaux).toHaveLength(1);
    expect(signaux[0]!.libelleCible).toBe('');
  });

  it('cible par classe de produit — une association n’existe qu’à ce niveau', () => {
    const { prise: p, produit } = prise(CODOLIPRANE, '2026-08-12T08:00:00+02:00');
    expect(produit.classe).toBe('ANTALGIQUE_ASSOCIATION');
    const signaux = evaluer(
      { prises: [p], produits: [produit] },
      [
        chargee({
          id: 'ASSOC',
          type: 'jours_de_prise',
          fenetre: 'P30D',
          cible: { classes: ['ANTALGIQUE_ASSOCIATION'] },
          seuil: 1,
          unite: 'jours',
        }),
      ],
      '2026-08-12T09:00:00+02:00',
    );
    expect(signaux.map((s) => s.regleId)).toEqual(['ASSOC']);
  });

  it('déclenche une règle de dose unitaire', () => {
    const { prise: p, produit } = prise(DOLIPRANE_1000, '2026-08-12T08:00:00+02:00', { dose: 2 });
    const signaux = evaluer(
      { prises: [p], produits: [produit] },
      [chargee({ id: 'DOSE', type: 'dose_unitaire', seuil: 1000, fenetre: undefined })],
      '2026-08-12T09:00:00+02:00',
    );
    expect(signaux[0]!.valeur).toBe(2000);
  });

  it('ignore une prise annulée dans une dose unitaire', () => {
    const { prise: p, produit } = prise(DOLIPRANE_1000, '2026-08-12T08:00:00+02:00', {
      dose: 3,
      statut: 'annulee',
    });
    expect(
      evaluer(
        { prises: [p], produits: [produit] },
        [chargee({ type: 'dose_unitaire', seuil: 1000, fenetre: undefined })],
        '2026-08-12T09:00:00+02:00',
      ),
    ).toEqual([]);
  });

  it('déclenche une règle d’intervalle minimal — le seul signal qui se lit sous le repère', () => {
    const produit = prise(DOLIPRANE_1000, '2026-08-12T08:00:00+02:00').produit;
    const prises = [
      prise(DOLIPRANE_1000, '2026-08-12T08:00:00+02:00').prise,
      prise(DOLIPRANE_1000, '2026-08-12T10:00:00+02:00').prise,
    ];
    const regle = chargee({ id: 'INTER', type: 'intervalle_min', seuil: 4, unite: 'h', fenetre: undefined });
    expect(evaluer({ prises, produits: [produit] }, [regle], '2026-08-12T11:00:00+02:00')[0]!.valeur).toBe(2);

    const espacees = [
      prise(DOLIPRANE_1000, '2026-08-12T08:00:00+02:00').prise,
      prise(DOLIPRANE_1000, '2026-08-12T14:00:00+02:00').prise,
    ];
    expect(evaluer({ prises: espacees, produits: [produit] }, [regle], '2026-08-12T15:00:00+02:00')).toEqual([]);
  });

  it('n’évalue pas un intervalle sur une prise isolée', () => {
    const { prise: p, produit } = prise(DOLIPRANE_1000, '2026-08-12T08:00:00+02:00');
    expect(
      evaluer(
        { prises: [p], produits: [produit] },
        [chargee({ type: 'intervalle_min', seuil: 4, unite: 'h', fenetre: undefined })],
        '2026-08-12T09:00:00+02:00',
      ),
    ).toEqual([]);
  });

  it('compte une série de jours consécutifs, y compris terminée hier', () => {
    const produit = prise(ATURGYL, '2026-08-10T08:00:00+02:00').produit;
    const prises = ['2026-08-08', '2026-08-09', '2026-08-10', '2026-08-11', '2026-08-12'].map(
      (jour) => prise(ATURGYL, `${jour}T08:00:00+02:00`).prise,
    );
    const regle = chargee({
      id: 'DUREE',
      type: 'duree_consecutive',
      cible: { classes: ['DECONGESTIONNANT_NASAL'] },
      seuil: 5,
      unite: 'jours',
      fenetre: undefined,
    });
    expect(evaluer({ prises, produits: [produit] }, [regle], '2026-08-12T20:00:00+02:00')[0]!.valeur).toBe(5);
    // Série close hier : elle compte encore aujourd'hui.
    expect(evaluer({ prises, produits: [produit] }, [regle], '2026-08-13T09:00:00+02:00')[0]!.valeur).toBe(5);
    // Deux jours plus tard, la série est rompue.
    expect(evaluer({ prises, produits: [produit] }, [regle], '2026-08-14T09:00:00+02:00')).toEqual([]);
  });

  it('ne compte aucune série quand la dernière prise est trop ancienne', () => {
    const { prise: p, produit } = prise(ATURGYL, '2026-01-01T08:00:00+02:00');
    expect(
      evaluer(
        { prises: [p], produits: [produit] },
        [
          chargee({
            type: 'duree_consecutive',
            cible: { classes: ['DECONGESTIONNANT_NASAL'] },
            seuil: 1,
            unite: 'jours',
            fenetre: undefined,
          }),
        ],
        '2026-08-12T09:00:00+02:00',
      ),
    ).toEqual([]);
  });

  it('ne compte aucune série quand toutes les prises sont annulées', () => {
    const { prise: p, produit } = prise(ATURGYL, '2026-08-12T08:00:00+02:00', { statut: 'annulee' });
    expect(
      evaluer(
        { prises: [p], produits: [produit] },
        [
          chargee({
            type: 'duree_consecutive',
            cible: { classes: ['DECONGESTIONNANT_NASAL'] },
            seuil: 1,
            unite: 'jours',
            fenetre: undefined,
          }),
        ],
        '2026-08-12T09:00:00+02:00',
      ),
    ).toEqual([]);
  });

  it('ne compte que la substance ciblée dans une association', () => {
    // Codoliprane : paracétamol + codéine. Une règle sur le paracétamol ne
    // doit jamais additionner la codéine.
    const { prise: p, produit } = prise(CODOLIPRANE, '2026-08-12T08:00:00+02:00');
    expect(p.substances.length).toBeGreaterThan(1);
    const signaux = evaluer(
      { prises: [p], produits: [produit] },
      [chargee({ cible: { substances: ['02202'] }, seuil: 500 })],
      '2026-08-12T09:00:00+02:00',
    );
    expect(signaux[0]!.valeur).toBe(500);
  });

  it('n’acquitte un signal qu’au franchissement d’une nouvelle valeur (§8.5)', () => {
    const signal = {
      regleId: 'PARA-24H',
      type: 'cumul_fenetre' as const,
      niveau: 'vigilance' as const,
      valeur: 3000,
      seuil: 3000,
      unite: 'mg',
      libelleCible: 'paracétamol',
      message: 'MSG',
      citation: 'Repère.',
      source: SOURCE,
      declencheLe: '2026-08-12T22:00:00+02:00',
    };
    expect(filtrerAcquittes([signal], [{ regleId: 'PARA-24H', valeur: 3000 }])).toEqual([]);
    expect(filtrerAcquittes([signal], [{ regleId: 'PARA-24H', valeur: 2000 }])).toHaveLength(1);
    expect(filtrerAcquittes([signal], [{ regleId: 'AUTRE', valeur: 9000 }])).toHaveLength(1);
  });

  it('applique les acquittements passés dans le contexte', () => {
    const prises = [
      prise(DOLIPRANE_1000, '2026-08-12T08:00:00+02:00').prise,
      prise(DOLIPRANE_1000, '2026-08-12T14:00:00+02:00').prise,
      prise(DOLIPRANE_1000, '2026-08-12T20:00:00+02:00').prise,
    ];
    const produit = prise(DOLIPRANE_1000, '2026-08-12T08:00:00+02:00').produit;
    const regle = chargee({ id: 'PARA-24H' });
    expect(
      evaluer(
        { prises, produits: [produit], acquittements: [{ regleId: 'PARA-24H', valeur: 3000 }] },
        [regle],
        '2026-08-12T21:00:00+02:00',
      ),
    ).toEqual([]);
  });

  it('applique une fenêtre par défaut quand la règle n’en porte pas', () => {
    // Le validateur l'impose pour cumul_fenetre ; l'évaluation reste défensive.
    const prises = [
      prise(DOLIPRANE_1000, '2026-08-12T08:00:00+02:00').prise,
      prise(DOLIPRANE_1000, '2026-08-12T14:00:00+02:00').prise,
      prise(DOLIPRANE_1000, '2026-08-12T20:00:00+02:00').prise,
    ];
    const produit = prise(DOLIPRANE_1000, '2026-08-12T08:00:00+02:00').produit;
    const sansFenetre = { ...chargee(), fenetre: undefined } as unknown as Regle;
    const joursSansFenetre = {
      ...chargee({ type: 'jours_de_prise', fenetre: 'P30D', seuil: 1, unite: 'jours' }),
      fenetre: undefined,
    } as unknown as Regle;
    expect(evaluer({ prises, produits: [produit] }, [sansFenetre], '2026-08-12T21:00:00+02:00')).toHaveLength(1);
    expect(
      evaluer({ prises, produits: [produit] }, [joursSansFenetre], '2026-08-12T21:00:00+02:00'),
    ).toHaveLength(1);
  });
});

describe('occurrences — branches complémentaires', () => {
  const plan = (partiel: Partial<Plan> = {}): Plan => ({
    id: 'plan-1',
    produitId: 'prod-1',
    profilId: 'p1',
    mode: 'heures',
    rrule: 'FREQ=DAILY',
    moments: null,
    heures: ['21:00'],
    intervalleH: null,
    dose: 1,
    debut: '2026-08-01T00:00:00+02:00',
    fin: null,
    rappel: true,
    ...partiel,
  });

  const options = (partiel: Partial<{ debut: Instant; fin: Instant }> = {}) => ({
    fuseau: PARIS,
    debut: '2026-08-01T00:00:00+02:00',
    fin: '2026-08-11T00:00:00+02:00',
    moments: new Map(),
    ...partiel,
  });

  it('analyse les composantes d’une RRULE', () => {
    const recurrence = analyserRrule('FREQ=WEEKLY;INTERVAL=2;BYDAY=mo,we;COUNT=4;UNTIL=20261231T000000Z');
    expect(recurrence).toMatchObject({
      freq: 'WEEKLY',
      interval: 2,
      byday: ['MO', 'WE'],
      count: 4,
      until: '2026-12-31',
    });
    expect(analyserRrule('').freq).toBe('DAILY');
    expect(analyserRrule('FREQ=DAILY;X-CYCLE=cassé').cycle).toBeNull();
    expect(analyserRrule('FREQ=DAILY;INTERVAL=0').interval).toBe(1);
  });

  it('respecte INTERVAL en quotidien', () => {
    const occurrences = genererOccurrences(plan({ rrule: 'FREQ=DAILY;INTERVAL=3' }), options());
    expect(occurrences.map((o) => o.prevueLe.slice(0, 10))).toEqual([
      '2026-08-01',
      '2026-08-04',
      '2026-08-07',
      '2026-08-10',
    ]);
  });

  it('respecte INTERVAL en hebdomadaire', () => {
    const occurrences = genererOccurrences(
      plan({ rrule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=SA' }),
      options({ fin: '2026-09-01T00:00:00+02:00' }),
    );
    expect(occurrences.map((o) => o.prevueLe.slice(0, 10))).toEqual(['2026-08-01', '2026-08-15', '2026-08-29']);
  });

  it('respecte BYDAY sur une récurrence quotidienne', () => {
    const occurrences = genererOccurrences(plan({ rrule: 'FREQ=DAILY;BYDAY=SU' }), options());
    expect(occurrences.map((o) => o.prevueLe.slice(0, 10))).toEqual(['2026-08-02', '2026-08-09']);
  });

  it('respecte COUNT', () => {
    expect(genererOccurrences(plan({ rrule: 'FREQ=DAILY;COUNT=3' }), options())).toHaveLength(3);
  });

  it('respecte UNTIL', () => {
    const occurrences = genererOccurrences(
      plan({ rrule: 'FREQ=DAILY;UNTIL=20260803T000000Z' }),
      options(),
    );
    expect(occurrences).toHaveLength(3);
  });

  it('respecte la fin du plan', () => {
    const occurrences = genererOccurrences(plan({ fin: '2026-08-04T23:59:00+02:00' }), options());
    expect(occurrences).toHaveLength(4);
  });

  it('ne génère rien avant le début du plan', () => {
    const occurrences = genererOccurrences(
      plan({ debut: '2026-08-05T00:00:00+02:00' }),
      options(),
    );
    expect(occurrences[0]!.prevueLe.slice(0, 10)).toBe('2026-08-05');
  });

  it('ne génère rien sans heure exploitable', () => {
    expect(genererOccurrences(plan({ heures: null }), options())).toEqual([]);
    expect(genererOccurrences(plan({ mode: 'moments', moments: null }), options())).toEqual([]);
    expect(
      genererOccurrences(plan({ mode: 'moments', moments: ['inconnu'] }), options()),
    ).toEqual([]);
    expect(genererOccurrences(plan({ mode: 'intervalle', intervalleH: null }), options())).toEqual([]);
  });

  it('borne un plan par intervalle à sa propre fin', () => {
    const occurrences = genererOccurrences(
      plan({
        mode: 'intervalle',
        heures: null,
        intervalleH: 12,
        debut: '2026-08-01T06:00:00+02:00',
        fin: '2026-08-02T06:00:00+02:00',
      }),
      options({ fin: '2026-08-05T00:00:00+02:00' }),
    );
    expect(occurrences.map((o) => o.prevueLe)).toEqual([
      '2026-08-01T06:00:00+02:00',
      '2026-08-01T18:00:00+02:00',
    ]);
  });

  it('commence un plan par intervalle à la borne demandée, pas avant', () => {
    const occurrences = genererOccurrences(
      plan({ mode: 'intervalle', heures: null, intervalleH: 6, debut: '2026-08-01T00:00:00+02:00' }),
      options({ debut: '2026-08-02T00:00:00+02:00', fin: '2026-08-02T12:00:00+02:00' }),
    );
    expect(occurrences.map((o) => o.prevueLe)).toEqual([
      '2026-08-02T00:00:00+02:00',
      '2026-08-02T06:00:00+02:00',
    ]);
  });

  it('n’émet pas une occurrence au-delà de la borne de fin', () => {
    const occurrences = genererOccurrences(plan(), options({ fin: '2026-08-01T20:00:00+02:00' }));
    expect(occurrences).toEqual([]);
  });

  it('exclut une occurrence tombant après la borne de fin, à l’instant près', () => {
    const occurrences = genererOccurrences(
      plan({ heures: ['08:00', '21:00'] }),
      options({ fin: '2026-08-02T12:00:00+02:00' }),
    );
    expect(occurrences.map((o) => o.prevueLe)).toEqual([
      '2026-08-01T08:00:00+02:00',
      '2026-08-01T21:00:00+02:00',
      '2026-08-02T08:00:00+02:00',
    ]);
  });

  it('déduplique deux heures identiques dans un même plan', () => {
    const occurrences = genererOccurrences(
      plan({ heures: ['21:00', '21:00'] }),
      options({ fin: '2026-08-02T00:00:00+02:00' }),
    );
    expect(occurrences).toHaveLength(1);
  });

  it('conserve une occurrence future déjà validée lors d’une régénération', () => {
    const existantes = genererOccurrences(plan(), options()).map((o, index) =>
      index === 5 ? { ...o, statut: 'sautee' as const } : o,
    );
    const fusionnees = regenerer(existantes, plan(), {
      ...options(),
      maintenant: '2026-08-03T12:00:00+02:00',
    });
    expect(fusionnees.find((o) => o.prevueLe.startsWith('2026-08-06'))!.statut).toBe('sautee');
  });

  it('laisse une occurrence déjà validée hors du champ de l’expiration', () => {
    const occurrences = genererOccurrences(plan(), options()).map((o) => ({
      ...o,
      statut: 'validee' as const,
    }));
    expect(expirer(occurrences, '2026-08-20T09:00:00+02:00').every((o) => o.statut === 'validee')).toBe(
      true,
    );
  });
});
