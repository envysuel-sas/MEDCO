/**
 * Contrôle de non-régression sur le défaut « la prise ne s'enregistre pas en
 * direct » — dans le navigateur, hors UTC, sur le bundle réellement déployé.
 *
 * Le défaut était invisible en UTC : la borne de fenêtre était écrite en UTC
 * (`Z`) alors que `prise.horodatage` porte l'offset local, et la requête
 * compare des chaînes. Le contexte est donc explicitement calé sur
 * `Europe/Paris`, où l'offset est non nul — c'est la seule condition qui
 * révèle le défaut.
 *
 * Usage :
 *   node scripts/verifier-prise.mjs                  # dist local
 *   node scripts/verifier-prise.mjs --en-ligne       # site déployé
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';

const EN_LIGNE = process.argv.includes('--en-ligne');
const PORT = 4186;
const BASE = EN_LIGNE ? 'https://envysuel-sas.github.io/MEDCO/' : `http://localhost:${PORT}/MEDCO/`;
const FUSEAU = 'Europe/Paris';
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.wasm': 'application/wasm',
  '.gz': 'application/gzip', '.br': 'application/octet-stream', '.txt': 'text/plain',
};

let serveur;
if (!EN_LIGNE) {
  serveur = createServer((req, res) => {
    const chemin = decodeURI(req.url.split('?')[0]).replace(/^\/MEDCO/, '') || '/';
    let f = join('dist', normalize(chemin).replace(/^(\.\.[/\\])+/, ''));
    if (!existsSync(f) || !statSync(f).isFile()) f = join('dist', 'index.html');
    res.writeHead(200, { 'Content-Type': TYPES[extname(f)] ?? 'application/octet-stream' });
    res.end(readFileSync(f));
  });
  await new Promise((r) => serveur.listen(PORT, r));
}

mkdirSync('captures', { recursive: true });
const navigateur = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const contexte = await navigateur.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  timezoneId: FUSEAU,
  locale: 'fr-FR',
});

// L'app refuse tout écran tant qu'elle n'est pas installée (§11.1).
await contexte.addInitScript(() => {
  const origine = window.matchMedia.bind(window);
  window.matchMedia = (requete) =>
    /display-mode:\s*standalone/.test(requete)
      ? { matches: true, media: requete, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }
      : origine(requete);
});

const page = await contexte.newPage();
const erreurs = [];
page.on('pageerror', (e) => erreurs.push(String(e).slice(0, 200)));

const echecs = [];
const dire = (m) => console.log(m);

await page.goto(BASE, { waitUntil: 'networkidle', timeout: 90000 });

// 1. Poser le code, puis le confirmer.
await page.waitForSelector('main', { timeout: 45000 });
const chiffre = (c) => page.getByRole('button', { name: c, exact: true });
if (await chiffre('5').count()) {
  for (const c of ['4', '9', '1', '3']) await chiffre(c).click();
  const suivant = page.getByRole('button', { name: 'Suivant' });
  if (await suivant.count()) {
    await suivant.click();
    for (const c of ['4', '9', '1', '3']) await chiffre(c).click();
  }
  // L'ouverture dérive Argon2id : l'écran suivant n'est pas monté tout de suite.
  await page.waitForTimeout(3000);
}

// 2. Créer le profil ; le catalogue s'installe dans la foulée.
const champNom = page.locator('input[type="text"], input:not([type])').first();
await champNom.waitFor({ timeout: 30000 }).catch(() => undefined);
if (await champNom.count()) {
  await champNom.fill('Test');
  for (let i = 0; i < 90; i += 1) {
    const b = page.getByRole('button', { name: /créer|commencer|valider/i }).first();
    if ((await b.count()) && (await b.isEnabled())) { await b.click(); break; }
    await page.waitForTimeout(1000);
  }
}
await page
  .getByRole('link', { name: "Aujourd'hui" })
  .first()
  .waitFor({ timeout: 90000 })
  .catch(async () => {
    await page.screenshot({ path: 'captures/prise-echec-demarrage.png', fullPage: true });
    console.log(await page.locator('body').innerText());
    throw new Error("l'application n'a jamais démarré (capture : captures/prise-echec-demarrage.png)");
  });
dire('· application démarrée');

// 3. Ajouter un produit réel du catalogue BDPM.
await page.getByRole('link', { name: 'Produits' }).first().click();
await page.getByPlaceholder('Nom du médicament ou substance').fill('doliprane 1000');
const resultat = page.locator('button, [role="button"]').filter({ hasText: /doliprane/i }).first();
await resultat.waitFor({ timeout: 30000 }).catch(() => echecs.push('aucun résultat pour « doliprane 1000 » dans le catalogue'));
if (!echecs.length) {
  await resultat.click();
  const ajouter = page.getByRole('button', { name: /ajouter à mes produits/i });
  await ajouter.waitFor({ timeout: 15000 });
  await ajouter.click();
  await page.waitForTimeout(1500);
  dire('· produit ajouté');
}

// 4. Enregistrer une prise, et n'accorder aucun rechargement.
await page.getByRole('link', { name: "Aujourd'hui" }).first().click();
await page.waitForTimeout(800);

const videAvant = await page.getByText(/aucune prise enregistrée/i).count();
if (!videAvant) echecs.push("l'écran ne partait pas d'un carnet vide : le contrôle ne prouve rien");

await page.getByRole('button', { name: /enregistrer une prise/i }).first().click();
const puce = page.locator('button').filter({ hasText: /doliprane/i }).first();
await puce.waitFor({ timeout: 15000 }).catch(() => echecs.push('le produit ajouté n’apparaît pas dans la feuille de saisie'));
await puce.click().catch(() => undefined);
await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();

// La feuille se referme d'elle-même quand l'enregistrement a abouti.
await page.waitForTimeout(3000);
await page.screenshot({ path: 'captures/prise-directe.png', fullPage: true });

// 5. Le verdict : la prise doit être là, sans rechargement.
const videApres = await page.getByText(/aucune prise enregistrée/i).count();
const paracetamol = await page.getByText(/paracétamol/i).count();

if (videApres) echecs.push("après enregistrement, l'écran affiche encore « Aucune prise enregistrée »");
if (!paracetamol) echecs.push('le paracétamol n’apparaît nulle part après la prise');

// 6. Et elle doit survivre au rechargement — la base, pas seulement l'état.
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('main', { timeout: 45000 });
if (await chiffre('5').count()) for (const c of ['4', '9', '1', '3']) await chiffre(c).click();
await page.getByRole('link', { name: "Aujourd'hui" }).first().waitFor({ timeout: 60000 }).catch(() => undefined);
await page.waitForTimeout(2500);
if (await page.getByText(/aucune prise enregistrée/i).count()) {
  echecs.push('après rechargement, la prise a disparu');
}

if (erreurs.length) echecs.push(`erreurs JS : ${[...new Set(erreurs)].join(' | ')}`);

await contexte.close();
await navigateur.close();
serveur?.close();

console.log(`\n${EN_LIGNE ? 'en ligne' : 'dist local'} · fuseau ${FUSEAU}`);
if (echecs.length) {
  for (const e of echecs) console.log(`  ✗ ${e}`);
  process.exit(1);
}
console.log('  ✓ la prise apparaît immédiatement, et survit au rechargement');
