/**
 * Service worker (spec §10, §11).
 *
 * Deux rôles :
 *  · précache de l'application (Workbox, injecté au build) ;
 *  · réception des push et déchiffrement du contenu utile.
 *
 * ⚠ Le contenu de la notification est chiffré côté client : le Worker
 * Cloudflare qui l'a relayé ne peut pas le lire (§10.3).
 * ⚠ R4 — la notification n'affiche **aucune consigne**. Elle rappelle l'heure,
 * rien d'autre.
 */

/// <reference lib="webworker" />

import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

const BASE_INDEXEDDB = 'medco-cles';
const CLE_STOCKAGE = 'medco-push';

// ---------------------------------------------------------------------------
// Catalogue : mis en cache dès l'installation
// ---------------------------------------------------------------------------

/**
 * Le bundle catalogue n'est pas précaché par Workbox — il est versionné par
 * date et vaut trois mégaoctets. Il est en revanche **indispensable** : sans
 * lui, l'application n'a rien à compter.
 *
 * Le scénario à couvrir est celui d'un hébergement qu'on referme : le site
 * reste public le temps que tout le monde installe, puis redevient privé et
 * répond 404. Une PWA installée survit à ça — le service worker n'est pas
 * désinscrit — mais elle ne survivait pas si le catalogue n'avait pas encore
 * été téléchargé, car il l'était **à la première ouverture**, pas à
 * l'installation.
 *
 * D'où cette mise en cache dès l'installation du service worker, c'est-à-dire
 * dès la première visite dans le navigateur, avant même l'ajout à l'écran
 * d'accueil. Le fichier reste disponible ensuite, robinet fermé ou non.
 *
 * La variante **gzip** est retenue : `DecompressionStream('gzip')` existe
 * partout, `'br'` n'existe ni sur Safari ni sur Firefox. Mettre les deux en
 * cache coûterait cinq mégaoctets pour un seul usage.
 */
const CACHE_CATALOGUE = 'medco-catalogue-v1';

self.addEventListener('install', (evenement) => {
  // Sans cela, le nouveau service worker attend la fermeture de **tous** les
  // clients. Sur une PWA installée, « fermer » veut dire tuer l'application :
  // en pratique, la mise à jour n'arrivait jamais.
  void self.skipWaiting();
  evenement.waitUntil(mettreEnCacheLeCatalogue());
});

self.addEventListener('activate', (evenement) => {
  // Prendre la main sur les pages déjà ouvertes, sinon elles continuent d'être
  // servies par l'ancien service worker jusqu'à leur propre rechargement.
  evenement.waitUntil(self.clients.claim());
});

async function mettreEnCacheLeCatalogue(): Promise<void> {
  try {
    const base = new URL('./', self.registration.scope);
    const urlManifest = new URL('bundles/manifest.json', base);
    const reponse = await fetch(urlManifest, { cache: 'no-cache' });
    if (!reponse.ok) return;

    const manifest = (await reponse.clone().json()) as { fichier_gzip: string };
    const cache = await caches.open(CACHE_CATALOGUE);
    await cache.put(urlManifest, reponse);
    await cache.add(new URL(`bundles/${manifest.fichier_gzip}`, base));
  } catch {
    // Hors ligne à l'installation : l'application retentera au premier
    // lancement. Échouer ici empêcherait le service worker de s'activer.
  }
}

self.addEventListener('fetch', (evenement) => {
  const requete = evenement.request;
  if (requete.method !== 'GET' || !new URL(requete.url).pathname.includes('/bundles/')) return;

  // Réseau d'abord : une nouvelle version du catalogue doit pouvoir descendre
  // tant que le site répond. Cache ensuite : c'est le filet du robinet fermé.
  evenement.respondWith(
    (async () => {
      try {
        const reseau = await fetch(requete);
        if (reseau.ok) {
          const cache = await caches.open(CACHE_CATALOGUE);
          await cache.put(requete, reseau.clone());
          return reseau;
        }
        return (await caches.match(requete)) ?? reseau;
      } catch (cause) {
        const enCache = await caches.match(requete);
        if (enCache) return enCache;
        throw cause;
      }
    })(),
  );
});

self.addEventListener('push', (evenement) => {
  evenement.waitUntil(afficher(evenement.data?.text() ?? ''));
});

async function afficher(charge: string): Promise<void> {
  const contenu = (await dechiffrer(charge)) ?? {
    titre: 'Rappel',
    corps: "C'est l'heure de votre prise.",
  };

  await self.registration.showNotification(contenu.titre, {
    body: contenu.corps,
    tag: 'medco-rappel', // remplace le rappel précédent au lieu de s'empiler
    // §10.5 — un rappel, une relance, puis silence. Aucune vibration d'alerte,
    // aucun badge de retard (§12.1).
    silent: false,
    actions: [
      { action: 'valider', title: 'Valider' },
      { action: 'plus-tard', title: 'Plus tard' },
    ],
    data: { ouvrirLe: '/pilulier' },
  } as NotificationOptions);
}

self.addEventListener('notificationclick', (evenement) => {
  evenement.notification.close();
  if (evenement.action === 'plus-tard') return;

  const cible = (evenement.notification.data as { ouvrirLe?: string } | undefined)?.ouvrirLe ?? '/';
  const destination = evenement.action === 'valider' ? `${cible}?valider=1` : cible;

  evenement.waitUntil(
    (async () => {
      const fenetres = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existante = fenetres[0];
      if (existante) {
        await existante.focus();
        await existante.navigate(destination).catch(() => undefined);
        return;
      }
      await self.clients.openWindow(destination);
    })(),
  );
});

async function dechiffrer(charge: string): Promise<{ titre: string; corps: string } | null> {
  if (!charge) return null;
  try {
    const cle = await lireCle();
    if (!cle) return null;
    const octets = base64UrlVersOctets(charge);
    const clair = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: octets.slice(0, 12) },
      cle,
      octets.slice(12),
    );
    return JSON.parse(new TextDecoder().decode(clair)) as { titre: string; corps: string };
  } catch {
    // Contenu illisible : on affiche le rappel neutre plutôt que rien.
    return null;
  }
}

function lireCle(): Promise<CryptoKey | null> {
  return new Promise((resoudre) => {
    const ouverture = indexedDB.open(BASE_INDEXEDDB, 1);
    ouverture.onsuccess = () => {
      const requete = ouverture.result.transaction('cles').objectStore('cles').get(CLE_STOCKAGE);
      requete.onsuccess = () => resoudre((requete.result as CryptoKey | undefined) ?? null);
      requete.onerror = () => resoudre(null);
    };
    ouverture.onerror = () => resoudre(null);
  });
}

function base64UrlVersOctets(valeur: string): Uint8Array {
  const base64 = valeur.replace(/-/g, '+').replace(/_/g, '/');
  const binaire = atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '='));
  return Uint8Array.from(binaire, (caractere) => caractere.charCodeAt(0));
}
