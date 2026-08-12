/**
 * Vocabulaire de l'interface — spec §12.3 et R3.
 *
 * Ce test est un garde-fou : il échoue si un mot proscrit entre dans un
 * énoncé de signal. Le premier bloc d'une carte de signal doit rester un
 * constat, sans lien avec le repère qui le suit.
 */

import { describe, expect, it } from 'vitest';

import { ecartLisible, faitDuSignal } from '../textes.js';
import type { Signal, TypeRegle } from '../../domain/regles.js';

const INTERDITS = [
  'vous devriez',
  'trop',
  'excessif',
  'anormal',
  'votre risque',
  'bravo',
  'continuez comme ça',
  'limite',
  'maximum',
  'objectif',
  'score',
  'observance',
  '%',
];

const SOURCE = {
  libelle: 'ANSM — Dossier thématique',
  url: 'https://ansm.sante.fr/exemple',
  consulte_le: '2026-08-12',
};

function signal(type: TypeRegle, valeur: number, unite: string): Signal {
  return {
    regleId: `TEST-${type}`,
    type,
    niveau: 'vigilance',
    valeur,
    seuil: valeur,
    unite,
    libelleCible: 'paracétamol',
    message: 'MSG',
    citation: 'Texte cité de la source.',
    source: SOURCE,
    declencheLe: '2026-08-12T20:00:00+02:00',
  };
}

const CAS: [TypeRegle, number, string][] = [
  ['cumul_fenetre', 3000, 'mg'],
  ['dose_unitaire', 1000, 'mg'],
  ['intervalle_min', 2, 'h'],
  ['duree_consecutive', 5, 'jours'],
  ['jours_de_prise', 18, 'jours'],
];

describe('énoncé d’un signal', () => {
  it.each(CAS)('%s énonce un fait chiffré', (type, valeur, unite) => {
    const texte = faitDuSignal(signal(type, valeur, unite));
    expect(texte).toContain('paracétamol');
    expect(texte.endsWith('.')).toBe(true);
    expect(texte.length).toBeGreaterThan(10);
  });

  it.each(CAS)('%s ne contient aucun mot proscrit (§12.3)', (type, valeur, unite) => {
    const texte = faitDuSignal(signal(type, valeur, unite)).toLowerCase();
    for (const interdit of INTERDITS) {
      expect(texte, `« ${interdit} » dans « ${texte} »`).not.toContain(interdit);
    }
  });

  it('ne relie jamais le fait au repère (R3)', () => {
    for (const [type, valeur, unite] of CAS) {
      const texte = faitDuSignal(signal(type, valeur, unite)).toLowerCase();
      for (const liaison of ['repère', 'seuil', 'au-delà', 'dépass', 'alors que', 'donc']) {
        expect(texte, `« ${liaison} » dans « ${texte} »`).not.toContain(liaison);
      }
    }
  });

  it('formate les nombres à la française', () => {
    expect(faitDuSignal(signal('cumul_fenetre', 3000, 'mg'))).toMatch(/3\s000 mg/);
  });

  it('exprime un écart de moins d’une heure en minutes', () => {
    expect(ecartLisible(0.001, 'h')).toBe("moins d'une minute");
    expect(ecartLisible(0.5, 'h')).toBe('30 minutes');
    expect(ecartLisible(2, 'h')).toBe('2 h');
    expect(ecartLisible(15, 'jours')).toBe('15 jours');
    expect(faitDuSignal(signal('intervalle_min', 0.001, 'h'))).toContain("moins d'une minute");
  });

  it('ne laisse pas la cible vide produire une phrase bancale', () => {
    const sansCible = { ...signal('cumul_fenetre', 3000, 'mg'), libelleCible: '' };
    expect(faitDuSignal(sansCible)).toContain('cette substance');
  });
});
