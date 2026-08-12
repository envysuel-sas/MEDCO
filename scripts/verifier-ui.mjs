/**
 * Parcours réel dans Chromium, aux quatre largeurs, avec le vrai bundle.
 * Détecte tout débordement horizontal et capture chaque écran.
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';

const PORT = 4185;
const BASE = `http://localhost:${PORT}/MEDCO/`;
const SORTIE = 'captures';
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.wasm': 'application/wasm',
  '.gz': 'application/gzip', '.br': 'application/octet-stream', '.txt': 'text/plain',
};

const serveur = createServer((req, res) => {
  const chemin = decodeURI(req.url.split('?')[0]).replace(/^\/MEDCO/, '') || '/';
  let f = join('dist', normalize(chemin).replace(/^(\.\.[/\\])+/, ''));
  if (!existsSync(f) || !statSync(f).isFile()) f = join('dist', 'index.html');
  res.writeHead(200, { 'Content-Type': TYPES[extname(f)] ?? 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise((r) => serveur.listen(PORT, r));
mkdirSync(SORTIE, { recursive: true });

const LARGEURS = [
  { nom: '320', width: 320, height: 700 },
  { nom: '390', width: 390, height: 844 },
  { nom: '768', width: 768, height: 1024 },
  { nom: '1280', width: 1280, height: 900 },
];

const navigateur = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const probleme = [];

for (const taille of LARGEURS) {
  const contexte = await navigateur.newContext({
    viewport: { width: taille.width, height: taille.height },
    deviceScaleFactor: 2,
  });
  const page = await contexte.newPage();
  // L'app refuse tout écran tant qu'elle n'est pas installée (§11.1).
  // `Emulation.setEmulatedMedia` n'agit pas sur `display-mode` ici : on
  // enveloppe `matchMedia` côté navigateur. C'est l'API qu'on simule, pas le
  // code de l'application.
  await contexte.addInitScript(() => {
    const origine = window.matchMedia.bind(window);
    window.matchMedia = (requete) =>
      /display-mode:\s*standalone/.test(requete)
        ? { matches: true, media: requete, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }
        : origine(requete);
  });

  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e).slice(0, 160)));

  async function capturer(nom) {
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${SORTIE}/${nom}-${taille.nom}.png`, fullPage: true });
    const debord = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    if (debord > 1) probleme.push(`${nom} @${taille.nom}px : débordement horizontal de ${debord}px`);
    return debord;
  }

  /**
   * Le verrou est une session : il se referme à chaque rechargement de page.
   * C'est voulu (§15). Toute navigation par `goto` doit donc le repasser.
   */
  async function deverrouiller(capture) {
    await page.waitForSelector('main', { timeout: 30000 });
    const chiffre = (c) => page.getByRole('button', { name: c, exact: true });
    if (!(await chiffre('5').count())) return;
    const pose = await page.getByText('Choisissez un code').count();
    if (capture) await capturer(capture);
    for (const c of ['4', '9', '1', '3']) await chiffre(c).click();
    if (pose) {
      await page.getByRole('button', { name: 'Suivant' }).click();
      for (const c of ['4', '9', '1', '3']) await chiffre(c).click();
    }
    await page.waitForTimeout(2500);
  }

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await deverrouiller('01-verrou');

  // 2. Bienvenue — catalogue puis profil.
  await capturer('02-bienvenue');
  const champNom = page.locator('input[type="text"], input:not([type])').first();
  if (await champNom.count()) {
    await champNom.fill('Test');
    for (let i = 0; i < 60; i += 1) {
      const bouton = page.getByRole('button', { name: /créer|commencer|valider/i }).first();
      if ((await bouton.count()) && (await bouton.isEnabled())) {
        await bouton.click();
        break;
      }
      await page.waitForTimeout(1000);
    }
  }
  await page.waitForTimeout(3000);

  // 3. Écrans de l'application — navigation **interne**, sans rechargement.
  await capturer('03-aujourdhui');
  for (const [nom, onglet] of [
    ['04-pilulier', 'Pilulier'],
    ['05-produits', 'Produits'],
    ['06-reperes', 'Repères'],
  ]) {
    const lien = page.getByRole('link', { name: onglet }).first();
    if (await lien.count()) {
      await lien.click();
      await capturer(nom);
    } else {
      probleme.push(`onglet « ${onglet} » introuvable @${taille.nom}px`);
    }
  }

  // Réglages par l'en-tête : c'est le chemin que l'utilisateur a réellement.
  const roue = page.getByRole('button', { name: 'Réglages' }).first();
  if (await roue.count()) {
    await roue.click();
    await capturer('07-reglages');
    const mentions = page.getByRole('link', { name: /mentions légales/i }).first();
    if (await mentions.count()) {
      await mentions.click();
      await capturer('08-mentions');
      // L'écran de détail doit offrir un retour : c'est ce qui manquait.
      const retour = page.getByRole('button', { name: 'Retour' }).first();
      if (!(await retour.count())) probleme.push(`pas de retour sur les mentions @${taille.nom}px`);
      else await retour.click();
    } else {
      probleme.push(`lien mentions légales introuvable @${taille.nom}px`);
    }
  } else {
    probleme.push(`bouton Réglages introuvable @${taille.nom}px`);
  }

  // 4. Saisie — la feuille.
  const accueil = page.getByRole('link', { name: "Aujourd'hui" }).first();
  if (await accueil.count()) await accueil.click();
  await page.waitForTimeout(500);
  const saisie = page.getByRole('button', { name: /enregistrer une prise/i }).first();
  if (await saisie.count()) {
    await saisie.click();
    await capturer('09-saisie');
  } else {
    probleme.push(`bouton de saisie introuvable @${taille.nom}px`);
  }

  await page.goto(`${BASE}kitchen-sink`, { waitUntil: 'domcontentloaded' });
  await capturer('10-kitchen-sink');

  if (erreurs.length) probleme.push(`@${taille.nom}px erreurs JS : ${[...new Set(erreurs)].join(' | ')}`);
  await contexte.close();
}

await navigateur.close();
await new Promise((r) => serveur.close(r));

console.log(probleme.length === 0 ? '✓ aucun débordement, aucune erreur JS' : '✗ problèmes :');
probleme.forEach((p) => console.log('  -', p));
