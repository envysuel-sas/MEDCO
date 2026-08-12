/**
 * Verrou par code (§15).
 *
 * Le stockage est remplacé par une Map : c'est la couche `reglage` de SQLite
 * qu'on neutralise, pas une donnée médicale. Aucune composition, aucun dosage,
 * aucune prise n'est fabriquée ici.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const stockage = new Map<string, string>();

vi.mock('../depots.js', () => ({
  reglage: (cle: string) => stockage.get(cle) ?? null,
  definirReglage: (cle: string, valeur: string) => {
    stockage.set(cle, valeur);
  },
}));

const {
  LONGUEUR_MAX,
  LONGUEUR_MIN,
  verrouConfigure,
  verrouDefinir,
  verrouEstOuvert,
  verrouEtat,
  verrouFermer,
  verrouOuvrir,
} = await import('../verrou.js');

describe('verrou par code', () => {
  beforeEach(() => {
    stockage.clear();
    verrouFermer();
  });

  it('part fermé et non configuré', () => {
    expect(verrouConfigure()).toBe(false);
    expect(verrouEstOuvert()).toBe(false);
  });

  it('ouvre la session dès la pose du code', async () => {
    await verrouDefinir('4913');
    expect(verrouConfigure()).toBe(true);
    expect(verrouEstOuvert()).toBe(true);
  });

  it('rouvre avec le bon code après fermeture', async () => {
    await verrouDefinir('4913');
    verrouFermer();
    expect(verrouEstOuvert()).toBe(false);

    expect(await verrouOuvrir('4913')).toBe(true);
    expect(verrouEstOuvert()).toBe(true);
  });

  it('refuse un code faux sans ouvrir la session', async () => {
    await verrouDefinir('4913');
    verrouFermer();

    expect(await verrouOuvrir('4914')).toBe(false);
    expect(verrouEstOuvert()).toBe(false);
  });

  it('ne stocke jamais le code, ni en clair ni en évidence', async () => {
    await verrouDefinir('4913');
    const empreinte = [...stockage.values()].join('|');
    expect(empreinte).not.toContain('4913');
    // Le sel doit être présent : sans lui, deux appareils au même code
    // produiraient la même preuve.
    expect(stockage.get('verrou.sel')).toBeTruthy();
  });

  it('produit deux preuves différentes pour le même code sur deux appareils', async () => {
    await verrouDefinir('4913');
    const premier = stockage.get('verrou.preuve');

    stockage.clear();
    verrouFermer();
    await verrouDefinir('4913');

    expect(stockage.get('verrou.preuve')).not.toBe(premier);
  });

  it('refuse un code hors format, sans rien poser', async () => {
    for (const invalide of ['123', '1'.repeat(LONGUEUR_MAX + 1), 'abcd', '12a4', '']) {
      await expect(verrouDefinir(invalide)).rejects.toThrow(/chiffres/);
    }
    expect(verrouConfigure()).toBe(false);
  });

  it('accepte les longueurs extrêmes admises', async () => {
    await verrouDefinir('1'.repeat(LONGUEUR_MIN));
    expect(verrouConfigure()).toBe(true);

    stockage.clear();
    verrouFermer();
    await verrouDefinir('1'.repeat(LONGUEUR_MAX));
    expect(verrouConfigure()).toBe(true);
  });

  it('ne remplace jamais un code déjà posé', async () => {
    await verrouDefinir('4913');
    await expect(verrouDefinir('0000')).rejects.toThrow(/déjà défini/);
    // L'ancien code reste le bon.
    verrouFermer();
    expect(await verrouOuvrir('4913')).toBe(true);
  });

  it('impose une attente croissante après cinq essais ratés', async () => {
    await verrouDefinir('4913');
    verrouFermer();

    expect(verrouEtat().attenteMs).toBe(0);
    for (let essai = 0; essai < 5; essai += 1) {
      stockage.set('verrou.essais', String(essai));
      expect(verrouEtat().attenteMs).toBe(0);
    }
    stockage.set('verrou.essais', '5');
    expect(verrouEtat().attenteMs).toBe(1000);
    stockage.set('verrou.essais', '7');
    expect(verrouEtat().attenteMs).toBe(4000);
    // Plafonnée : gêner un attaquant sans condamner l'utilisateur légitime.
    stockage.set('verrou.essais', '99');
    expect(verrouEtat().attenteMs).toBe(30_000);
  });

  it('remet le compteur à zéro après une ouverture réussie', async () => {
    await verrouDefinir('4913');
    verrouFermer();

    await verrouOuvrir('0000');
    expect(Number(stockage.get('verrou.essais'))).toBe(1);

    await verrouOuvrir('4913');
    expect(Number(stockage.get('verrou.essais'))).toBe(0);
  });

  it('refuse d’ouvrir quand aucun code n’est posé', async () => {
    expect(await verrouOuvrir('4913')).toBe(false);
    expect(verrouEstOuvert()).toBe(false);
  });
});
