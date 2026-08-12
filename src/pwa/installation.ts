/**
 * Installation et persistance (spec §11).
 *
 * ⚠ §11.1 — sans installation sur l'écran d'accueil, iOS n'a pas de Push API
 * et purge le stockage au bout de sept jours. L'app **refuse de créer un
 * profil** tant qu'elle n'est pas installée : un journal de pilule dans un
 * onglet Safari est un piège.
 */

export type Plateforme = 'ios' | 'android' | 'autre';

export interface EtatInstallation {
  readonly installee: boolean;
  readonly plateforme: Plateforme;
  /** Navigateur intégré (WhatsApp, Instagram, Gmail) : l'option d'installation y est absente. */
  readonly navigateurIntegre: boolean;
  readonly inviteDisponible: boolean;
}

interface EvenementInstallation extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let invite: EvenementInstallation | null = null;

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (evenement) => {
    evenement.preventDefault();
    invite = evenement as EvenementInstallation;
  });
}

export function plateforme(): Plateforme {
  if (typeof navigator === 'undefined') return 'autre';
  const agent = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(agent)) return 'ios';
  if (/Android/.test(agent)) return 'android';
  return 'autre';
}

export function estInstallee(): boolean {
  if (typeof window === 'undefined') return false;
  const autonome = window.matchMedia?.('(display-mode: standalone)').matches ?? false;
  const iosAutonome = (navigator as { standalone?: boolean }).standalone === true;
  return autonome || iosAutonome;
}

/** WhatsApp, Instagram, Gmail : l'option « sur l'écran d'accueil » y est absente. */
export function estNavigateurIntegre(): boolean {
  if (typeof navigator === 'undefined') return false;
  const agent = navigator.userAgent;
  if (/FBAN|FBAV|Instagram|Line|Twitter|GSA/.test(agent)) return true;
  // Safari mobile hors app intégrée annonce toujours « Safari » ou « CriOS ».
  return plateforme() === 'ios' && /AppleWebKit/.test(agent) && !/Safari|CriOS|FxiOS/.test(agent);
}

export function etatInstallation(): EtatInstallation {
  return {
    installee: estInstallee(),
    plateforme: plateforme(),
    navigateurIntegre: estNavigateurIntegre(),
    inviteDisponible: invite !== null,
  };
}

export async function proposerInstallation(): Promise<'accepted' | 'dismissed' | 'indisponible'> {
  if (!invite) return 'indisponible';
  await invite.prompt();
  const { outcome } = await invite.userChoice;
  invite = null;
  return outcome;
}

/**
 * §11.3 — `persist()` est rappelé **à chaque ouverture** : la permission n'est
 * pas durable sur Safari.
 */
export async function demanderPersistance(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}

/** Prises en attente — `setAppBadge` uniquement, jamais de compteur affiché (§9.3). */
export async function majBadge(nombre: number): Promise<void> {
  const api = navigator as Navigator & {
    setAppBadge?: (n?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  if (nombre > 0) await api.setAppBadge?.(nombre);
  else await api.clearAppBadge?.();
}
