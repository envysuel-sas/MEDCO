#!/usr/bin/env node
/**
 * Génère les icônes de la PWA depuis `src/ui/marque/logo.svg`.
 *
 *   node scripts/generer-icones.mjs
 *
 * ⚠ Sans ces fichiers, Chrome **ne propose pas** l'installation sur Android :
 * il exige au minimum une icône 192 et une 512. Sur iOS, l'écran d'accueil
 * afficherait une capture de la page à la place de l'icône.
 *
 * L'icône « maskable » n'est pas la même image en plus grand : Android y
 * découpe une forme (cercle, goutte, carré arrondi selon le constructeur) et
 * ne garantit que les 80 % centraux. La marque y est donc réduite, sur un fond
 * plein — sinon les coins du carré arrondi se font rogner.
 */

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = resolve(RACINE, 'src/ui/marque/logo.svg');
const SORTIE = resolve(RACINE, 'public');

/** Fond de l'icône « maskable » : la couleur d'action de la maquette. */
const FOND = '#12566E';
/** Part de la surface occupée par la marque dans la zone sûre d'Android. */
const PART_SURE = 0.6;

const logo = readFileSync(SOURCE);

async function pleine(taille, fichier) {
  await sharp(logo, { density: 400 }).resize(taille, taille).png({ compressionLevel: 9 }).toFile(resolve(SORTIE, fichier));
  return fichier;
}

async function maskable(taille, fichier) {
  const marque = Math.round(taille * PART_SURE);
  const marge = Math.round((taille - marque) / 2);
  const dessin = await sharp(logo, { density: 400 }).resize(marque, marque).png().toBuffer();

  await sharp({
    create: { width: taille, height: taille, channels: 4, background: FOND },
  })
    .composite([{ input: dessin, top: marge, left: marge }])
    .png({ compressionLevel: 9 })
    .toFile(resolve(SORTIE, fichier));
  return fichier;
}

mkdirSync(SORTIE, { recursive: true });

const produits = [
  await pleine(192, 'icon-192.png'),
  await pleine(512, 'icon-512.png'),
  // iOS ne sait pas lire le manifeste pour l'icône d'accueil : il lui faut
  // ce fichier, et il n'applique aucun arrondi — l'image doit déjà l'avoir.
  await pleine(180, 'apple-touch-icon.png'),
  await maskable(512, 'icon-maskable-512.png'),
];

writeFileSync(resolve(SORTIE, 'favicon.svg'), logo);
produits.push('favicon.svg');

for (const fichier of produits) console.log('✓', fichier);
