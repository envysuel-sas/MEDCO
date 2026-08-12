#!/usr/bin/env node
/**
 * Génère les icônes de la PWA depuis la marque réelle.
 *
 *   node scripts/extraire-marque.mjs   # d'abord : détoure le logo livré
 *   node scripts/generer-icones.mjs    # puis : produit les icônes
 *
 * ⚠ Sans ces fichiers, Chrome **ne propose pas** l'installation sur Android :
 * il exige au minimum une icône 192 et une 512. Sur iOS, l'écran d'accueil
 * afficherait une capture de la page à la place de l'icône.
 *
 * La source est `src/ui/marque/monogramme.png`, extrait du logo livré dans la
 * maquette — jamais un dessin de substitution.
 *
 * L'icône « maskable » n'est pas la même image en plus grand : Android y
 * découpe une forme (cercle, goutte, carré arrondi selon le constructeur) et
 * ne garantit que les 80 % centraux. Le monogramme y est donc réduit, sur un
 * fond plein — sinon ses extrémités se font rogner.
 */

import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = resolve(RACINE, 'src/ui/marque/monogramme.png');
const SORTIE = resolve(RACINE, 'public');

/**
 * Fond des icônes : le fond d'écran de la maquette, déjà retenu pour
 * `theme_color` et `background_color` (manques.md §2.3). Le monogramme est
 * polychrome et n'est lisible que sur un fond clair — le poser sur la couleur
 * d'action l'écraserait.
 */
const FOND = { r: 0xf1, g: 0xf6, b: 0xf9, alpha: 1 };

/** Part de la surface occupée par la marque, hors « maskable ». */
const PART = 0.82;
/** Part réduite dans la zone sûre d'Android, pour l'icône « maskable ». */
const PART_SURE = 0.6;

async function icone(taille, fichier, part, fond) {
  const marque = Math.round(taille * part);
  const marge = Math.round((taille - marque) / 2);
  const dessin = await sharp(SOURCE)
    .resize(marque, marque, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  await sharp({ create: { width: taille, height: taille, channels: 4, background: fond } })
    .composite([{ input: dessin, top: marge, left: marge }])
    .png({ compressionLevel: 9 })
    .toFile(resolve(SORTIE, fichier));
  return fichier;
}

mkdirSync(SORTIE, { recursive: true });

const transparent = { r: 0, g: 0, b: 0, alpha: 0 };

const produits = [
  await icone(192, 'icon-192.png', PART, FOND),
  await icone(512, 'icon-512.png', PART, FOND),
  // iOS ne lit pas le manifeste pour l'icône d'accueil : il lui faut ce
  // fichier, et il n'accepte pas la transparence — d'où le fond plein.
  await icone(180, 'apple-touch-icon.png', PART, FOND),
  await icone(512, 'icon-maskable-512.png', PART_SURE, FOND),
  // L'onglet est petit : le monogramme y occupe toute la place, sans fond.
  await icone(32, 'favicon.png', 1, transparent),
];

for (const fichier of produits) console.log('✓', fichier);
