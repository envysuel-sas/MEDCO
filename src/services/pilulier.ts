/**
 * Matérialisation des occurrences (spec §9.1).
 *
 * Les plans génèrent des lignes en base plutôt que d'être recalculés à la
 * volée : le Worker doit connaître les horaires sans exécuter de moteur de
 * récurrence, l'historique reste exact si un plan change, et le calendrier
 * `.ics` se génère directement depuis la table.
 *
 *     Horizon      J+60
 *     Régénération à la création ou modification d'un plan, puis à chaque
 *                  ouverture de l'application
 *     Modification occurrences futures régénérées, **passé intact**
 */

import { regenerer } from '../domain/occurrences.js';
import { JOUR, epoch } from '../domain/temps.js';
import type { Instant, Moment, Plan } from '../domain/types.js';
import { baseDeDonnees } from '../db/client.js';

export const HORIZON_JOURS = 60;

export function horizon(maintenant: Instant): Instant {
  return new Date(epoch(maintenant) + HORIZON_JOURS * JOUR).toISOString();
}

/** Régénère un plan : le passé n'est jamais touché. */
export async function regenererPlan(
  plan: Plan,
  moments: ReadonlyMap<string, Moment>,
  maintenant: Instant,
  fuseau: string,
): Promise<void> {
  const existantes = await baseDeDonnees.occurrencesDuPlan(plan.id);
  const occurrences = regenerer(existantes, plan, {
    fuseau,
    debut: plan.debut,
    fin: horizon(maintenant),
    moments,
    maintenant,
  });
  await baseDeDonnees.remplacerOccurrences(plan.id, occurrences);
}

/**
 * Régénération complète à l'ouverture, puis expiration des occurrences non
 * traitées à J+1 — sans notification, sans badge, sans compteur (§9.3).
 */
export async function regenererTout(
  profilId: string,
  maintenant: Instant,
  fuseau: string,
): Promise<void> {
  const [plans, moments] = await Promise.all([
    baseDeDonnees.plansDuProfil(profilId),
    baseDeDonnees.momentsDuProfil(profilId),
  ]);
  const table = new Map(moments as unknown as [string, Moment][]);

  for (const plan of plans) {
    await regenererPlan(plan, table, maintenant, fuseau);
  }
  await baseDeDonnees.expirerOccurrences(
    profilId,
    new Date(epoch(maintenant) - JOUR).toISOString(),
  );
}
