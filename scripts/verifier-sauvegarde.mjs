/**
 * Aller-retour complet d'une sauvegarde, dans le navigateur.
 *
 * Le chemin réel, celui qu'emprunte l'utilisateur : enregistrer une prise,
 * produire l'archive chiffrée, **effacer l'appareil**, puis restaurer et
 * retrouver la prise. Un test unitaire prouve que les requêtes sont justes ;
 * seul ce parcours prouve que le fichier sort du téléphone et y revient.
 *
 * Usage : node scripts/verifier-sauvegarde.mjs
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';

const PORT = 4187;
const BASE = `http://localhost:${PORT}/MEDCO/`;
const FUSEAU = 'Europe/Paris';
const PHRASE = 'phrase de passe assez longue';
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
mkdirSync('captures', { recursive: true });

const navigateur = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const contexte = await navigateur.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  timezoneId: FUSEAU,
  locale: 'fr-FR',
  acceptDownloads: true,
});
await contexte.addInitScript(() => {
  const origine = window.matchMedia.bind(window);
  window.matchMedia = (requete) =>
    /display-mode:\s*standalone/.test(requete)
      ? { matches: true, media: requete, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }
      : origine(requete);

  // Un téléphone n'expose pas `showSaveFilePicker` : ni Chrome Android, ni
  // Safari iOS. Le retirer ici, c'est simuler la plateforme visée — et
  // emprunter le chemin de repli par téléchargement, celui que l'utilisateur
  // emprunte réellement.
  delete window.showSaveFilePicker;
  delete window.showOpenFilePicker;
});

const page = await contexte.newPage();
const erreurs = [];
page.on('pageerror', (e) => erreurs.push(String(e).slice(0, 200)));
const echecs = [];
const chiffre = (c) => page.getByRole('button', { name: c, exact: true });

async function passerLeVerrou() {
  await page.waitForSelector('main', { timeout: 45000 });
  if (!(await chiffre('5').count())) return;
  const pose = await page.getByText('Choisissez un code').count();
  for (const c of ['4', '9', '1', '3']) await chiffre(c).click();
  if (pose) {
    await page.getByRole('button', { name: 'Suivant' }).click();
    for (const c of ['4', '9', '1', '3']) await chiffre(c).click();
  }
  await page.waitForTimeout(3000);
}

async function creerProfilSiBesoin() {
  const champ = page.locator('input[type="text"], input:not([type])').first();
  await champ.waitFor({ timeout: 20000 }).catch(() => undefined);
  if (!(await champ.count())) return;
  await champ.fill('Test');
  for (let i = 0; i < 90; i += 1) {
    const b = page.getByRole('button', { name: /créer|commencer|valider/i }).first();
    if ((await b.count()) && (await b.isEnabled())) { await b.click(); break; }
    await page.waitForTimeout(1000);
  }
}

/**
 * Le rechargement conserve la route : après un effacement ou une restauration,
 * on est encore sur les réglages. On repasse donc explicitement par l'accueil.
 */
async function allerAujourdhui() {
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 90000 });
  await passerLeVerrou();
  await creerProfilSiBesoin();
  await page.getByRole('link', { name: "Aujourd'hui" }).first().waitFor({ timeout: 90000 });
  await page.getByRole('link', { name: "Aujourd'hui" }).first().click();
  await page.waitForTimeout(2000);
}

async function ouvrirReglages() {
  await page.getByRole('button', { name: 'Réglages' }).first().click();
  await page.getByText('Sauvegarde chiffrée').waitFor({ timeout: 20000 });
}

// --- 1. Un carnet à sauvegarder -------------------------------------------
await page.goto(BASE, { waitUntil: 'networkidle', timeout: 90000 });
await passerLeVerrou();
await creerProfilSiBesoin();
await page.getByRole('link', { name: "Aujourd'hui" }).first().waitFor({ timeout: 90000 });

await page.getByRole('link', { name: 'Produits' }).first().click();
await page.getByPlaceholder('Nom du médicament ou substance').fill('doliprane 1000');
const resultat = page.locator('button, [role="button"]').filter({ hasText: /doliprane/i }).first();
await resultat.waitFor({ timeout: 30000 });
await resultat.click();
await page.getByRole('button', { name: /ajouter à mes produits/i }).click();
await page.waitForTimeout(1500);

await page.getByRole('link', { name: "Aujourd'hui" }).first().click();
await page.getByRole('button', { name: /enregistrer une prise/i }).first().click();
await page.locator('button').filter({ hasText: /doliprane/i }).first().click();
await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
await page.waitForTimeout(2500);
if (!(await page.getByText(/1\s*000 mg/).count())) echecs.push('la prise de départ n’a pas été enregistrée');
console.log('· carnet peuplé : 1 produit, 1 prise');

// --- 2. Produire l'archive -------------------------------------------------
await ouvrirReglages();
await page.getByPlaceholder(/phrase de passe/i).fill(PHRASE);
const telechargement = page.waitForEvent('download', { timeout: 30000 });
await page.getByRole('button', { name: /enregistrer une sauvegarde/i }).click();
const fichier = await telechargement;
const chemin = join('captures', 'carnet.medco');
await fichier.saveAs(chemin);
const taille = statSync(chemin).size;
console.log(`· archive produite : ${fichier.suggestedFilename()} (${taille} octets)`);
if (taille < 200) echecs.push(`archive suspecte : ${taille} octets`);

const bilan = await page.locator('main').innerText();
const lignes = /Sauvegarde enregistrée\s*:\s*(\d+) lignes/.exec(bilan);
if (!lignes) echecs.push('la sauvegarde n’annonce pas ce qu’elle contient');
else console.log(`· annoncé : ${lignes[1]} lignes`);

// L'archive doit être illisible en clair : le nom du produit ne doit pas
// apparaître dans le fichier.
const octets = readFileSync(chemin);
if (octets.includes(Buffer.from('DOLIPRANE'))) echecs.push('le contenu de l’archive est en clair');
if (octets.subarray(0, 6).toString() !== 'MEDCO1') echecs.push('en-tête d’archive inattendu');

// --- 3. Effacer l'appareil -------------------------------------------------
await page.getByRole('button', { name: 'Effacer cet appareil', exact: true }).click();
await page.getByRole('button', { name: /confirmer : tout effacer/i }).click();
await page.waitForTimeout(4000);
await allerAujourdhui();
if (!(await page.getByText(/aucune prise enregistrée/i).count())) {
  echecs.push('l’effacement n’a pas vidé le carnet : la suite ne prouverait rien');
}
console.log('· appareil effacé, carnet vide');

// --- 4. Restaurer ----------------------------------------------------------
await ouvrirReglages();
await page.getByPlaceholder(/phrase de passe/i).fill(PHRASE);
await page.getByRole('button', { name: /restaurer une sauvegarde/i }).click();
await page.locator('#archive').setInputFiles(chemin);
await page.waitForTimeout(6000);

await allerAujourdhui();
await page.screenshot({ path: 'captures/sauvegarde-restauree.png', fullPage: true });

const texte = await page.locator('body').innerText();
if (!/1\s*000 mg/.test(texte)) echecs.push('la prise n’est pas revenue après restauration');
if (!/DOLIPRANE/i.test(texte)) echecs.push('le produit n’est pas revenu après restauration');
if (/aucune prise enregistrée/i.test(texte)) echecs.push('le carnet restauré est vide');

// --- 5. Une phrase de passe fausse ne doit rien détruire --------------------
await ouvrirReglages();
await page.getByPlaceholder(/phrase de passe/i).fill('phrase de passe fausse');
await page.getByRole('button', { name: /restaurer une sauvegarde/i }).click();
await page.locator('#archive').setInputFiles(chemin);
await page.waitForTimeout(4000);
const apresEchec = await page.locator('main').innerText();
if (!/incorrecte|altérée/i.test(apresEchec)) echecs.push('une phrase de passe fausse ne dit rien');
await allerAujourdhui();
if (/aucune prise enregistrée/i.test(await page.locator('body').innerText())) {
  echecs.push('une phrase de passe fausse a effacé le carnet');
}

if (erreurs.length) echecs.push(`erreurs JS : ${[...new Set(erreurs)].join(' | ')}`);

await contexte.close();
await navigateur.close();
serveur.close();

console.log(`\nsauvegarde · fuseau ${FUSEAU}`);
if (echecs.length) {
  for (const e of echecs) console.log(`  ✗ ${e}`);
  process.exit(1);
}
console.log('  ✓ archive chiffrée, appareil effacé, carnet retrouvé intact');
