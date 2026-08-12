/**
 * Décodage GS1 du Datamatrix des boîtes françaises (spec §13). Module pur.
 *
 * | AI   | Contenu                                                      |
 * |------|--------------------------------------------------------------|
 * | `01` | GTIN-14 — les 13 derniers chiffres sont le **CIP13** (`3400`) |
 * | `17` | Péremption `AAMMJJ`                                          |
 * | `10` | Lot                                                          |
 * | `21` | Numéro de série                                              |
 *
 * ⚠ §13 — **le numéro de série et le lot ne sont ni stockés ni transmis.**
 * Ils sont reconnus pour être correctement sautés, puis jetés : c'est ce que
 * fait `lireGs1`, qui ne les expose pas dans son résultat.
 */

/** Séparateur de champ des AI de longueur variable : FNC1, transcrit `<GS>`. */
const GS = '';

/** Longueur fixe des AI concernés ; absents de cette table = longueur variable. */
const LONGUEURS_FIXES: Readonly<Record<string, number>> = {
  '00': 18,
  '01': 14,
  '02': 14,
  '11': 6,
  '12': 6,
  '13': 6,
  '15': 6,
  '16': 6,
  '17': 6,
  '20': 2,
};

export interface CodeGs1 {
  /** CIP13 extrait du GTIN, `null` si le code n'en porte pas. */
  readonly cip13: string | null;
  /** Péremption ISO, `null` si absente ou illisible. */
  readonly peremption: string | null;
}

/**
 * Analyse une chaîne GS1 issue d'un Datamatrix.
 *
 * Tolère les trois écritures rencontrées : séparateur `<GS>` (0x1D), notation
 * parenthésée `(01)03400...`, et concaténation sans séparateur pour les AI de
 * longueur fixe.
 */
export function lireGs1(brut: string): CodeGs1 {
  const chaine = normaliser(brut);
  let position = 0;
  let cip13: string | null = null;
  let peremption: string | null = null;

  while (position < chaine.length) {
    const ai = chaine.slice(position, position + 2);
    if (!/^\d{2}$/.test(ai)) break;
    position += 2;

    const longueurFixe = LONGUEURS_FIXES[ai];
    let valeur: string;
    if (longueurFixe !== undefined) {
      valeur = chaine.slice(position, position + longueurFixe);
      position += longueurFixe;
      // Un séparateur peut suivre malgré tout : il est simplement consommé.
      if (chaine[position] === GS) position += 1;
    } else {
      const fin = chaine.indexOf(GS, position);
      valeur = chaine.slice(position, fin === -1 ? undefined : fin);
      position = fin === -1 ? chaine.length : fin + 1;
    }

    if (ai === '01') cip13 = cip13DepuisGtin(valeur);
    else if (ai === '17') peremption = peremptionIso(valeur);
    // Les AI 10 (lot) et 21 (numéro de série) sont lus pour être sautés
    // correctement, puis jetés : ils ne sont ni stockés ni transmis (§13).
  }

  return { cip13, peremption };
}

function normaliser(brut: string): string {
  return brut
    .trim()
    // Notation parenthésée de certains lecteurs : (01)0340094949729...
    .replace(/\((\d{2,4})\)/g, (_, ai: string) => ai)
    .replace(/␝|<GS>|/g, GS);
}

/**
 * GTIN-14 → CIP13. Le CIP13 français est un GTIN-13 préfixé `3400` ; le GTIN-14
 * ajoute un chiffre d'indicateur en tête.
 */
export function cip13DepuisGtin(gtin: string): string | null {
  const chiffres = gtin.replace(/\D/g, '');
  if (chiffres.length !== 14) return null;
  const cip13 = chiffres.slice(1);
  if (!cip13.startsWith('3400')) return null;
  return cleValide(cip13) ? cip13 : null;
}

/** Clé de contrôle GS1 (modulo 10 pondéré 3-1). */
function cleValide(code: string): boolean {
  const chiffres = [...code].map(Number);
  const cle = chiffres.pop()!;
  const somme = chiffres
    .reverse()
    .reduce((total, chiffre, index) => total + chiffre * (index % 2 === 0 ? 3 : 1), 0);
  return (10 - (somme % 10)) % 10 === cle;
}

/**
 * `AAMMJJ` → `AAAA-MM-JJ`. Un jour à `00` signifie « fin de mois » dans la
 * norme : la date retenue est le dernier jour du mois.
 */
export function peremptionIso(valeur: string): string | null {
  if (!/^\d{6}$/.test(valeur)) return null;
  const annee = 2000 + Number(valeur.slice(0, 2));
  const mois = Number(valeur.slice(2, 4));
  const jour = Number(valeur.slice(4, 6));
  if (mois < 1 || mois > 12) return null;

  const dernier = new Date(Date.UTC(annee, mois, 0)).getUTCDate();
  const quantieme = jour === 0 ? dernier : jour;
  if (quantieme > dernier) return null;
  return `${annee}-${String(mois).padStart(2, '0')}-${String(quantieme).padStart(2, '0')}`;
}
