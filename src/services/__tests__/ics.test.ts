/**
 * Calendrier — spec §10.4 et §16.2.
 *
 * Le risque tenu ici est celui du tableau §19.B : « doublons d'alarmes après
 * réimport `.ics` », gravité élevée, probabilité élevée. La déduplication
 * repose sur `UID` + `SEQUENCE` ; ces tests vérifient que les deux sont
 * corrects et stables.
 */

import { describe, expect, it } from 'vitest';

import { genererIcs, vtimezone } from '../ics.js';
import { genererOccurrences } from '../../domain/occurrences.js';
import type { Plan } from '../../domain/types.js';

const PARIS = 'Europe/Paris';
const OPTIONS = { domaine: 'medco.example', fuseau: PARIS, maintenant: '2026-08-12T10:00:00+02:00' };

const plan = (partiel: Partial<Plan> = {}): Plan => ({
  id: '0f8a1c2e-4b6d-4f2a-9c31-7a5e8d0b1234',
  produitId: 'prod-1',
  profilId: 'p1',
  mode: 'heures',
  rrule: 'FREQ=DAILY',
  moments: null,
  heures: ['21:00'],
  intervalleH: null,
  dose: 1,
  debut: '2026-08-01T00:00:00+02:00',
  fin: null,
  rappel: true,
  ...partiel,
});

function occurrencesDe(unPlan: Plan, fin = '2026-10-01T00:00:00+02:00') {
  return genererOccurrences(unPlan, {
    fuseau: PARIS,
    debut: unPlan.debut,
    fin,
    moments: new Map(),
  });
}

function lignes(ics: string): string[] {
  // Défait le pliage RFC 5545 avant toute vérification.
  return ics.split('\r\n').reduce<string[]>((accumulateur, ligne) => {
    if (ligne.startsWith(' ') && accumulateur.length > 0) {
      accumulateur[accumulateur.length - 1] += ligne.slice(1);
      return accumulateur;
    }
    accumulateur.push(ligne);
    return accumulateur;
  }, []);
}

describe('génération du calendrier', () => {
  const unPlan = plan();
  const ics = genererIcs([{ plan: unPlan, sequence: 0, occurrences: occurrencesDe(unPlan) }], OPTIONS);

  it('produit un VCALENDAR complet, terminé par CRLF', () => {
    expect(lignes(ics)[0]).toBe('BEGIN:VCALENDAR');
    expect(ics.endsWith('\r\n')).toBe(true);
    expect(lignes(ics)).toContain('END:VCALENDAR');
  });

  it('porte un UID stable et un SEQUENCE — la déduplication en dépend', () => {
    expect(lignes(ics)).toContain('UID:medco-0f8a1c2e-4b6d-4f2a-9c31-7a5e8d0b1234@medco.example');
    expect(lignes(ics)).toContain('SEQUENCE:0');

    const modifie = genererIcs(
      [{ plan: unPlan, sequence: 3, occurrences: occurrencesDe(unPlan) }],
      OPTIONS,
    );
    expect(lignes(modifie)).toContain('UID:medco-0f8a1c2e-4b6d-4f2a-9c31-7a5e8d0b1234@medco.example');
    expect(lignes(modifie)).toContain('SEQUENCE:3');
  });

  it('ne nomme jamais le médicament — l’agenda peut être partagé', () => {
    expect(lignes(ics).filter((l) => l.startsWith('SUMMARY:'))).toEqual(['SUMMARY:Rappel']);
    expect(lignes(ics).filter((l) => l.startsWith('DESCRIPTION:'))).toEqual([
      'DESCRIPTION:Rappel',
      'DESCRIPTION:Rappel',
    ]);
    // Le seul identifiant publié est l'UUID du plan : rien d'autre du carnet
    // ne doit apparaître dans le fichier.
    expect(ics).not.toMatch(/doliprane|contracept|paracétamol/i);
  });

  it('pose une alarme à l’heure, et une seule relance à +15 min (§10.5)', () => {
    const declencheurs = lignes(ics).filter((l) => l.startsWith('TRIGGER:'));
    expect(declencheurs).toEqual(['TRIGGER:PT0M', 'TRIGGER:PT15M']);
  });

  it('n’émet aucune alarme quand le rappel est désactivé', () => {
    const sansRappel = plan({ rappel: false });
    const sortie = genererIcs(
      [{ plan: sansRappel, sequence: 0, occurrences: occurrencesDe(sansRappel) }],
      OPTIONS,
    );
    expect(sortie).not.toContain('BEGIN:VALARM');
  });

  it('exprime un plan quotidien simple en RRULE, avec son fuseau', () => {
    expect(lignes(ics)).toContain('DTSTART;TZID=Europe/Paris:20260801T210000');
    expect(lignes(ics)).toContain('RRULE:FREQ=DAILY');
  });

  it('n’émet aucun événement pour un plan sans occurrence', () => {
    const sortie = genererIcs([{ plan: unPlan, sequence: 0, occurrences: [] }], OPTIONS);
    expect(sortie).not.toContain('BEGIN:VEVENT');
  });
});

describe('cycle 21/7 — RFC 5545 ne sait pas l’exprimer', () => {
  const cyclique = plan({ id: '11111111-2222-4333-8444-555555555555', rrule: 'FREQ=DAILY;X-CYCLE=21/7' });
  const occurrences = occurrencesDe(cyclique, '2026-09-26T00:00:00+02:00');
  const ics = genererIcs([{ plan: cyclique, sequence: 1, occurrences }], OPTIONS);

  it('émet les dates une à une plutôt qu’une récurrence fausse', () => {
    expect(ics).not.toContain('RRULE:FREQ=DAILY;X-CYCLE');
    expect(ics).not.toMatch(/^RRULE:/m);
    const rdate = lignes(ics).find((l) => l.startsWith('RDATE:'));
    expect(rdate).toBeDefined();
    expect(rdate!.split(',')).toHaveLength(occurrences.length - 1);
  });

  it('interrompt bien le cycle', () => {
    const rdate = lignes(ics).find((l) => l.startsWith('RDATE:'))!;
    expect(rdate).toContain('20260821'); // 21e jour
    expect(rdate).not.toContain('20260822'); // premier jour d'arrêt
    expect(rdate).toContain('20260829'); // reprise
  });

  it('n’expose jamais l’extension propriétaire dans le fichier publié', () => {
    expect(ics).not.toContain('X-CYCLE');
  });
});

describe('changement d’heure', () => {
  it('dérive le VTIMEZONE du fuseau, sans règle écrite en dur', () => {
    const bloc = vtimezone(PARIS, 2026);
    expect(bloc).toContain('TZID:Europe/Paris');
    expect(bloc).toContain('BEGIN:DAYLIGHT');
    expect(bloc).toContain('BEGIN:STANDARD');
    // Europe/Paris : dernier dimanche de mars, dernier dimanche d'octobre.
    expect(bloc).toContain('RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU');
    expect(bloc).toContain('RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU');
    expect(bloc).toContain('TZOFFSETFROM:+0100');
    expect(bloc).toContain('TZOFFSETTO:+0200');
  });

  it('reste correct pour un fuseau sans heure d’été', () => {
    const bloc = vtimezone('Africa/Abidjan', 2026);
    expect(bloc).toContain('TZID:Africa/Abidjan');
    expect(bloc).not.toContain('BEGIN:DAYLIGHT');
    expect(bloc).toContain('TZOFFSETTO:+0000');
  });

  it('garde 21:00 des deux côtés du passage à l’heure d’hiver', () => {
    const automne = plan({ id: '99999999-8888-4777-8666-555555555555', debut: '2026-10-20T00:00:00+02:00' });
    const occurrences = genererOccurrences(automne, {
      fuseau: PARIS,
      debut: automne.debut,
      fin: '2026-11-05T00:00:00+01:00',
      moments: new Map(),
    });
    const ics = genererIcs(
      [{ plan: { ...automne, rrule: 'FREQ=DAILY;X-CYCLE=99/1' }, sequence: 0, occurrences }],
      { ...OPTIONS, maintenant: '2026-10-20T10:00:00+02:00' },
    );
    // En RDATE, chaque instant est absolu : 21:00 locale devient 19:00Z puis 20:00Z.
    const rdate = lignes(ics).find((l) => l.startsWith('RDATE:'))!;
    expect(rdate).toContain('20261024T190000Z');
    expect(rdate).toContain('20261026T200000Z');
    // Ni doublon ni perte au passage.
    const dates = new Set(rdate.slice('RDATE:'.length).split(','));
    expect(dates.size).toBe(rdate.slice('RDATE:'.length).split(',').length);
  });
});

describe('format', () => {
  it('plie les lignes à 75 octets comme l’exige la RFC 5545', () => {
    const cyclique = plan({ rrule: 'FREQ=DAILY;X-CYCLE=21/7' });
    const ics = genererIcs(
      [{ plan: cyclique, sequence: 0, occurrences: occurrencesDe(cyclique) }],
      OPTIONS,
    );
    for (const ligne of ics.split('\r\n')) {
      expect(ligne.length).toBeLessThanOrEqual(75);
    }
  });

  it('échappe les caractères réservés du nom de calendrier', () => {
    const unPlan = plan();
    const ics = genererIcs([{ plan: unPlan, sequence: 0, occurrences: occurrencesDe(unPlan) }], {
      ...OPTIONS,
      nomCalendrier: 'Medco; rappels, perso',
    });
    expect(lignes(ics)).toContain('X-WR-CALNAME:Medco\\; rappels\\, perso');
  });
});
