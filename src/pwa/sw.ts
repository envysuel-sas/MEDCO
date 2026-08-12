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
