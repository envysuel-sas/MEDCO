/**
 * Occurrences du pilulier — module pur (spec §9).
 *
 * Les plans **matérialisent** leurs occurrences plutôt que d'être recalculés
 * à la volée (§9.1) : le Worker doit connaître les horaires sans exécuter de
 * moteur de récurrence, l'historique reste exact si un plan change, et le
 * `.ics` se génère directement depuis la table.
 *
 * ⚠ Changement d'heure : l'heure **murale** est conservée (21:00 reste 21:00),
 * l'offset change. Ni doublon ni perte au passage — c'est ce que vérifie le
 * jeu doré.
 *
 * ⚠ R3 — `expiree` n'entraîne ni notification, ni badge, ni compteur (§9.3).
 * Aucun taux d'observance n'est calculé nulle part dans ce module.
 */

import {
  JOUR,
  ajouterJours,
  epoch,
  instantDepuisEpoch,
  instantLocal,
  jourLocal,
  jourSemaine,
} from './temps.js';
import type { Instant, JourLocal, Moment, Occurrence, Plan } from './types.js';

export interface OptionsGeneration {
  readonly fuseau: string;
  readonly debut: Instant;
  /** Borne exclue. Horizon J+60 en usage courant (§9.1). */
  readonly fin: Instant;
  readonly moments: ReadonlyMap<string, Moment>;
}

export interface OptionsRegeneration extends OptionsGeneration {
  readonly maintenant: Instant;
}

interface Recurrence {
  readonly freq: 'DAILY' | 'WEEKLY';
  readonly interval: number;
  readonly byday: readonly string[] | null;
  readonly count: number | null;
  readonly until: JourLocal | null;
  /** Extension `X-CYCLE=21/7` — voir `analyserRrule`. */
  readonly cycle: { readonly actifs: number; readonly pause: number } | null;
}

/**
 * Sous-ensemble de RRULE (RFC 5545) réellement utilisé : quotidien, jours de
 * semaine, cycles 21/7.
 *
 * ⚠ RFC 5545 **ne sait pas exprimer** un cycle 21 jours actifs / 7 jours
 * d'arrêt — ni `FREQ`, ni `INTERVAL`, ni `BYSETPOS` n'en rendent compte. La
 * pilule combinée en a pourtant besoin. L'extension `X-CYCLE=<actifs>/<pause>`
 * comble ce trou ; à l'export `.ics`, ces plans sont émis en `RDATE` explicites
 * plutôt qu'en `RRULE`, faute d'équivalent standard (§10.4).
 */
export function analyserRrule(rrule: string): Recurrence {
  const parties = new Map<string, string>();
  for (const morceau of rrule.split(';')) {
    const [cle, valeur] = morceau.split('=');
    if (cle && valeur) parties.set(cle.toUpperCase(), valeur);
  }

  const freq = parties.get('FREQ') === 'WEEKLY' ? 'WEEKLY' : 'DAILY';
  const byday = parties.get('BYDAY')?.split(',').map((j) => j.toUpperCase()) ?? null;
  const count = parties.has('COUNT') ? Number(parties.get('COUNT')) : null;
  const until = parties.get('UNTIL')?.slice(0, 8) ?? null;

  let cycle: Recurrence['cycle'] = null;
  const brut = parties.get('X-CYCLE');
  if (brut) {
    const [actifs, pause] = brut.split('/').map(Number);
    if (actifs && pause !== undefined) cycle = { actifs, pause };
  }

  return {
    freq,
    interval: Number(parties.get('INTERVAL') ?? 1) || 1,
    byday,
    count,
    until: until ? `${until.slice(0, 4)}-${until.slice(4, 6)}-${until.slice(6, 8)}` : null,
    cycle,
  };
}

/** Occurrences d'un plan sur une période. Identifiants déterministes. */
export function genererOccurrences(plan: Plan, options: OptionsGeneration): Occurrence[] {
  if (plan.mode === 'intervalle') return parIntervalle(plan, options);

  const recurrence = analyserRrule(plan.rrule);
  const heures = heuresDuPlan(plan, options);
  if (heures.length === 0) return [];

  const premierJour = jourLocal(maxInstant(plan.debut, options.debut));
  const dernierJour = jourLocal(options.fin);
  const finPlan = plan.fin ? jourLocal(plan.fin) : null;
  const depart = jourLocal(plan.debut);

  const occurrences: Occurrence[] = [];
  let rang = 0;

  // La borne de fin est exclue à l'instant près, pas à la journée : un plan
  // du soir et une fin en milieu de journée ne se recouvrent pas.
  for (let jour = premierJour; jour <= dernierJour; jour = ajouterJours(jour, 1)) {
    if (finPlan && jour > finPlan) break;
    if (recurrence.until && jour > recurrence.until) break;
    if (!jourRetenu(jour, depart, recurrence)) continue;
    if (recurrence.count !== null && rang >= recurrence.count) break;
    rang += 1;

    for (const { heure, momentId } of heures) {
      const prevueLe = instantLocal(jour, heure, options.fuseau);
      if (epoch(prevueLe) >= epoch(options.fin)) continue;
      occurrences.push(creer(plan, prevueLe, momentId));
    }
  }

  return trier(dedupliquer(occurrences));
}

function jourRetenu(jour: JourLocal, depart: JourLocal, recurrence: Recurrence): boolean {
  const rang = Math.round(
    (Date.parse(`${jour}T00:00:00Z`) - Date.parse(`${depart}T00:00:00Z`)) / JOUR,
  );

  if (recurrence.cycle) {
    const periode = recurrence.cycle.actifs + recurrence.cycle.pause;
    if (rang % periode >= recurrence.cycle.actifs) return false;
  }

  if (recurrence.freq === 'WEEKLY') {
    if (recurrence.byday && !recurrence.byday.includes(jourSemaine(jour))) return false;
    const semaines = Math.floor(rang / 7);
    return semaines % recurrence.interval === 0;
  }

  if (recurrence.byday && !recurrence.byday.includes(jourSemaine(jour))) return false;
  return rang % recurrence.interval === 0;
}

function heuresDuPlan(
  plan: Plan,
  options: OptionsGeneration,
): { heure: string; momentId: string | null }[] {
  if (plan.mode === 'moments') {
    return (plan.moments ?? [])
      .map((id) => {
        const moment = options.moments.get(id);
        return moment ? { heure: moment.heure, momentId: id } : null;
      })
      .filter((entree): entree is { heure: string; momentId: string } => entree !== null)
      .sort((a, b) => a.heure.localeCompare(b.heure));
  }
  return (plan.heures ?? []).map((heure) => ({ heure, momentId: null }));
}

/** Mode `intervalle` : toutes les N heures depuis le début du plan (§9.2). */
function parIntervalle(plan: Plan, options: OptionsGeneration): Occurrence[] {
  const pas = (plan.intervalleH ?? 0) * 3_600_000;
  if (pas <= 0) return [];

  const debut = epoch(maxInstant(plan.debut, options.debut));
  const fin = Math.min(epoch(options.fin), plan.fin ? epoch(plan.fin) : Number.POSITIVE_INFINITY);
  const origine = epoch(plan.debut);

  const occurrences: Occurrence[] = [];
  const premier = Math.max(0, Math.ceil((debut - origine) / pas));
  for (let index = premier; ; index += 1) {
    const instant = origine + index * pas;
    if (instant >= fin) break;
    // L'intervalle est une durée **absolue** : le décalage horaire ne le
    // déplace pas. Seule l'écriture de l'instant suit le fuseau du profil.
    occurrences.push(creer(plan, instantDepuisEpoch(instant, options.fuseau), null));
  }
  return trier(occurrences);
}

function creer(plan: Plan, prevueLe: Instant, momentId: string | null): Occurrence {
  return {
    // Déterministe : régénérer un plan inchangé ne crée aucun doublon.
    id: `${plan.id}@${prevueLe}${momentId ? `#${momentId}` : ''}`,
    planId: plan.id,
    profilId: plan.profilId,
    prevueLe,
    momentId,
    dose: plan.dose,
    statut: 'attendue',
    priseId: null,
  };
}

function dedupliquer(occurrences: readonly Occurrence[]): Occurrence[] {
  const parId = new Map<string, Occurrence>();
  for (const occurrence of occurrences) parId.set(occurrence.id, occurrence);
  return [...parId.values()];
}

function trier(occurrences: Occurrence[]): Occurrence[] {
  return occurrences.sort((a, b) => epoch(a.prevueLe) - epoch(b.prevueLe));
}

function maxInstant(a: Instant, b: Instant): Instant {
  return epoch(a) >= epoch(b) ? a : b;
}

/**
 * Régénération après modification d'un plan (§9.1) : **le passé est
 * intouchable**, seules les occurrences à venir sont remplacées.
 */
export function regenerer(
  existantes: readonly Occurrence[],
  plan: Plan,
  options: OptionsRegeneration,
): Occurrence[] {
  const seuil = epoch(options.maintenant);
  const passees = existantes.filter((o) => epoch(o.prevueLe) < seuil);
  const futures = genererOccurrences(plan, options).filter((o) => epoch(o.prevueLe) >= seuil);

  // Une occurrence future déjà validée le reste : l'utilisateur a agi.
  const validees = new Map(
    existantes
      .filter((o) => epoch(o.prevueLe) >= seuil && o.statut !== 'attendue')
      .map((o) => [o.id, o]),
  );

  return trier([...passees, ...futures.map((o) => validees.get(o.id) ?? o)]);
}

/**
 * Passage à `expiree` d'une occurrence sans action à J+1 (§9.3).
 * Aucune notification, aucun badge, aucun compteur.
 */
export function expirer(occurrences: readonly Occurrence[], maintenant: Instant): Occurrence[] {
  const seuil = epoch(maintenant) - JOUR;
  return occurrences.map((occurrence) =>
    occurrence.statut === 'attendue' && epoch(occurrence.prevueLe) < seuil
      ? { ...occurrence, statut: 'expiree' as const }
      : occurrence,
  );
}
