/**
 * Abonnement Web Push (spec §10.2, §10.3).
 *
 * ⚠ Le push est la couche **actionnable**, jamais la garantie. La garantie est
 * le calendrier : alarme gérée par le système, indépendante du réseau, du
 * Worker et de l'application. Pour une pilule, la couche calendrier est activée
 * par défaut et non désactivable sans confirmation explicite.
 *
 * ⚠ iOS 16.4+ n'accorde la Push API qu'à une **PWA installée** (§11.1).
 */

const CLE_STOCKAGE = 'medco-push';
const BASE_INDEXEDDB = 'medco-cles';

export interface ConfigurationPush {
  readonly urlWorker: string;
  readonly identifiant: string;
  readonly fuseau: string;
  readonly slots: readonly string[];
  readonly rrule: string;
}

export function pushDisponible(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/**
 * Abonne l'appareil et dépose l'abonnement chez le Worker.
 *
 * Le contenu utile est chiffré **ici**, avec une clé qui ne quitte jamais
 * l'appareil : le Worker ne peut pas savoir de quel traitement il s'agit.
 */
export async function abonner(configuration: ConfigurationPush): Promise<boolean> {
  if (!pushDisponible()) return false;
  if ((await Notification.requestPermission()) !== 'granted') return false;

  const enregistrement = await navigator.serviceWorker.ready;
  const clePublique = await fetch(`${configuration.urlWorker}/cle-publique`).then((r) => r.text());

  const abonnement =
    (await enregistrement.pushManager.getSubscription()) ??
    (await enregistrement.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlVersOctets(clePublique) as BufferSource,
    }));

  const cle = await cleLocale();
  const payload = await chiffrer(cle, {
    titre: 'Rappel',
    corps: "C'est l'heure de votre prise.",
  });

  const donnees = abonnement.toJSON();
  await fetch(`${configuration.urlWorker}/abonnement/${configuration.identifiant}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint: abonnement.endpoint,
      p256dh: donnees.keys?.['p256dh'] ?? '',
      auth: donnees.keys?.['auth'] ?? '',
      tz: configuration.fuseau,
      slots: configuration.slots,
      rrule: configuration.rrule,
      payload,
    }),
  });
  return true;
}

export async function desabonner(configuration: ConfigurationPush): Promise<void> {
  const enregistrement = await navigator.serviceWorker.ready;
  await (await enregistrement.pushManager.getSubscription())?.unsubscribe();
  await fetch(`${configuration.urlWorker}/abonnement/${configuration.identifiant}`, {
    method: 'DELETE',
  });
}

/** Dépose le calendrier neutre servi en `webcal://` (§10.2, §10.4). */
export async function publierCalendrier(
  configuration: ConfigurationPush,
  ics: string,
): Promise<string> {
  await fetch(`${configuration.urlWorker}/calendrier/${configuration.identifiant}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/calendar' },
    body: ics,
  });
  const url = new URL(`${configuration.urlWorker}/calendrier/${configuration.identifiant}.ics`);
  // iOS : un abonnement `webcal://` se resynchronise seul. Sur Android,
  // l'agenda Google n'accepte pas les URL — l'export manuel reste le chemin,
  // avec l'avertissement de doublon (§10.4).
  return `webcal://${url.host}${url.pathname}`;
}

// ---------------------------------------------------------------------------
// Clé locale de chiffrement du contenu utile
// ---------------------------------------------------------------------------

/**
 * Clé AES-GCM dédiée au contenu des notifications, distincte de la clé de
 * session du carnet (§15). Le service worker doit pouvoir déchiffrer sans
 * l'utilisateur : elle est donc persistée, et ne protège rien d'autre que le
 * libellé d'un rappel vis-à-vis du Worker.
 */
async function cleLocale(): Promise<CryptoKey> {
  const existante = await lireCle();
  if (existante) return existante;

  const cle = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
  await ecrireCle(cle);
  return cle;
}

function ouvrir(): Promise<IDBDatabase> {
  return new Promise((resoudre, rejeter) => {
    const requete = indexedDB.open(BASE_INDEXEDDB, 1);
    requete.onupgradeneeded = () => requete.result.createObjectStore('cles');
    requete.onsuccess = () => resoudre(requete.result);
    requete.onerror = () => rejeter(requete.error ?? new Error('IndexedDB indisponible'));
  });
}

async function lireCle(): Promise<CryptoKey | null> {
  const base = await ouvrir();
  return new Promise((resoudre) => {
    const requete = base.transaction('cles').objectStore('cles').get(CLE_STOCKAGE);
    requete.onsuccess = () => resoudre((requete.result as CryptoKey | undefined) ?? null);
    requete.onerror = () => resoudre(null);
  });
}

async function ecrireCle(cle: CryptoKey): Promise<void> {
  const base = await ouvrir();
  base.transaction('cles', 'readwrite').objectStore('cles').put(cle, CLE_STOCKAGE);
}

async function chiffrer(cle: CryptoKey, contenu: unknown): Promise<string> {
  const vecteur = crypto.getRandomValues(new Uint8Array(12));
  const chiffre = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: vecteur },
      cle,
      new TextEncoder().encode(JSON.stringify(contenu)),
    ),
  );
  const total = new Uint8Array(vecteur.length + chiffre.length);
  total.set(vecteur);
  total.set(chiffre, vecteur.length);
  return base64Url(total);
}

function base64Url(octets: Uint8Array): string {
  let binaire = '';
  for (const octet of octets) binaire += String.fromCharCode(octet);
  return btoa(binaire).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlVersOctets(valeur: string): Uint8Array {
  const base64 = valeur.replace(/-/g, '+').replace(/_/g, '/');
  const binaire = atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '='));
  return Uint8Array.from(binaire, (caractere) => caractere.charCodeAt(0));
}
