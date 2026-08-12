/**
 * Miroir typé des jetons de `tokens.css`, pour ce que le CSS ne sait pas faire :
 * choisir une teinte ATC à l'exécution, dériver une variation intra-groupe,
 * dessiner un SVG.
 *
 * ⚠ Toute valeur ici doit exister à l'identique dans `tokens.css`. Les
 * composants consomment `var(--jeton)` ; ce fichier ne sert qu'au calcul.
 */

import type { GroupeAtc } from '../domain/types.js';

/** Groupe ATC → teinte (§12.2). La correspondance est fixe, jamais esthétique. */
export const COULEUR_ATC: Readonly<Record<GroupeAtc, string>> = {
  N: '#C4551F',
  M: '#2F7A4B',
  A: '#2A6AAC',
  R: '#6552AE',
  J: '#1F8880',
  C: '#AC5478',
  D: '#93763A',
  G: '#84518C',
  B: '#9A553A',
  S: '#4F8770',
  H: '#6B6258',
  L: '#6B6258',
  P: '#6B6258',
  V: '#6B6258',
  _: '#8A8178',
};

export const LIBELLE_GROUPE_ATC: Readonly<Record<GroupeAtc, string>> = {
  N: 'système nerveux',
  M: 'muscle et squelette',
  A: 'voies digestives et métabolisme',
  R: 'système respiratoire',
  J: 'anti-infectieux',
  C: 'système cardiovasculaire',
  D: 'dermatologie',
  G: 'génito-urinaire et hormones sexuelles',
  B: 'sang',
  S: 'organes sensoriels',
  H: 'hormones systémiques',
  L: 'antinéoplasiques et immunomodulateurs',
  P: 'antiparasitaires',
  V: 'divers',
  _: 'sans classification ATC',
};

/** Intensité d'une alvéole = nombre de prises, jamais la teinte. */
export const INTENSITE = [0.4, 0.7, 1] as const;

export const COULEUR_SIGNAL = {
  information: '#56737F',
  vigilance: '#C07A12',
  attention: '#8C5F86',
} as const;

/**
 * Variation intra-groupe par hachage stable du code substance (§12.2) :
 * ±14 % de luminosité, teinte inchangée. Deux antalgiques sont distincts mais
 * visiblement apparentés.
 *
 * ⚠ La dérivation doit rester **stable entre versions** : ne jamais modifier
 * la fonction de hachage sans changer aussi la maquette.
 */
export function couleurSubstance(groupe: GroupeAtc, codeSubstance: string): string {
  const base = COULEUR_ATC[groupe] ?? COULEUR_ATC._;
  const [teinte, saturation, luminosite] = versHsl(base);
  const variation = ((hachage(codeSubstance) % 29) / 28 - 0.5) * 0.28; // ±14 %
  return versCss(teinte, saturation, borner(luminosite * (1 + variation)));
}

/** Teinte d'alvéole pour un nombre de prises (0 → creux). */
export function opaciteAlveole(nbPrises: number): number {
  if (nbPrises <= 0) return 0;
  return INTENSITE[Math.min(nbPrises, INTENSITE.length) - 1] ?? 1;
}

function hachage(valeur: string): number {
  // FNV-1a 32 bits : déterministe, stable entre plateformes et versions.
  let resultat = 0x811c9dc5;
  for (let index = 0; index < valeur.length; index += 1) {
    resultat ^= valeur.charCodeAt(index);
    resultat = Math.imul(resultat, 0x01000193) >>> 0;
  }
  return resultat;
}

function borner(valeur: number): number {
  return Math.min(0.92, Math.max(0.12, valeur));
}

function versHsl(hexadecimal: string): [number, number, number] {
  const entier = Number.parseInt(hexadecimal.slice(1), 16);
  const rouge = ((entier >> 16) & 255) / 255;
  const vert = ((entier >> 8) & 255) / 255;
  const bleu = (entier & 255) / 255;

  const maximum = Math.max(rouge, vert, bleu);
  const minimum = Math.min(rouge, vert, bleu);
  const luminosite = (maximum + minimum) / 2;
  const delta = maximum - minimum;

  if (delta === 0) return [0, 0, luminosite];

  const saturation = delta / (1 - Math.abs(2 * luminosite - 1));
  let teinte: number;
  if (maximum === rouge) teinte = ((vert - bleu) / delta) % 6;
  else if (maximum === vert) teinte = (bleu - rouge) / delta + 2;
  else teinte = (rouge - vert) / delta + 4;

  return [((teinte * 60) + 360) % 360, saturation, luminosite];
}

function versCss(teinte: number, saturation: number, luminosite: number): string {
  return `hsl(${teinte.toFixed(1)} ${(saturation * 100).toFixed(1)}% ${(luminosite * 100).toFixed(1)}%)`;
}

/** Familles de police, pour les rares cas où le CSS ne suffit pas (canvas, PDF). */
export const FAMILLES = {
  ui: "'Poppins', system-ui, sans-serif",
  source: "'Newsreader', serif",
  mono: "'DM Mono', ui-monospace, monospace",
} as const;
