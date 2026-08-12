/**
 * Décodage GS1 (spec §13).
 *
 * Les CIP13 employés ici viennent du catalogue BDPM réel : ils sont lus dans le
 * bundle publié, jamais fabriqués. Un CIP13 inventé passerait la clé de
 * contrôle sans correspondre à aucune boîte.
 */

import { describe, expect, it } from 'vitest';

import { cip13DepuisGtin, lireGs1, peremptionIso } from '../gs1.js';
import { ouvrirCatalogue } from '../../domain/__tests__/catalogue-reel.js';

const GS = '';

/** CIP13 réels du catalogue, avec leur spécialité. */
const presentations = ouvrirCatalogue()
  .prepare(
    `SELECT p.cip13, s.nom FROM presentation p JOIN specialite s ON s.cis = p.cis
     WHERE p.cis IN ('60234100', '63646874') ORDER BY p.cip13 LIMIT 3`,
  )
  .all() as { cip13: string; nom: string }[];

const CIP13 = presentations[0]!.cip13;
const GTIN = `0${CIP13}`;

describe('CIP13 depuis le GTIN', () => {
  it('extrait un CIP13 réel du catalogue', () => {
    expect(presentations.length).toBeGreaterThan(0);
    expect(CIP13).toMatch(/^3400\d{9}$/);
    expect(cip13DepuisGtin(GTIN)).toBe(CIP13);
  });

  it('rejette un GTIN de longueur incorrecte', () => {
    expect(cip13DepuisGtin(CIP13)).toBeNull();
    expect(cip13DepuisGtin(`00${CIP13}`)).toBeNull();
  });

  it('rejette un code hors préfixe français', () => {
    expect(cip13DepuisGtin('03270000000001')).toBeNull();
  });

  it('rejette une clé de contrôle fausse', () => {
    const faux = `${GTIN.slice(0, 13)}${(Number(GTIN.slice(13)) + 1) % 10}`;
    expect(cip13DepuisGtin(faux)).toBeNull();
  });
});

describe('péremption', () => {
  it('convertit AAMMJJ en date ISO', () => {
    expect(peremptionIso('280731')).toBe('2028-07-31');
  });

  it('interprète un jour à 00 comme la fin du mois', () => {
    expect(peremptionIso('280200')).toBe('2028-02-29'); // 2028 est bissextile
    expect(peremptionIso('270200')).toBe('2027-02-28');
  });

  it('rejette une date impossible', () => {
    expect(peremptionIso('281301')).toBeNull();
    expect(peremptionIso('280230')).toBeNull();
    expect(peremptionIso('abc')).toBeNull();
  });
});

describe('chaîne GS1 complète', () => {
  it('lit un code à AI de longueur fixe concaténés', () => {
    expect(lireGs1(`01${GTIN}17280731`)).toEqual({ cip13: CIP13, peremption: '2028-07-31' });
  });

  it('lit un lot de longueur variable terminé par le séparateur FNC1', () => {
    const brut = `01${GTIN}17280731${GS}10LOT42${GS}21SERIE-9876`;
    expect(lireGs1(brut)).toEqual({ cip13: CIP13, peremption: '2028-07-31' });
  });

  it('ne restitue ni le lot ni le numéro de série (§13)', () => {
    const resultat = lireGs1(`01${GTIN}10LOT42${GS}21SERIE-9876`);
    expect(Object.keys(resultat).sort()).toEqual(['cip13', 'peremption']);
    expect(JSON.stringify(resultat)).not.toContain('LOT42');
    expect(JSON.stringify(resultat)).not.toContain('SERIE');
  });

  it('accepte la notation parenthésée de certains lecteurs', () => {
    expect(lireGs1(`(01)${GTIN}(17)280731`)).toEqual({
      cip13: CIP13,
      peremption: '2028-07-31',
    });
  });

  it('accepte un lot en dernière position, sans séparateur final', () => {
    expect(lireGs1(`01${GTIN}10LOT-SANS-FIN`).cip13).toBe(CIP13);
  });

  it('s’arrête proprement sur une chaîne qui n’est pas du GS1', () => {
    expect(lireGs1('pas un code')).toEqual({ cip13: null, peremption: null });
    expect(lireGs1('')).toEqual({ cip13: null, peremption: null });
  });

  it('retrouve la spécialité du catalogue à partir du CIP13 lu', () => {
    const { cip13 } = lireGs1(`01${GTIN}`);
    const ligne = ouvrirCatalogue()
      .prepare('SELECT s.nom FROM presentation p JOIN specialite s ON s.cis = p.cis WHERE p.cip13 = ?')
      .get(cip13!) as { nom: string } | undefined;
    expect(ligne?.nom).toBe(presentations[0]!.nom);
  });
});
