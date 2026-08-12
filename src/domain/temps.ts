/**
 * Temps — module pur (spec §7.4, §7.5).
 *
 * Deux échelles, à ne jamais confondre :
 *  · **fenêtre glissante** (`PT24H`) : arithmétique sur l'instant absolu ;
 *  · **jour calendaire local** : lu dans l'offset porté par l'horodatage.
 *
 * `prise.horodatage` est en ISO 8601 **avec offset local**. Le jour calendaire
 * est donc les dix premiers caractères de la chaîne : le normaliser en UTC
 * déplacerait les prises nocturnes d'un jour (§7.4).
 */

import type { Instant, JourLocal } from './types.js';

const MINUTE = 60_000;
export const HEURE = 3_600_000;
export const JOUR = 86_400_000;

/** Jour calendaire local d'un instant, sans conversion de fuseau. */
export function jourLocal(instant: Instant): JourLocal {
  return instant.slice(0, 10);
}

/** Heure locale `HH:MM` d'un instant. */
export function heureLocale(instant: Instant): string {
  return instant.slice(11, 16);
}

export function epoch(instant: Instant): number {
  const valeur = Date.parse(instant);
  if (Number.isNaN(valeur)) throw new Error(`Instant illisible : ${instant}`);
  return valeur;
}

/** Durée ISO 8601 en millisecondes. Sous-ensemble utilisé par les règles. */
export function dureeMs(duree: string): number {
  const correspondance = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/.exec(duree);
  if (!correspondance) throw new Error(`Durée ISO 8601 non gérée : ${duree}`);
  const [, jours, heures, minutes] = correspondance;
  const total =
    Number(jours ?? 0) * JOUR + Number(heures ?? 0) * HEURE + Number(minutes ?? 0) * MINUTE;
  if (total === 0) throw new Error(`Durée nulle : ${duree}`);
  return total;
}

/** Fenêtre glissante finissant à `fin`. La borne de fin est exclue. */
export function fenetreGlissante(fin: Instant, duree: string): { debut: Instant; fin: Instant } {
  return { debut: new Date(epoch(fin) - dureeMs(duree)).toISOString(), fin };
}

export function ajouterJours(jour: JourLocal, nombre: number): JourLocal {
  const date = new Date(`${jour}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + nombre);
  return date.toISOString().slice(0, 10);
}

export function ecartEnJours(depuis: JourLocal, jusqua: JourLocal): number {
  return Math.round(
    (Date.parse(`${jusqua}T00:00:00Z`) - Date.parse(`${depuis}T00:00:00Z`)) / JOUR,
  );
}

/** Jour de la semaine, `MO` … `SU` (RFC 5545). */
export function jourSemaine(jour: JourLocal): string {
  const index = new Date(`${jour}T00:00:00Z`).getUTCDay();
  return ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][index]!;
}

// ---------------------------------------------------------------------------
// Fuseaux
// ---------------------------------------------------------------------------

const formateurs = new Map<string, Intl.DateTimeFormat>();

function formateur(fuseau: string): Intl.DateTimeFormat {
  let existant = formateurs.get(fuseau);
  if (!existant) {
    existant = new Intl.DateTimeFormat('en-CA', {
      timeZone: fuseau,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formateurs.set(fuseau, existant);
  }
  return existant;
}

/** Heure murale d'un fuseau, exprimée comme si elle était UTC. */
function murale(fuseau: string, instant: number): number {
  const parties = formateur(fuseau).formatToParts(new Date(instant));
  const valeurs: Record<string, number> = {};
  for (const partie of parties) {
    if (partie.type !== 'literal') valeurs[partie.type] = Number(partie.value);
  }
  return Date.UTC(
    valeurs['year']!,
    valeurs['month']! - 1,
    valeurs['day']!,
    valeurs['hour']!,
    valeurs['minute']!,
    valeurs['second']!,
  );
}

/** Décalage du fuseau à cet instant, en minutes. */
export function offsetMinutes(fuseau: string, instant: number): number {
  return (murale(fuseau, instant) - instant) / MINUTE;
}

function formaterOffset(minutes: number): string {
  const signe = minutes >= 0 ? '+' : '-';
  const absolu = Math.abs(minutes);
  const heures = String(Math.floor(absolu / 60)).padStart(2, '0');
  const reste = String(absolu % 60).padStart(2, '0');
  return `${signe}${heures}:${reste}`;
}

/**
 * Instant ISO 8601 avec offset, à partir d'une heure murale locale.
 *
 * ⚠ Changement d'heure (§ pièges connus) :
 *  · heure inexistante (passage à l'heure d'été) — l'occurrence est **décalée**
 *    d'une heure, jamais perdue ;
 *  · heure doublée (passage à l'heure d'hiver) — la première occurrence est
 *    retenue, jamais les deux.
 */
export function instantLocal(jour: JourLocal, heure: string, fuseau: string): Instant {
  const [an, mois, date] = jour.split('-').map(Number) as [number, number, number];
  const [h, min] = heure.split(':').map(Number) as [number, number];
  const supposee = Date.UTC(an, mois - 1, date, h, min, 0);

  let instant = supposee - offsetMinutes(fuseau, supposee) * MINUTE;
  const correction = offsetMinutes(fuseau, instant);
  instant = supposee - correction * MINUTE;

  const offset = offsetMinutes(fuseau, instant);
  const reelle = murale(fuseau, instant);
  const iso = new Date(reelle).toISOString().slice(0, 19);
  return `${iso}${formaterOffset(offset)}`;
}

/** Écrit un instant absolu dans le fuseau demandé, offset inclus. */
export function instantDepuisEpoch(instant: number, fuseau: string): Instant {
  const offset = offsetMinutes(fuseau, instant);
  const iso = new Date(murale(fuseau, instant)).toISOString().slice(0, 19);
  return `${iso}${formaterOffset(offset)}`;
}
