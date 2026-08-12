#!/usr/bin/env node
// Inventaire des valeurs présentes dans la maquette HTML exportée.
//
//   node scripts/extraire-maquette.mjs docs/maquette/export > docs/maquette/inventaire.json
//
// Ne produit AUCUN jeton : il liste ce qui existe, trié par fréquence.
// Le regroupement des quasi-doublons et le nommage par rôle restent manuels.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const racine = process.argv[2];
if (!racine) {
  console.error('usage: extraire-maquette.mjs <dossier>');
  process.exit(1);
}

function fichiers(dir) {
  return readdirSync(dir).flatMap((nom) => {
    const chemin = join(dir, nom);
    if (statSync(chemin).isDirectory()) return fichiers(chemin);
    return ['.html', '.htm', '.css', '.svg'].includes(extname(chemin)) ? [chemin] : [];
  });
}

const source = fichiers(racine).map((f) => readFileSync(f, 'utf8')).join('\n');
if (!source) {
  console.error(`aucun fichier .html/.css/.svg trouvé dans ${racine}`);
  process.exit(1);
}

const MOTIFS = {
  couleurs: /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]+\)|hsla?\([^)]+\)/g,
  taillesPolice: /font-size\s*:\s*([^;"'}]+)/g,
  graisses: /font-weight\s*:\s*([^;"'}]+)/g,
  interlignes: /line-height\s*:\s*([^;"'}]+)/g,
  interlettrages: /letter-spacing\s*:\s*([^;"'}]+)/g,
  familles: /font-family\s*:\s*([^;"'}]+)/g,
  rayons: /border-radius\s*:\s*([^;"'}]+)/g,
  espacements: /(?:padding|margin|gap)(?:-[a-z]+)?\s*:\s*([^;"'}]+)/g,
  durees: /(?:transition|animation)(?:-duration)?\s*:\s*([^;"'}]+)/g,
  ombres: /box-shadow\s*:\s*([^;"'}]+)/g,
};

const normaliserCouleur = (v) => {
  const m = v.match(/^#([0-9a-fA-F]{3})$/);
  if (m) return ('#' + m[1].split('').map((c) => c + c).join('')).toLowerCase();
  return v.toLowerCase();
};

const resultat = {};
for (const [cle, motif] of Object.entries(MOTIFS)) {
  const comptes = new Map();
  for (const m of source.matchAll(motif)) {
    let valeur = (m[1] ?? m[0]).trim().replace(/\s+/g, ' ');
    if (cle === 'couleurs') valeur = normaliserCouleur(valeur);
    comptes.set(valeur, (comptes.get(valeur) ?? 0) + 1);
  }
  resultat[cle] = [...comptes.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([valeur, occurrences]) => ({ valeur, occurrences }));
}

// Signale les valeurs vues une seule fois : jeton légitime ou scorie ?
resultat._aVerifier = Object.fromEntries(
  Object.entries(resultat)
    .filter(([cle]) => !cle.startsWith('_'))
    .map(([cle, liste]) => [cle, liste.filter((e) => e.occurrences === 1).map((e) => e.valeur)])
    .filter(([, liste]) => liste.length > 0)
);

resultat._meta = {
  source: racine,
  fichiers: fichiers(racine).length,
  genere_le: new Date().toISOString(),
  note: "Inventaire brut. Regrouper les quasi-doublons, nommer par rôle, consigner les regroupements dans manques.md.",
};

console.log(JSON.stringify(resultat, null, 2));
