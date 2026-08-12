/**
 * Génération du calendrier (spec §10.4). Module pur.
 *
 * La couche calendrier est la **garantie** du dispositif de rappel (§10.2) :
 * l'alarme est gérée par le système, indépendamment du réseau, du Worker et de
 * l'application. Une pilule contraceptive en dépend.
 *
 * ⚠ Piège de la réimportation. La déduplication repose sur `UID` + `SEQUENCE`.
 * Apple Calendar gère correctement, Google Agenda beaucoup moins et produit des
 * alarmes en double — d'où l'abonnement `webcal://` sur iOS et un avertissement
 * explicite sur Android avant tout nouvel import.
 *
 * ⚠ `SUMMARY` reste neutre : l'entrée est visible par toute personne à qui
 * l'utilisateur partage son agenda. Jamais de nom de médicament.
 *
 * ⚠ Heure d'été. Un rappel de 21:00 doit rester à 21:00 des deux côtés du
 * changement d'heure. Deux écritures possibles :
 *   · `DTSTART;TZID=` + `RRULE` — compact, se prolonge au-delà de l'horizon,
 *     mais exige un bloc `VTIMEZONE` correct. Il est **dérivé** du fuseau IANA,
 *     jamais écrit en dur pour un seul pays ;
 *   · `RDATE` en UTC — exact par construction, employé quand la récurrence
 *     n'est pas exprimable en RFC 5545 (cycle 21/7, §9.2).
 */

import { analyserRrule } from '../domain/occurrences.js';
import { instantDepuisEpoch, offsetMinutes } from '../domain/temps.js';
import type { Instant, Occurrence, Plan } from '../domain/types.js';

const PLIAGE = 75; // RFC 5545 §3.1 : lignes de 75 octets au plus
const SUMMARY_NEUTRE = 'Rappel';

export interface OptionsIcs {
  /**
   * Domaine des `UID`. Il doit rester **stable dans le temps** : c'est lui,
   * avec l'identifiant de plan, qui permet à un agenda de reconnaître un
   * événement déjà importé plutôt que d'en créer un second (§10.4). Le changer
   * dupliquerait toutes les alarmes existantes.
   */
  readonly domaine: string;
  readonly fuseau: string;
  /** Injecté : le module ne lit jamais l'horloge. */
  readonly maintenant: Instant;
  readonly nomCalendrier?: string;
}

export interface EntreeIcs {
  readonly plan: Plan;
  readonly sequence: number;
  readonly occurrences: readonly Occurrence[];
}

export function genererIcs(entrees: readonly EntreeIcs[], options: OptionsIcs): string {
  const lignes: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Medco//Rappels//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${echapper(options.nomCalendrier ?? 'Medco')}`,
    // Resynchronisation horaire des abonnements webcal (iOS).
    'X-PUBLISHED-TTL:PT1H',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
  ];

  if (entrees.some((entree) => estExprimableEnRrule(entree.plan))) {
    lignes.push(...vtimezone(options.fuseau, anneeDe(options.maintenant)));
  }

  for (const entree of entrees) {
    lignes.push(...vevent(entree, options));
  }

  lignes.push('END:VCALENDAR');
  return lignes.flatMap(plier).join('\r\n') + '\r\n';
}

function vevent(entree: EntreeIcs, options: OptionsIcs): string[] {
  const { plan, sequence, occurrences } = entree;
  const futures = occurrences.filter((o) => o.statut !== 'sautee');
  const premiere = futures[0];
  if (!premiere) return [];

  const lignes = [
    'BEGIN:VEVENT',
    // Stable : c'est lui qui permet la mise à jour plutôt que le doublon.
    `UID:medco-${plan.id}@${options.domaine}`,
    `SEQUENCE:${sequence}`,
    `DTSTAMP:${enUtc(options.maintenant)}`,
    `SUMMARY:${SUMMARY_NEUTRE}`,
    'TRANSP:TRANSPARENT',
  ];

  if (estExprimableEnRrule(plan)) {
    lignes.push(
      `DTSTART;TZID=${options.fuseau}:${enLocal(premiere.prevueLe)}`,
      `DURATION:PT0S`,
      `RRULE:${rruleNormalisee(plan.rrule)}`,
    );
  } else {
    // Cycle 21/7 : RFC 5545 ne sait pas l'exprimer. Les dates sont émises
    // une à une, en UTC — exact au changement d'heure par construction.
    lignes.push(`DTSTART:${enUtc(premiere.prevueLe)}`, 'DURATION:PT0S');
    const suivantes = futures.slice(1);
    if (suivantes.length > 0) {
      lignes.push(`RDATE:${suivantes.map((o) => enUtc(o.prevueLe)).join(',')}`);
    }
  }

  if (plan.rappel) {
    lignes.push('BEGIN:VALARM', 'TRIGGER:PT0M', 'ACTION:DISPLAY', `DESCRIPTION:${SUMMARY_NEUTRE}`, 'END:VALARM');
    // §10.5 — une seule relance à +15 min, puis silence.
    lignes.push(
      'BEGIN:VALARM',
      'TRIGGER:PT15M',
      'ACTION:DISPLAY',
      `DESCRIPTION:${SUMMARY_NEUTRE}`,
      'END:VALARM',
    );
  }

  lignes.push('END:VEVENT');
  return lignes;
}

function estExprimableEnRrule(plan: Plan): boolean {
  if (plan.mode === 'intervalle') return false;
  const recurrence = analyserRrule(plan.rrule);
  // Un plan à plusieurs heures produit plusieurs séries : traité en RDATE.
  const heures = plan.mode === 'moments' ? (plan.moments ?? []) : (plan.heures ?? []);
  return recurrence.cycle === null && heures.length <= 1;
}

function rruleNormalisee(rrule: string): string {
  return rrule
    .split(';')
    .filter((morceau) => !morceau.toUpperCase().startsWith('X-'))
    .join(';');
}

// ---------------------------------------------------------------------------
// VTIMEZONE dérivé du fuseau IANA
// ---------------------------------------------------------------------------

/**
 * Bloc `VTIMEZONE` construit à partir des transitions réelles du fuseau.
 *
 * Aucune règle n'est écrite en dur : les deux bascules de l'année sont
 * trouvées par recherche dichotomique sur le décalage, puis exprimées en
 * `RRULE` annuelle (« dernier dimanche de mars »).
 */
export function vtimezone(fuseau: string, annee: number): string[] {
  const transitions = transitionsDe(fuseau, annee);
  const lignes = ['BEGIN:VTIMEZONE', `TZID:${fuseau}`];

  if (transitions.length === 0) {
    // Fuseau sans heure d'été : un seul bloc, décalage constant.
    const decalage = offsetMinutes(fuseau, Date.UTC(annee, 0, 1));
    lignes.push(
      'BEGIN:STANDARD',
      `DTSTART:${annee}0101T000000`,
      `TZOFFSETFROM:${formaterOffset(decalage)}`,
      `TZOFFSETTO:${formaterOffset(decalage)}`,
      'TZNAME:STD',
      'END:STANDARD',
    );
  }

  for (const transition of transitions) {
    const estEte = transition.vers > transition.depuis;
    lignes.push(
      estEte ? 'BEGIN:DAYLIGHT' : 'BEGIN:STANDARD',
      `DTSTART:${transition.debutLocal}`,
      `TZOFFSETFROM:${formaterOffset(transition.depuis)}`,
      `TZOFFSETTO:${formaterOffset(transition.vers)}`,
      `RRULE:FREQ=YEARLY;BYMONTH=${transition.mois};BYDAY=${transition.jourDeSemaine}`,
      `TZNAME:${estEte ? 'DST' : 'STD'}`,
      estEte ? 'END:DAYLIGHT' : 'END:STANDARD',
    );
  }

  lignes.push('END:VTIMEZONE');
  return lignes;
}

interface Transition {
  readonly depuis: number;
  readonly vers: number;
  readonly debutLocal: string;
  readonly mois: number;
  /** `-1SU`, `2SU`… au sens RFC 5545. */
  readonly jourDeSemaine: string;
}

function transitionsDe(fuseau: string, annee: number): Transition[] {
  const transitions: Transition[] = [];
  const debut = Date.UTC(annee, 0, 1);
  const fin = Date.UTC(annee + 1, 0, 1);
  const PAS = 86_400_000;

  let precedent = offsetMinutes(fuseau, debut);
  for (let instant = debut + PAS; instant < fin; instant += PAS) {
    const courant = offsetMinutes(fuseau, instant);
    if (courant === precedent) continue;

    // Le jour du changement est connu : on cherche l'instant à la minute.
    let bas = instant - PAS;
    let haut = instant;
    while (haut - bas > 60_000) {
      const milieu = bas + Math.floor((haut - bas) / 2 / 60_000) * 60_000;
      if (milieu === bas) break;
      if (offsetMinutes(fuseau, milieu) === precedent) bas = milieu;
      else haut = milieu;
    }

    transitions.push({
      depuis: precedent,
      vers: courant,
      debutLocal: enLocal(instantDepuisEpoch(haut, fuseau)),
      mois: new Date(haut).getUTCMonth() + 1,
      jourDeSemaine: rangDansLeMois(haut),
    });
    precedent = courant;
  }
  return transitions;
}

const JOURS_RFC = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;

function rangDansLeMois(instant: number): string {
  const date = new Date(instant);
  const jour = JOURS_RFC[date.getUTCDay()]!;
  const quantieme = date.getUTCDate();
  const dernierDuMois = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  // « Dernier dimanche » plutôt que « 5e dimanche » : c'est la formulation
  // employée par les règles de fuseau, et la seule stable d'une année à l'autre.
  return quantieme + 7 > dernierDuMois ? `-1${jour}` : `${Math.ceil(quantieme / 7)}${jour}`;
}

function formaterOffset(minutes: number): string {
  const signe = minutes >= 0 ? '+' : '-';
  const absolu = Math.abs(minutes);
  return `${signe}${String(Math.floor(absolu / 60)).padStart(2, '0')}${String(absolu % 60).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Formats
// ---------------------------------------------------------------------------

function enUtc(instant: Instant): string {
  return new Date(instant).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** Heure locale sans indicateur de fuseau : elle est portée par `TZID`. */
function enLocal(instant: Instant): string {
  return `${instant.slice(0, 10).replace(/-/g, '')}T${instant.slice(11, 19).replace(/:/g, '')}`;
}

function anneeDe(instant: Instant): number {
  return Number(instant.slice(0, 4));
}

function echapper(valeur: string): string {
  return valeur.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

/** Pliage RFC 5545 : 75 octets, continuation précédée d'une espace. */
function plier(ligne: string): string[] {
  if (ligne.length <= PLIAGE) return [ligne];
  const morceaux = [ligne.slice(0, PLIAGE)];
  for (let index = PLIAGE; index < ligne.length; index += PLIAGE - 1) {
    morceaux.push(` ${ligne.slice(index, index + PLIAGE - 1)}`);
  }
  return morceaux;
}
