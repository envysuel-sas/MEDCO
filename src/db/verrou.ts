/**
 * Verrou par code — spec §15.
 *
 * ## Pourquoi un code, et pas un compte
 *
 * Rien n'est partagé, rien n'est synchronisé, il n'y a pas de serveur
 * applicatif : un compte n'aurait rien à authentifier. Le carnet vit sur
 * l'appareil, le code protège l'appareil. C'est tout ce qu'il y a à protéger.
 *
 * ## Ce que ce verrou fait, et ce qu'il ne fait pas
 *
 * La menace que §15 nomme est « un téléphone perdu ou prêté, pas une attaque
 * ciblée ». Le verrou couvre exactement celle-là : il barre l'accès au carnet
 * à qui prend le téléphone en main.
 *
 * Il ne chiffre **pas** la base. §15 prévoit à terme un chiffrement AES-GCM
 * applicatif sur les champs sensibles, adossé à WebAuthn PRF ; ce n'est pas
 * livré, et c'est signalé comme tel dans `docs/maquette/manques.md`. Qui
 * extrairait le stockage OPFS de l'appareil lirait le carnet. Le chiffrement
 * du disque par iOS ou Android reste la couche qui répond à ce cas-là.
 *
 * Ne jamais présenter ce verrou comme un chiffrement dans l'interface.
 *
 * ## Pourquoi Argon2id pour un simple contrôle
 *
 * La preuve stockée ne doit pas révéler le code. Les gens réutilisent leurs
 * codes — celui du téléphone, celui de la carte bancaire. Un SHA-256 nu d'un
 * code à quatre chiffres se casse par table exhaustive en quelques
 * millisecondes ; Argon2id, aux paramètres OWASP, rend cette table coûteuse à
 * construire. C'est du soin porté au code de l'utilisateur, pas à la base.
 *
 * ⚠ Ce module vit dans le Worker propriétaire de la base, jamais dans l'UI :
 * c'est le seul endroit où le contrôle ne peut pas être contourné par un appel
 * direct à `client.ts`.
 */

import { argon2id } from 'hash-wasm';

import { definirReglage, reglage } from './depots.js';

const CLE_SEL = 'verrou.sel';
const CLE_PREUVE = 'verrou.preuve';
const CLE_ESSAIS = 'verrou.essais';

export const LONGUEUR_MIN = 4;
export const LONGUEUR_MAX = 8;

/**
 * Paramètres OWASP pour Argon2id : 19 Mio, deux passes, un fil. Environ une
 * demi-seconde sur un téléphone de milieu de gamme — supportable une fois par
 * ouverture, coûteux à répéter dix mille fois.
 */
const PARAMS = { parallelism: 1, iterations: 2, memorySize: 19_456, hashLength: 32 } as const;

/** Au-delà, chaque essai raté impose une attente croissante. */
const ESSAIS_AVANT_ATTENTE = 5;
const ATTENTE_MAX_MS = 30_000;

/**
 * Ouvert pour la session seulement, jamais persisté : fermer l'application
 * referme le verrou (§15, « clé en mémoire, effacée à la fermeture »).
 */
let ouvert = false;

export interface EtatVerrou {
  /** Un code a été défini sur cet appareil. */
  readonly configure: boolean;
  readonly ouvert: boolean;
  readonly essaisRates: number;
  /** Millisecondes à patienter avant le prochain essai, 0 si aucune. */
  readonly attenteMs: number;
}

export function verrouEtat(): EtatVerrou {
  const essaisRates = Number(reglage(CLE_ESSAIS) ?? '0');
  return {
    configure: reglage(CLE_PREUVE) !== null,
    ouvert,
    essaisRates,
    attenteMs: attentePour(essaisRates),
  };
}

export function verrouEstOuvert(): boolean {
  return ouvert;
}

export function verrouConfigure(): boolean {
  return reglage(CLE_PREUVE) !== null;
}

/** Premier lancement sur l'appareil : pose le code. Ne le remplace jamais. */
export async function verrouDefinir(code: string): Promise<void> {
  if (verrouConfigure()) throw new Error('Un code est déjà défini sur cet appareil.');
  verifierForme(code);

  const sel = crypto.getRandomValues(new Uint8Array(16));
  definirReglage(CLE_SEL, base64(sel));
  definirReglage(CLE_PREUVE, await deriver(code, sel));
  definirReglage(CLE_ESSAIS, '0');
  ouvert = true;
}

/** Retourne `false` sur un code faux — jamais d'exception, jamais de détail. */
export async function verrouOuvrir(code: string): Promise<boolean> {
  const selBrut = reglage(CLE_SEL);
  const attendue = reglage(CLE_PREUVE);
  if (!selBrut || !attendue) return false;

  const attente = attentePour(Number(reglage(CLE_ESSAIS) ?? '0'));
  if (attente > 0) await patienter(attente);

  const preuve = await deriver(code, octets(selBrut));
  if (!egaliteConstante(preuve, attendue)) {
    definirReglage(CLE_ESSAIS, String(Number(reglage(CLE_ESSAIS) ?? '0') + 1));
    return false;
  }

  definirReglage(CLE_ESSAIS, '0');
  ouvert = true;
  return true;
}

/** Mise en veille, second plan, fermeture : le carnet se referme. */
export function verrouFermer(): void {
  ouvert = false;
}

// ---------------------------------------------------------------------------

function verifierForme(code: string): void {
  if (!/^\d+$/.test(code) || code.length < LONGUEUR_MIN || code.length > LONGUEUR_MAX) {
    throw new Error(`Le code doit compter de ${LONGUEUR_MIN} à ${LONGUEUR_MAX} chiffres.`);
  }
}

async function deriver(code: string, sel: Uint8Array): Promise<string> {
  return argon2id({ password: code, salt: sel, outputType: 'hex', ...PARAMS });
}

/** Croissance géométrique, plafonnée : gêner sans jamais bloquer le légitime. */
function attentePour(essaisRates: number): number {
  if (essaisRates < ESSAIS_AVANT_ATTENTE) return 0;
  return Math.min(ATTENTE_MAX_MS, 2 ** (essaisRates - ESSAIS_AVANT_ATTENTE) * 1000);
}

function patienter(ms: number): Promise<void> {
  return new Promise((resoudre) => setTimeout(resoudre, ms));
}

/** Comparaison à durée constante : une sortie anticipée fuite le préfixe. */
function egaliteConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let ecart = 0;
  for (let index = 0; index < a.length; index += 1) {
    ecart |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return ecart === 0;
}

function base64(valeur: Uint8Array): string {
  let binaire = '';
  for (const octet of valeur) binaire += String.fromCharCode(octet);
  return btoa(binaire);
}

function octets(valeur: string): Uint8Array {
  return Uint8Array.from(atob(valeur), (caractere) => caractere.charCodeAt(0));
}
