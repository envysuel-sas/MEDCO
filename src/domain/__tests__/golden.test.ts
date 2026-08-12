/**
 * Jeu doré — spec §16.1. Non négociable.
 *
 * Deux principes :
 *  · les compositions viennent du **vrai** bundle catalogue, jamais d'une
 *    fixture écrite à la main ;
 *  · l'instant est toujours injecté, jamais lu à l'horloge.
 *
 * Cas fondateur, à ne jamais casser :
 *   2 × Doliprane 1000 + 2 sachets Fervex (500 mg) = 3 000 mg de paracétamol.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  classeSpecialite,
  compositionDe,
  metaCatalogue,
  nomSpecialite,
  substance,
} from './catalogue-reel.js';
import { cumulParSubstance, jourLocal, substancesPourPrise } from '../cumul.js';
import { evaluer, validerBundle } from '../regles.js';
import { expirer, genererOccurrences, regenerer } from '../occurrences.js';
import type {
  Classe,
  CodeSubstance,
  Instant,
  Mode,
  Plan,
  PriseAvecSubstances,
  Produit,
} from '../types.js';

const JEU_DORE = JSON.parse(
  readFileSync(new URL('../../../data/jeu-dore.json', import.meta.url), 'utf8'),
) as JeuDore;

const REGLES_BRUTES = JSON.parse(
  readFileSync(new URL('../../../data/regles.json', import.meta.url), 'utf8'),
) as unknown;

interface JeuDore {
  cas_catalogue: {
    libelle: string;
    cis: string;
    nom_specialite: string;
    element?: string;
    code_substance: string;
    dose_par_unite_mg: number;
    unite: string;
    fiabilite_min: number;
  }[];
  cas_non_comptes: { libelle: string; cis: string; nom_specialite: string }[];
  scenarios_cumul: {
    id: string;
    libelle: string;
    prises: { cis: string; element?: string; dose: number; horodatage: Instant }[];
    fenetre: { debut: Instant; fin: Instant };
    attendu_mg: Record<CodeSubstance, number>;
    regle_attendue?: string;
  }[];
}

const PARIS = 'Europe/Paris';

/** Construit une prise réelle : composition lue dans le catalogue publié. */
function priseDepuisCatalogue(
  cis: string,
  dose: number,
  horodatage: Instant,
  options: { id?: string; mode?: Mode; statut?: 'prise' | 'annulee'; element?: string } = {},
): { prise: PriseAvecSubstances; produit: Produit } {
  const lignes = compositionDe(cis);
  const classes = new Map<CodeSubstance, Classe>(
    lignes.map((l) => [l.codeSubstance, substance(l.codeSubstance)?.classe ?? 'AUTRE']),
  );
  const { substances } = substancesPourPrise(lignes, dose, classes, options.element ?? null);
  const id = options.id ?? `${cis}@${horodatage}`;
  return {
    prise: {
      id,
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
      nomAffiche: nomSpecialite(cis) ?? cis,
      mode: options.mode ?? 'libre',
      element: options.element ?? null,
      unite: lignes.find((l) => l.comptee)?.unite ?? null,
      classe: classeSpecialite(cis),
    },
  };
}

// ---------------------------------------------------------------------------

describe('catalogue réel', () => {
  it('est le bundle publié, avec sa date de source', () => {
    const meta = metaCatalogue();
    expect(meta.get('date_bdpm')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number(meta.get('nb_specialites'))).toBeGreaterThan(12_000);
  });

  it.each(JEU_DORE.cas_catalogue)('$libelle', (cas) => {
    expect(nomSpecialite(cas.cis)).toBe(cas.nom_specialite);
    const ligne = compositionDe(cas.cis).find(
      (l) =>
        l.comptee &&
        l.codeSubstance === cas.code_substance &&
        (cas.element === undefined || l.element === cas.element),
    );
    expect(ligne, `aucune ligne comptée pour ${cas.code_substance}`).toBeDefined();
    expect(ligne!.doseParUnite).toBeCloseTo(cas.dose_par_unite_mg, 6);
    expect(ligne!.fiabilite).toBeGreaterThanOrEqual(cas.fiabilite_min);
    expect(ligne!.unite).toBe(cas.unite);
  });

  it('ne compte jamais une SA et sa FT sur la même liaison (R1)', () => {
    for (const cas of JEU_DORE.cas_catalogue) {
      const parLiaison = new Map<string, Set<string>>();
      for (const ligne of compositionDe(cas.cis)) {
        if (!ligne.comptee) continue;
        const cle = `${ligne.element}#${ligne.numLiaison}`;
        const natures = parLiaison.get(cle) ?? new Set<string>();
        natures.add(ligne.nature);
        parLiaison.set(cle, natures);
      }
      for (const [cle, natures] of parLiaison) {
        expect(natures.size, `${cas.cis} ${cle} compte ${[...natures].join('+')}`).toBe(1);
      }
    }
  });
});

describe('cumul par substance', () => {
  it.each(JEU_DORE.scenarios_cumul)('$libelle', (scenario) => {
    const prises = scenario.prises.map(
      (p) =>
        priseDepuisCatalogue(p.cis, p.dose, p.horodatage, p.element ? { element: p.element } : {})
          .prise,
    );
    const cumul = cumulParSubstance(prises, scenario.fenetre);
    for (const [code, mg] of Object.entries(scenario.attendu_mg)) {
      expect(cumul.get(code)?.mg, `substance ${code}`).toBeCloseTo(mg, 6);
    }
  });

  it('cas fondateur : 2 × Doliprane 1000 + 2 Fervex = 3 000 mg', () => {
    const prises = [
      priseDepuisCatalogue('60234100', 1, '2026-08-12T08:00:00+02:00').prise,
      priseDepuisCatalogue('60234100', 1, '2026-08-12T14:00:00+02:00').prise,
      priseDepuisCatalogue('69329731', 1, '2026-08-12T18:00:00+02:00').prise,
      priseDepuisCatalogue('69329731', 1, '2026-08-12T22:00:00+02:00').prise,
    ];
    const cumul = cumulParSubstance(prises, {
      debut: '2026-08-12T00:00:00+02:00',
      fin: '2026-08-13T00:00:00+02:00',
    });
    expect(cumul.get('02202')?.mg).toBe(3000);
    expect(cumul.get('02202')?.nbPrises).toBe(4);
  });

  it('une prise annulée est exclue de tous les calculs', () => {
    const prises = [
      priseDepuisCatalogue('60234100', 1, '2026-08-12T08:00:00+02:00').prise,
      priseDepuisCatalogue('60234100', 1, '2026-08-12T14:00:00+02:00', { statut: 'annulee' }).prise,
    ];
    const cumul = cumulParSubstance(prises, {
      debut: '2026-08-12T00:00:00+02:00',
      fin: '2026-08-13T00:00:00+02:00',
    });
    expect(cumul.get('02202')?.mg).toBe(1000);
  });

  it('un dosage de fiabilité 0 est enregistré mais exclu du cumul, et signalé', () => {
    const cas = JEU_DORE.cas_non_comptes[0]!;
    const lignes = compositionDe(cas.cis);
    expect(lignes.length).toBeGreaterThan(0);
    expect(lignes.every((l) => !l.comptee)).toBe(true);

    const { substances, exclues } = substancesPourPrise(lignes, 1, new Map(), null);
    expect(substances).toHaveLength(0);
    expect(exclues.length).toBe(lignes.length);

    const { prise } = priseDepuisCatalogue(cas.cis, 1, '2026-08-12T08:00:00+02:00');
    expect(prise.id).toBeTruthy(); // la prise existe
    const cumul = cumulParSubstance([prise], {
      debut: '2026-08-12T00:00:00+02:00',
      fin: '2026-08-13T00:00:00+02:00',
    });
    expect(cumul.size).toBe(0); // et n'entre dans aucun cumul
  });

  it('une boîte à plusieurs éléments ne compte rien tant que l’élément n’est pas choisi', () => {
    // HUMEX RHUME : comprimé *et* gélule, 500 mg de paracétamol chacun.
    // Les sommer compterait deux comprimés là où l'utilisateur en prend un.
    const lignes = compositionDe('63713344');
    const sansChoix = substancesPourPrise(lignes, 1, new Map(), null);
    expect(sansChoix.substances).toHaveLength(0);
    expect(sansChoix.elementsAChoisir).toEqual(['comprimé', 'gélule']);

    const avecChoix = substancesPourPrise(lignes, 1, new Map(), 'comprimé');
    expect(avecChoix.elementsAChoisir).toEqual([]);
    expect(avecChoix.substances.find((s) => s.code === '02202')?.quantiteMg).toBe(500);
  });

  it('une plaquette multiphasique garde ses deux dosages distincts', () => {
    // Perdre un comprimé d'une plaquette de pilule n'est pas envisageable.
    const lignes = compositionDe('60206332');
    const elements = [...new Set(lignes.map((l) => l.element))];
    expect(elements.length).toBeGreaterThan(1);
    for (const element of elements) {
      expect(lignes.filter((l) => l.element === element && l.comptee).length).toBeGreaterThan(0);
    }
  });

  it('une valeur dérivée baisse la fiabilité du cumul sans le fausser', () => {
    // Nurofenfem : masse portée par la fraction thérapeutique → fiabilité 1.
    const { prise } = priseDepuisCatalogue('68354856', 1, '2026-08-12T08:00:00+02:00');
    const cumul = cumulParSubstance([prise], {
      debut: '2026-08-12T00:00:00+02:00',
      fin: '2026-08-13T00:00:00+02:00',
    });
    expect(cumul.get('02092')?.mg).toBe(400);
    expect(cumul.get('02092')?.fiabiliteMin).toBe(1);
  });

  it('prise à 23 h et prise à 1 h sont dans la même fenêtre PT24H', () => {
    const prises = [
      priseDepuisCatalogue('60234100', 1, '2026-08-12T23:00:00+02:00').prise,
      priseDepuisCatalogue('60234100', 1, '2026-08-13T01:00:00+02:00').prise,
    ];
    // Fenêtre glissante de 24 h finissant à 02:00 : les deux prises y sont.
    expect(
      cumulParSubstance(prises, {
        debut: '2026-08-12T02:00:00+02:00',
        fin: '2026-08-13T02:00:00+02:00',
      }).get('02202')?.mg,
    ).toBe(2000);
    // Elles tombent en revanche sur deux jours calendaires distincts.
    expect(jourLocal(prises[0]!.horodatage)).toBe('2026-08-12');
    expect(jourLocal(prises[1]!.horodatage)).toBe('2026-08-13');
  });

  it('un changement de fuseau ne déplace pas les jours calendaires', () => {
    // Même instant absolu, saisi à Paris puis à Fort-de-France (UTC−4).
    const paris = priseDepuisCatalogue('60234100', 1, '2026-08-13T01:00:00+02:00').prise;
    const antilles: PriseAvecSubstances = {
      ...priseDepuisCatalogue('60234100', 1, '2026-08-12T19:00:00-04:00').prise,
      fuseau: 'America/Martinique',
    };
    expect(jourLocal(paris.horodatage)).toBe('2026-08-13');
    expect(jourLocal(antilles.horodatage)).toBe('2026-08-12');
    // Normaliser en UTC aurait fusionné les deux jours : c'est l'erreur à ne pas commettre.
    expect(new Date(paris.horodatage).getTime()).toBe(new Date(antilles.horodatage).getTime());
  });
});

describe('invariants du moteur de règles', () => {
  const bundle = validerBundle(REGLES_BRUTES);

  it('le jeu de règles livré est valide', () => {
    expect(bundle.erreurs).toEqual([]);
    expect(bundle.regles.length).toBeGreaterThan(0);
  });

  it('toute règle porte une source datée et cliquable (R3)', () => {
    for (const regle of bundle.regles) {
      expect(regle.source.url, regle.id).toMatch(/^https:\/\//);
      expect(regle.source.consulte_le, regle.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(regle.source.libelle.length, regle.id).toBeGreaterThan(0);
    }
  });

  it('une règle jours_de_prise incluant « prescrit » fait rejeter le bundle (R2)', () => {
    const rejete = validerBundle({
      version: '2026.01.01',
      regles: [
        {
          id: 'TEST-PRESCRIT',
          type: 'jours_de_prise',
          cible: { classes: ['ANTALGIQUE_SIMPLE'] },
          mode: ['prescrit', 'libre'],
          fenetre: 'P30D',
          seuil: 15,
          unite: 'jours',
          niveau: 'information',
          message: 'MSG',
          source: { libelle: 'x', url: 'https://exemple.fr', consulte_le: '2026-01-01' },
        },
      ],
    });
    expect(rejete.regles).toHaveLength(0);
    expect(rejete.erreurs.map((e) => e.code)).toContain('mode_prescrit_interdit');
  });

  it('une règle duree_consecutive incluant « prescrit » fait rejeter le bundle (R2)', () => {
    const rejete = validerBundle({
      version: '2026.01.01',
      regles: [
        {
          id: 'TEST-DUREE',
          type: 'duree_consecutive',
          cible: { substances: ['02092'] },
          mode: ['prescrit'],
          seuil: 5,
          unite: 'jours',
          niveau: 'information',
          message: 'MSG',
          source: { libelle: 'x', url: 'https://exemple.fr', consulte_le: '2026-01-01' },
        },
      ],
    });
    expect(rejete.erreurs.map((e) => e.code)).toContain('mode_prescrit_interdit');
  });

  it('une règle sans source.url fait rejeter le bundle', () => {
    const rejete = validerBundle({
      version: '2026.01.01',
      regles: [
        {
          id: 'TEST-SANS-SOURCE',
          type: 'cumul_fenetre',
          cible: { substances: ['02202'] },
          mode: ['libre'],
          fenetre: 'PT24H',
          seuil: 3000,
          unite: 'mg',
          niveau: 'vigilance',
          message: 'MSG',
          source: { libelle: 'ANSM', consulte_le: '2026-01-01' },
        },
      ],
    });
    expect(rejete.erreurs.map((e) => e.code)).toContain('source_incomplete');
  });

  it('une règle sans source.consulte_le fait rejeter le bundle', () => {
    const rejete = validerBundle({
      version: '2026.01.01',
      regles: [
        {
          id: 'TEST-SANS-DATE',
          type: 'cumul_fenetre',
          cible: { substances: ['02202'] },
          mode: ['libre'],
          fenetre: 'PT24H',
          seuil: 3000,
          unite: 'mg',
          niveau: 'vigilance',
          message: 'MSG',
          source: { libelle: 'ANSM', url: 'https://ansm.sante.fr' },
        },
      ],
    });
    expect(rejete.erreurs.map((e) => e.code)).toContain('source_incomplete');
  });

  it('3 × Doliprane 1000 sur 24 h déclenchent PARA-24H', () => {
    const éléments = [
      priseDepuisCatalogue('60234100', 1, '2026-08-12T08:00:00+02:00'),
      priseDepuisCatalogue('60234100', 1, '2026-08-12T14:00:00+02:00'),
      priseDepuisCatalogue('60234100', 1, '2026-08-12T20:00:00+02:00'),
    ];
    const signaux = evaluer(
      { prises: éléments.map((e) => e.prise), produits: [éléments[0]!.produit] },
      bundle.regles,
      '2026-08-12T22:00:00+02:00',
    );
    const para = signaux.find((s) => s.regleId === 'PARA-24H');
    expect(para).toBeDefined();
    expect(para!.valeur).toBe(3000);
    expect(para!.seuil).toBe(3000);
  });

  it('un produit prescrit ne produit aucun signal de fréquence, même à 20 jours sur 30 (R2)', () => {
    const prises: PriseAvecSubstances[] = [];
    for (let jour = 1; jour <= 20; jour += 1) {
      const date = `2026-08-${String(jour).padStart(2, '0')}`;
      prises.push(
        priseDepuisCatalogue('60234100', 1, `${date}T09:00:00+02:00`, {
          id: `prescrit-${jour}`,
          mode: 'prescrit',
        }).prise,
      );
    }
    const produit = priseDepuisCatalogue('60234100', 1, '2026-08-01T09:00:00+02:00', {
      mode: 'prescrit',
    }).produit;

    const signaux = evaluer({ prises, produits: [produit] }, bundle.regles, '2026-08-25T12:00:00+02:00');
    const frequence = signaux.filter(
      (s) => s.type === 'jours_de_prise' || s.type === 'duree_consecutive',
    );
    expect(frequence).toEqual([]);
  });

  it('un produit libre à 16 jours sur 30 déclenche ANTALG-30J', () => {
    const prises: PriseAvecSubstances[] = [];
    for (let jour = 1; jour <= 16; jour += 1) {
      const date = `2026-08-${String(jour).padStart(2, '0')}`;
      prises.push(
        priseDepuisCatalogue('60234100', 1, `${date}T09:00:00+02:00`, { id: `libre-${jour}` })
          .prise,
      );
    }
    const produit = priseDepuisCatalogue('60234100', 1, '2026-08-01T09:00:00+02:00').produit;

    const signaux = evaluer({ prises, produits: [produit] }, bundle.regles, '2026-08-25T12:00:00+02:00');
    const antalgique = signaux.find((s) => s.regleId === 'ANTALG-30J');
    expect(antalgique).toBeDefined();
    expect(antalgique!.valeur).toBe(16);
    expect(antalgique!.seuil).toBe(15);
  });

  it('aucun signal ne contient de score, de pourcentage ni de conclusion (R3)', () => {
    const éléments = [
      priseDepuisCatalogue('60234100', 1, '2026-08-12T08:00:00+02:00'),
      priseDepuisCatalogue('60234100', 1, '2026-08-12T14:00:00+02:00'),
      priseDepuisCatalogue('60234100', 1, '2026-08-12T20:00:00+02:00'),
    ];
    const signaux = evaluer(
      { prises: éléments.map((e) => e.prise), produits: [éléments[0]!.produit] },
      bundle.regles,
      '2026-08-12T22:00:00+02:00',
    );
    expect(signaux.length).toBeGreaterThan(0);
    for (const signal of signaux) {
      const texte = `${signal.citation} ${signal.source.libelle}`.toLowerCase();
      for (const interdit of ['vous devriez', 'trop', 'excessif', 'anormal', 'votre risque', 'bravo']) {
        expect(texte, `${signal.regleId} contient « ${interdit} »`).not.toContain(interdit);
      }
      expect(signal).not.toHaveProperty('score');
      expect(signal).not.toHaveProperty('pourcentage');
    }
  });
});

describe('occurrences', () => {
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

  it('un plan quotidien à une heure produit 60 occurrences sur 60 jours', () => {
    const occurrences = genererOccurrences(plan(), {
      fuseau: PARIS,
      debut: '2026-08-01T00:00:00+02:00',
      fin: '2026-09-30T00:00:00+02:00',
      moments: new Map(),
    });
    expect(occurrences).toHaveLength(60);
    expect(occurrences[0]!.prevueLe).toBe('2026-08-01T21:00:00+02:00');
    expect(new Set(occurrences.map((o) => o.id)).size).toBe(60);
  });

  it('une RRULE cyclique 21/7 interrompt correctement', () => {
    const occurrences = genererOccurrences(
      plan({ rrule: 'FREQ=DAILY;X-CYCLE=21/7', heures: ['21:00'] }),
      {
        fuseau: PARIS,
        debut: '2026-08-01T00:00:00+02:00',
        fin: '2026-09-26T00:00:00+02:00', // 56 jours = deux cycles complets
        moments: new Map(),
      },
    );
    expect(occurrences).toHaveLength(42);
    const jours = occurrences.map((o) => jourLocal(o.prevueLe));
    expect(jours).toContain('2026-08-21'); // 21e jour du cycle
    expect(jours).not.toContain('2026-08-22'); // premier jour d'arrêt
    expect(jours).not.toContain('2026-08-28'); // dernier jour d'arrêt
    expect(jours).toContain('2026-08-29'); // reprise
  });

  it('le passage à l’heure d’hiver ne duplique ni ne perd de prise', () => {
    // Europe/Paris : dimanche 25 octobre 2026, 03:00 → 02:00.
    const occurrences = genererOccurrences(plan({ debut: '2026-10-20T00:00:00+02:00' }), {
      fuseau: PARIS,
      debut: '2026-10-20T00:00:00+02:00',
      fin: '2026-10-31T00:00:00+01:00',
      moments: new Map(),
    });
    const jours = occurrences.map((o) => jourLocal(o.prevueLe));
    expect(new Set(jours).size).toBe(jours.length); // aucun doublon
    expect(jours).toContain('2026-10-25'); // aucune perte
    expect(occurrences).toHaveLength(11);
    // L'heure locale reste 21:00, l'offset change.
    expect(occurrences.find((o) => o.prevueLe.startsWith('2026-10-24'))!.prevueLe).toBe(
      '2026-10-24T21:00:00+02:00',
    );
    expect(occurrences.find((o) => o.prevueLe.startsWith('2026-10-26'))!.prevueLe).toBe(
      '2026-10-26T21:00:00+01:00',
    );
  });

  it('le passage à l’heure d’été ne duplique ni ne perd de prise', () => {
    // Europe/Paris : dimanche 29 mars 2026, 02:00 → 03:00.
    const occurrences = genererOccurrences(
      plan({ debut: '2026-03-25T00:00:00+01:00', heures: ['02:30'] }),
      {
        fuseau: PARIS,
        debut: '2026-03-25T00:00:00+01:00',
        fin: '2026-04-02T00:00:00+02:00',
        moments: new Map(),
      },
    );
    const jours = occurrences.map((o) => jourLocal(o.prevueLe));
    expect(new Set(jours).size).toBe(jours.length);
    expect(jours).toContain('2026-03-29'); // heure locale inexistante : décalée, jamais perdue
    expect(occurrences).toHaveLength(8);
  });

  it('la modification d’un plan laisse le passé intact et régénère le futur', () => {
    const existantes = genererOccurrences(plan(), {
      fuseau: PARIS,
      debut: '2026-08-01T00:00:00+02:00',
      fin: '2026-08-10T00:00:00+02:00',
      moments: new Map(),
    }).map((o, index) => (index < 3 ? { ...o, statut: 'validee' as const } : o));

    const fusionnees = regenerer(existantes, plan({ heures: ['08:00'] }), {
      fuseau: PARIS,
      debut: '2026-08-01T00:00:00+02:00',
      fin: '2026-08-10T00:00:00+02:00',
      moments: new Map(),
      maintenant: '2026-08-04T12:00:00+02:00',
    });

    const passees = fusionnees.filter((o) => o.prevueLe < '2026-08-04T12:00:00+02:00');
    expect(passees.filter((o) => o.statut === 'validee')).toHaveLength(3);
    expect(passees.every((o) => o.prevueLe.includes('T21:00'))).toBe(true);

    const futures = fusionnees.filter((o) => o.prevueLe > '2026-08-04T12:00:00+02:00');
    expect(futures.length).toBeGreaterThan(0);
    expect(futures.every((o) => o.prevueLe.includes('T08:00'))).toBe(true);
  });

  it('une occurrence non traitée à J+1 devient expirée, sans compteur ni notification', () => {
    const occurrences = genererOccurrences(plan(), {
      fuseau: PARIS,
      debut: '2026-08-01T00:00:00+02:00',
      fin: '2026-08-05T00:00:00+02:00',
      moments: new Map(),
    });
    const apres = expirer(occurrences, '2026-08-04T09:00:00+02:00');

    const expirees = apres.filter((o) => o.statut === 'expiree');
    expect(expirees.map((o) => jourLocal(o.prevueLe))).toEqual(['2026-08-01', '2026-08-02']);
    // Le 03/08 à 21:00 n'a pas encore un jour : elle reste attendue.
    expect(apres.find((o) => o.prevueLe.startsWith('2026-08-03'))!.statut).toBe('attendue');
    for (const occurrence of apres) {
      expect(occurrence).not.toHaveProperty('badge');
      expect(occurrence).not.toHaveProperty('compteurRetard');
    }
  });

  it('un plan par moments suit les heures du profil', () => {
    const moments = new Map([
      ['m-matin', { id: 'm-matin', code: 'matin', libelle: 'Matin', heure: '08:00', ordre: 1 }],
      ['m-soir', { id: 'm-soir', code: 'soir', libelle: 'Soir', heure: '20:00', ordre: 3 }],
    ]);
    const occurrences = genererOccurrences(
      plan({ mode: 'moments', heures: null, moments: ['m-matin', 'm-soir'] }),
      {
        fuseau: PARIS,
        debut: '2026-08-01T00:00:00+02:00',
        fin: '2026-08-04T00:00:00+02:00',
        moments,
      },
    );
    expect(occurrences).toHaveLength(6);
    expect(occurrences.map((o) => o.prevueLe.slice(11, 16))).toEqual([
      '08:00',
      '20:00',
      '08:00',
      '20:00',
      '08:00',
      '20:00',
    ]);
    expect(occurrences[0]!.momentId).toBe('m-matin');
  });

  it('un plan par intervalle enchaîne depuis la première prise', () => {
    const occurrences = genererOccurrences(
      plan({ mode: 'intervalle', heures: null, intervalleH: 8, debut: '2026-08-01T06:00:00+02:00' }),
      {
        fuseau: PARIS,
        debut: '2026-08-01T06:00:00+02:00',
        fin: '2026-08-03T06:00:00+02:00',
        moments: new Map(),
      },
    );
    expect(occurrences).toHaveLength(6);
    expect(occurrences.map((o) => o.prevueLe.slice(11, 16))).toEqual([
      '06:00',
      '14:00',
      '22:00',
      '06:00',
      '14:00',
      '22:00',
    ]);
  });

  it('une RRULE hebdomadaire ne retient que les jours demandés', () => {
    const occurrences = genererOccurrences(plan({ rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR' }), {
      fuseau: PARIS,
      debut: '2026-08-01T00:00:00+02:00', // samedi
      fin: '2026-08-15T00:00:00+02:00',
      moments: new Map(),
    });
    expect(occurrences.map((o) => jourLocal(o.prevueLe))).toEqual([
      '2026-08-03',
      '2026-08-05',
      '2026-08-07',
      '2026-08-10',
      '2026-08-12',
      '2026-08-14',
    ]);
  });
});
