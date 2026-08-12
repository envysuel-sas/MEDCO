#!/usr/bin/env node
/**
 * Extrait la marque depuis le logo livré dans `docs/maquette/export/`.
 *
 *   node scripts/extraire-marque.mjs
 *
 * Produit, dans `src/ui/marque/` :
 *   · `logo.png`        — verrouillage complet (pictogramme + mot « Medco »)
 *   · `monogramme.png`  — pictogramme seul, cadré carré, pour les icônes
 *
 * ## Pourquoi un remplissage par diffusion et non un seuil global
 *
 * Le fond est blanc, mais l'intérieur de la croix l'est aussi. Un seuil
 * « tout ce qui est clair devient transparent » perforerait le pictogramme.
 * La diffusion part des bords : seul ce qui communique avec l'extérieur est
 * effacé. L'intérieur reste plein.
 *
 * ⚠ Rien n'est redessiné ici. Le logo est la source, ce script ne fait que
 * détourer et recadrer.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = resolve(RACINE, 'docs/maquette/export/Gemini_Generated_Image_s9dc0is9dc0is9dc.png');
const SORTIE = resolve(RACINE, 'src/ui/marque');

/** Distance au blanc en deçà de laquelle un pixel de bord est du fond. */
const TOLERANCE = 26;

const image = sharp(SOURCE).ensureAlpha();
const { width, height } = await image.metadata();
const donnees = new Uint8ClampedArray(await image.raw().toBuffer());

const estClair = (index) => {
  const [r, v, b] = [donnees[index], donnees[index + 1], donnees[index + 2]];
  return 255 - Math.min(r, v, b) <= TOLERANCE;
};

// --- Diffusion depuis les bords ---------------------------------------------
const fond = new Uint8Array(width * height);
const pile = [];
for (let x = 0; x < width; x += 1) {
  pile.push([x, 0], [x, height - 1]);
}
for (let y = 0; y < height; y += 1) {
  pile.push([0, y], [width - 1, y]);
}

while (pile.length > 0) {
  const [x, y] = pile.pop();
  if (x < 0 || y < 0 || x >= width || y >= height) continue;
  const pixel = y * width + x;
  if (fond[pixel]) continue;
  if (!estClair(pixel * 4)) continue;
  fond[pixel] = 1;
  pile.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
}

for (let pixel = 0; pixel < width * height; pixel += 1) {
  if (fond[pixel]) donnees[pixel * 4 + 3] = 0;
}

// --- Boîtes englobantes ------------------------------------------------------
const opaque = (x, y) => donnees[(y * width + x) * 4 + 3] > 24;

function boite(xDebut, xFin) {
  let x0 = xFin;
  let x1 = xDebut;
  let y0 = height;
  let y1 = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = xDebut; x < xFin; x += 1) {
      if (!opaque(x, y)) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return { left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

/**
 * Composantes connexes de l'encre.
 *
 * Une gouttière verticale ne sépare pas ce logo : les feuilles du pictogramme
 * passent **au-dessus** du « M », si bien que les deux se chevauchent en x
 * (552–581) sans se toucher en y. Découper à la colonne emporterait une
 * tranche de lettre dans le monogramme.
 */
function composantes() {
  const vu = new Uint8Array(width * height);
  const trouvees = [];
  for (let depart = 0; depart < width * height; depart += 1) {
    if (vu[depart] || donnees[depart * 4 + 3] <= 24) continue;
    const pixels = [];
    let x0 = width;
    let x1 = -1;
    let y0 = height;
    let y1 = -1;
    const aVoir = [depart];
    vu[depart] = 1;
    while (aVoir.length > 0) {
      const pixel = aVoir.pop();
      const x = pixel % width;
      const y = (pixel - x) / width;
      pixels.push(pixel);
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      for (const voisin of [x + 1 < width ? pixel + 1 : -1, x > 0 ? pixel - 1 : -1, pixel + width, pixel - width]) {
        if (voisin < 0 || voisin >= width * height || vu[voisin] || donnees[voisin * 4 + 3] <= 24) continue;
        vu[voisin] = 1;
        aVoir.push(voisin);
      }
    }
    // Les composantes minuscules sont du bruit de compression, pas du dessin.
    if (pixels.length > 400) trouvees.push({ x0, x1, y0, y1, pixels });
  }
  return trouvees;
}

const toutes = composantes();

/**
 * Le mot-symbole : cinq lettres posées sur une même ligne de base, toutes à
 * droite du pictogramme et sous les feuilles. Le seuil sépare sans ambiguïté —
 * la composante de pictogramme la plus à droite commence à x=497, y=222.
 */
const estLettre = (c) => c.x0 >= 520 && c.y0 >= 290;
const lettres = toutes.filter(estLettre);
const pictogramme = toutes.filter((c) => !estLettre(c));

// Le script doit échouer bruyamment si le logo change, pas produire un
// monogramme amputé en silence.
if (lettres.length < 4 || pictogramme.length < 5) {
  throw new Error(
    `Structure inattendue : ${pictogramme.length} composantes de pictogramme, ` +
      `${lettres.length} de mot-symbole. Vérifier le fichier source.`,
  );
}

const complet = boite(0, width);

// Monogramme : l'encre du pictogramme seule, les lettres effacées.
const sansLettres = new Uint8ClampedArray(donnees);
for (const lettre of lettres) {
  for (const pixel of lettre.pixels) sansLettres[pixel * 4 + 3] = 0;
}
const picto = {
  left: Math.min(...pictogramme.map((c) => c.x0)),
  top: Math.min(...pictogramme.map((c) => c.y0)),
  width: Math.max(...pictogramme.map((c) => c.x1)) - Math.min(...pictogramme.map((c) => c.x0)) + 1,
  height: Math.max(...pictogramme.map((c) => c.y1)) - Math.min(...pictogramme.map((c) => c.y0)) + 1,
};

const brut = Buffer.from(donnees.buffer);
const brutSansLettres = Buffer.from(sansLettres.buffer);
const detoure = () => sharp(brut, { raw: { width, height, channels: 4 } });
const detoureSansLettres = () => sharp(brutSansLettres, { raw: { width, height, channels: 4 } });

mkdirSync(SORTIE, { recursive: true });

await detoure().extract(complet).png({ compressionLevel: 9 }).toFile(resolve(SORTIE, 'logo.png'));

// Le monogramme est cadré carré, centré, avec la marge que réclame une icône.
const cote = Math.max(picto.width, picto.height);
await detoureSansLettres()
  .extract(picto)
  .extend({
    top: Math.round((cote - picto.height) / 2),
    bottom: cote - picto.height - Math.round((cote - picto.height) / 2),
    left: Math.round((cote - picto.width) / 2),
    right: cote - picto.width - Math.round((cote - picto.width) / 2),
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
  .png({ compressionLevel: 9 })
  .toFile(resolve(SORTIE, 'monogramme.png'));

// --- Palette réelle, pour confronter les jetons -----------------------------
const comptes = new Map();
for (let pixel = 0; pixel < width * height; pixel += 1) {
  if (donnees[pixel * 4 + 3] < 200) continue;
  const cle = [0, 1, 2]
    .map((c) => Math.min(255, Math.round(donnees[pixel * 4 + c] / 16) * 16).toString(16).padStart(2, '0'))
    .join('');
  comptes.set(cle, (comptes.get(cle) ?? 0) + 1);
}
const palette = [...comptes.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10)
  .map(([teinte, n]) => `#${teinte} (${n})`);

writeFileSync(
  resolve(SORTIE, 'PROVENANCE.md'),
  `# Marque — provenance\n\n` +
    `Fichiers produits par \`node scripts/extraire-marque.mjs\` depuis\n` +
    `\`docs/maquette/export/Gemini_Generated_Image_s9dc0is9dc0is9dc.png\`.\n\n` +
    `**Rien n'est redessiné.** Le script détoure le fond par diffusion depuis les\n` +
    `bords, puis recadre. Toute correction de la marque passe par le fichier\n` +
    `source, jamais par les fichiers produits.\n\n` +
    `| Fichier | Rôle | Dimensions |\n|---|---|---|\n` +
    `| \`logo.png\` | verrouillage complet, mot-symbole compris | ${complet.width}×${complet.height} |\n` +
    `| \`monogramme.png\` | pictogramme seul, cadré carré, base des icônes | ${cote}×${cote} |\n\n` +
    `## Palette relevée dans le logo\n\n${palette.map((c) => `- \`${c}\``).join('\n')}\n\n` +
    `⚠ La maquette précise : « Ce que je n'ai pas repris du logo : la croix, la\n` +
    `gélule et les feuilles. Le logo reste en marque ; l'iconographie de l'app\n` +
    `reste géométrique. » Ces fichiers ne servent donc **qu'à la marque** —\n` +
    `icône PWA, onboarding, documents exportés — jamais aux icônes d'interface.\n`,
);

console.log(`logo complet : ${complet.width}×${complet.height} à (${complet.left}, ${complet.top})`);
console.log(`monogramme   : ${picto.width}×${picto.height} → carré ${cote}`);
console.log(`composantes  : ${pictogramme.length} pictogramme, ${lettres.length} mot-symbole`);
console.log(`palette      : ${palette.join(', ')}`);
