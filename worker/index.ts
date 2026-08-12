/**
 * Worker de rappel — Cloudflare Workers (spec §10.3).
 *
 * ## Le Worker est aveugle
 *
 * Il sait qu'un endpoint veut un ping à 21 h. Il **ne peut pas** savoir que
 * c'est une pilule : le contenu utile est chiffré par l'application, la clé
 * n'est jamais transmise, et le service worker déchiffre à réception.
 *
 * Le `.ics` servi en `webcal://` est produit par l'application et déposé tel
 * quel : ses `SUMMARY` sont neutres (§10.4), il ne nomme aucun médicament.
 *
 * ## Ce que le Worker ne garantit pas
 *
 * Le push est la couche **actionnable**, pas la garantie (§10.2). Si le Worker
 * tombe, la couche calendrier continue de fonctionner : l'alarme est gérée par
 * le système, sans réseau. C'est pour cela qu'elle est activée par défaut pour
 * une pilule et non désactivable sans confirmation explicite.
 */

export interface Env {
  ABONNEMENTS: KVNamespace;
  VAPID_CLE_PUBLIQUE: string;
  /** Clé privée VAPID, JWK P-256 sérialisé en JSON. Secret de déploiement. */
  VAPID_CLE_PRIVEE: string;
  VAPID_SUJET: string;
}

interface Abonnement {
  readonly endpoint: string;
  readonly p256dh: string;
  readonly auth: string;
  /** Fuseau IANA du profil. */
  readonly tz: string;
  /** Heures locales attendues, `HH:MM`. Une heure, pas un diagnostic. */
  readonly slots: readonly string[];
  readonly rrule: string;
  /** Blob AES-GCM chiffré côté client. Illisible ici. */
  readonly payload: string;
}

const PREFIXE_ABONNEMENT = 'sub:';
const PREFIXE_CALENDRIER = 'cal:';
const TTL_PUSH = 900; // 15 min : au-delà, la relance de §10.5 a déjà eu lieu

export default {
  async scheduled(_evenement: ScheduledController, env: Env, contexte: ExecutionContext) {
    contexte.waitUntil(envoyerLesRappelsDuMoment(env, new Date()));
  },

  async fetch(requete: Request, env: Env): Promise<Response> {
    const url = new URL(requete.url);
    const [, ressource, identifiant] = url.pathname.split('/');

    if (ressource === 'cle-publique' && requete.method === 'GET') {
      return new Response(env.VAPID_CLE_PUBLIQUE, { headers: entetes('text/plain') });
    }

    if (ressource === 'abonnement' && identifiant) {
      if (requete.method === 'PUT') {
        const corps = (await requete.json()) as Abonnement;
        if (!corps.endpoint || !corps.p256dh || !corps.auth) {
          return new Response('Abonnement incomplet', { status: 400 });
        }
        await env.ABONNEMENTS.put(PREFIXE_ABONNEMENT + identifiant, JSON.stringify(corps));
        return new Response(null, { status: 204 });
      }
      if (requete.method === 'DELETE') {
        await env.ABONNEMENTS.delete(PREFIXE_ABONNEMENT + identifiant);
        return new Response(null, { status: 204 });
      }
    }

    if (ressource === 'calendrier' && identifiant) {
      const cle = PREFIXE_CALENDRIER + identifiant.replace(/\.ics$/, '');
      if (requete.method === 'PUT') {
        await env.ABONNEMENTS.put(cle, await requete.text());
        return new Response(null, { status: 204 });
      }
      if (requete.method === 'GET') {
        const ics = await env.ABONNEMENTS.get(cle);
        if (!ics) return new Response('Calendrier inconnu', { status: 404 });
        return new Response(ics, {
          headers: {
            ...entetes('text/calendar; charset=utf-8'),
            // Les agendas resynchronisent : pas de cache long.
            'Cache-Control': 'public, max-age=900',
          },
        });
      }
    }

    return new Response('Ressource inconnue', { status: 404 });
  },
};

function entetes(type: string): Record<string, string> {
  return {
    'Content-Type': type,
    'Access-Control-Allow-Origin': '*',
    // Aucune télémétrie, aucun journal applicatif (§15).
    'Referrer-Policy': 'no-referrer',
  };
}

// ---------------------------------------------------------------------------
// Cron : une minute
// ---------------------------------------------------------------------------

export async function envoyerLesRappelsDuMoment(env: Env, instant: Date): Promise<void> {
  const liste = await env.ABONNEMENTS.list({ prefix: PREFIXE_ABONNEMENT });

  for (const cle of liste.keys) {
    const brut = await env.ABONNEMENTS.get(cle.name);
    if (!brut) continue;
    const abonnement = JSON.parse(brut) as Abonnement;

    if (!slotAtteint(abonnement, instant)) continue;

    const reponse = await envoyerPush(abonnement, env);
    // 404 et 410 : l'abonnement n'existe plus côté navigateur.
    if (reponse.status === 404 || reponse.status === 410) {
      await env.ABONNEMENTS.delete(cle.name);
    }
  }
}

/** Vrai si l'heure locale de l'abonnement correspond à l'une de ses heures. */
export function slotAtteint(abonnement: Abonnement, instant: Date): boolean {
  const heureLocale = new Intl.DateTimeFormat('fr-FR', {
    timeZone: abonnement.tz,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(instant);
  return abonnement.slots.includes(heureLocale.replace('h', ':'));
}

// ---------------------------------------------------------------------------
// Web Push — RFC 8291 (chiffrement) et RFC 8292 (VAPID)
// ---------------------------------------------------------------------------

async function envoyerPush(abonnement: Abonnement, env: Env): Promise<Response> {
  const corps = await chiffrer(abonnement, base64UrlVersOctets(abonnement.payload));
  const audience = new URL(abonnement.endpoint).origin;

  return fetch(abonnement.endpoint, {
    method: 'POST',
    headers: {
      TTL: String(TTL_PUSH),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      Urgency: 'high',
      Authorization: `vapid t=${await jetonVapid(audience, env)}, k=${env.VAPID_CLE_PUBLIQUE}`,
    },
    body: corps,
  });
}

/**
 * Chiffrement `aes128gcm` (RFC 8291).
 *
 * Le contenu passé ici est **déjà** chiffré par l'application : cette couche
 * est celle du transport Web Push, elle ne rend pas le Worker capable de lire
 * quoi que ce soit.
 */
async function chiffrer(abonnement: Abonnement, contenu: Uint8Array): Promise<ArrayBuffer> {
  const clePublicClient = base64UrlVersOctets(abonnement.p256dh);
  const secretAuth = base64UrlVersOctets(abonnement.auth);

  const paireEphemere = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ]);
  const clePubliqueEphemere = new Uint8Array(
    await crypto.subtle.exportKey('raw', paireEphemere.publicKey),
  );

  const cleClient = await crypto.subtle.importKey(
    'raw',
    clePublicClient,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const secretPartage = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: cleClient }, paireEphemere.privateKey, 256),
  );

  const sel = crypto.getRandomValues(new Uint8Array(16));

  // PRK_key = HMAC(auth, ecdh_secret) ; info = "WebPush: info" || ua_public || as_public
  const info = concat(
    encodeur.encode('WebPush: info\0'),
    clePublicClient,
    clePubliqueEphemere,
  );
  const prkCle = await hkdf(secretAuth, secretPartage, info, 32);
  const cleContenu = await hkdf(sel, prkCle, encodeur.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(sel, prkCle, encodeur.encode('Content-Encoding: nonce\0'), 12);

  const cleAes = await crypto.subtle.importKey('raw', cleContenu, { name: 'AES-GCM' }, false, [
    'encrypt',
  ]);
  // Le padding délimiteur `0x02` marque le dernier enregistrement.
  const chiffre = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce },
      cleAes,
      concat(contenu, new Uint8Array([0x02])),
    ),
  );

  const entete = concat(
    sel,
    new Uint8Array([0, 0, 0x10, 0]), // rs = 4096
    new Uint8Array([clePubliqueEphemere.length]),
    clePubliqueEphemere,
  );
  return concat(entete, chiffre).buffer as ArrayBuffer;
}

/** Jeton VAPID (JWT ES256), valable une heure. */
async function jetonVapid(audience: string, env: Env): Promise<string> {
  const entete = base64Url(encodeur.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const charge = base64Url(
    encodeur.encode(
      JSON.stringify({
        aud: audience,
        exp: Math.floor(Date.now() / 1000) + 3600,
        sub: env.VAPID_SUJET,
      }),
    ),
  );

  const cle = await crypto.subtle.importKey(
    'jwk',
    JSON.parse(env.VAPID_CLE_PRIVEE) as JsonWebKey,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      cle,
      encodeur.encode(`${entete}.${charge}`),
    ),
  );
  return `${entete}.${charge}.${base64Url(signature)}`;
}

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

const encodeur = new TextEncoder();

async function hkdf(
  sel: Uint8Array,
  matiere: Uint8Array,
  info: Uint8Array,
  longueur: number,
): Promise<Uint8Array> {
  const cleSel = await crypto.subtle.importKey('raw', sel, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  const prk = new Uint8Array(await crypto.subtle.sign('HMAC', cleSel, matiere));
  const clePrk = await crypto.subtle.importKey('raw', prk, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  const bloc = new Uint8Array(
    await crypto.subtle.sign('HMAC', clePrk, concat(info, new Uint8Array([1]))),
  );
  return bloc.slice(0, longueur);
}

function concat(...morceaux: Uint8Array[]): Uint8Array {
  const total = morceaux.reduce((somme, morceau) => somme + morceau.length, 0);
  const resultat = new Uint8Array(total);
  let position = 0;
  for (const morceau of morceaux) {
    resultat.set(morceau, position);
    position += morceau.length;
  }
  return resultat;
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
