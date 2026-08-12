/**
 * Relevé de consommation (spec §14.1).
 *
 * Généré localement, imprimé par le navigateur vers un PDF. Aucune donnée ne
 * sort de l'appareil.
 *
 * ⚠ R3 — **aucune conclusion, aucune mise en regard d'un seuil dans la
 * synthèse.** Des chiffres, une période, une méthode. Le document est destiné
 * à une consultation : c'est le professionnel qui interprète, pas l'app.
 */

import { cumulParSubstance, joursDePrise } from '../domain/cumul.js';
import { jourLocal } from '../domain/temps.js';
import type { Instant, PriseAvecSubstances, Produit } from '../domain/types.js';

export interface ContexteReleve {
  readonly profil: string;
  readonly debut: Instant;
  readonly fin: Instant;
  readonly prises: readonly PriseAvecSubstances[];
  readonly produits: readonly Produit[];
  readonly nomsSubstances: ReadonlyMap<string, string>;
  readonly dateBdpm: string;
  readonly versionRegles: string;
  readonly avecDetail: boolean;
}

export function genererReleve(contexte: ContexteReleve): string {
  const cumul = cumulParSubstance(contexte.prises, { debut: contexte.debut, fin: contexte.fin });

  const parSubstance = [...cumul.entries()]
    .map(([code, total]) => {
      const concernees = contexte.prises.filter(
        (prise) => prise.statut === 'prise' && prise.substances.some((s) => s.code === code),
      );
      const parJour = new Map<string, number>();
      for (const prise of concernees) {
        const jour = jourLocal(prise.horodatage);
        const quantite = prise.substances.find((s) => s.code === code)?.quantiteMg ?? 0;
        parJour.set(jour, (parJour.get(jour) ?? 0) + quantite);
      }
      return {
        nom: contexte.nomsSubstances.get(code) ?? code,
        jours: joursDePrise(concernees).size,
        total: total.mg,
        maximumJournalier: Math.max(0, ...parJour.values()),
      };
    })
    .sort((a, b) => b.total - a.total);

  const periode = `${formaterDate(contexte.debut)} au ${formaterDate(contexte.fin)}`;

  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>Relevé de consommation</title>
<style>
  @page { margin: 18mm 14mm; }
  body { font: 11pt/1.5 system-ui, sans-serif; color: #0F2E3D; }
  h1 { font-size: 16pt; margin: 0 0 2mm; }
  h2 { font-size: 11pt; text-transform: uppercase; letter-spacing: .08em; margin: 8mm 0 2mm; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 1.5mm 0; border-bottom: .3pt solid #D8E4EB; }
  td.n, th.n { text-align: right; font-variant-numeric: tabular-nums; }
  footer { margin-top: 10mm; font-size: 8pt; color: #56737F; }
</style></head><body>
<h1>Relevé de consommation</h1>
<p>${echapper(contexte.profil)} · ${periode}</p>

<h2>1. Synthèse par substance active</h2>
<table><thead><tr>
  <th>Substance</th><th class="n">Jours de prise</th>
  <th class="n">Quantité totale</th><th class="n">Maximum journalier</th>
</tr></thead><tbody>
${parSubstance
  .map(
    (ligne) => `<tr><td>${echapper(ligne.nom)}</td><td class="n">${ligne.jours}</td>
  <td class="n">${formaterMg(ligne.total)}</td><td class="n">${formaterMg(ligne.maximumJournalier)}</td></tr>`,
  )
  .join('\n')}
</tbody></table>

<h2>2. Produits enregistrés</h2>
<table><thead><tr><th>Nom</th><th>CIS</th><th>Mode</th></tr></thead><tbody>
${contexte.produits
  .map(
    (produit) =>
      `<tr><td>${echapper(produit.nomAffiche)}</td><td>${produit.cis ?? '—'}</td>
       <td>${produit.mode === 'prescrit' ? 'prescrit' : 'libre'}</td></tr>`,
  )
  .join('\n')}
</tbody></table>

${contexte.avecDetail ? detail(contexte) : ''}

<footer>
  Données déclaratives saisies par l'utilisateur, non vérifiées.<br>
  Référentiel BDPM du ${formaterDate(contexte.dateBdpm)}. Règles version ${echapper(contexte.versionRegles)}.
</footer>
</body></html>`;
}

function detail(contexte: ContexteReleve): string {
  const parId = new Map(contexte.produits.map((produit) => [produit.id, produit]));
  return `<h2>3. Détail des prises</h2>
<table><thead><tr><th>Date et heure</th><th>Produit</th><th class="n">Dose</th></tr></thead><tbody>
${contexte.prises
  .filter((prise) => prise.statut === 'prise')
  .map(
    (prise) =>
      `<tr><td>${prise.horodatage.slice(0, 16).replace('T', ' ')}</td>
       <td>${echapper(parId.get(prise.produitId)?.nomAffiche ?? '—')}</td>
       <td class="n">${prise.dose}</td></tr>`,
  )
  .join('\n')}
</tbody></table>`;
}

function formaterMg(mg: number): string {
  return `${new Intl.NumberFormat('fr-FR').format(Math.round(mg))} mg`;
}

function formaterDate(valeur: string): string {
  return new Date(valeur).toLocaleDateString('fr-FR');
}

function echapper(valeur: string): string {
  return valeur
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Ouvre la boîte d'impression du navigateur sur le relevé. */
export function imprimer(html: string): void {
  const cadre = document.createElement('iframe');
  cadre.style.position = 'fixed';
  cadre.style.right = '100%';
  document.body.append(cadre);
  const document_ = cadre.contentDocument;
  if (!document_) return;
  document_.open();
  document_.write(html);
  document_.close();
  cadre.contentWindow?.focus();
  cadre.contentWindow?.print();
  setTimeout(() => cadre.remove(), 1000);
}
