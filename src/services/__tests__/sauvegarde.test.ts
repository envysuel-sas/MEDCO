/**
 * Sauvegarde chiffrée (spec §14.2).
 *
 * Le risque tenu ici est celui de §19.B : « perte de phrase de passe »,
 * probabilité élevée. Ces tests vérifient qu'aucune porte dérobée n'existe —
 * c'est une propriété, pas un défaut.
 */

import { describe, expect, it } from 'vitest';

import { chiffrerArchive, dechiffrerArchive } from '../sauvegarde.js';

const CONTENU = new TextEncoder().encode('contenu de carnet, opaque pour ce test');
const PHRASE = 'phrase de passe correcte';

describe('archive chiffrée', () => {
  it('fait un aller-retour fidèle', async () => {
    const archive = await chiffrerArchive(CONTENU, PHRASE, '2026-08-12T10:00:00+02:00');
    expect(archive.nom).toBe('medco-2026-08-12.medco');
    const rendu = await dechiffrerArchive(archive.octets, PHRASE);
    expect(new TextDecoder().decode(rendu)).toBe(new TextDecoder().decode(CONTENU));
  });

  it('ne laisse aucun fragment lisible dans le fichier', async () => {
    const archive = await chiffrerArchive(CONTENU, PHRASE, '2026-08-12T10:00:00+02:00');
    expect(new TextDecoder().decode(archive.octets)).not.toContain('carnet');
  });

  it('produit deux fichiers différents pour un même contenu — sel et vecteur aléatoires', async () => {
    const premiere = await chiffrerArchive(CONTENU, PHRASE, '2026-08-12T10:00:00+02:00');
    const seconde = await chiffrerArchive(CONTENU, PHRASE, '2026-08-12T10:00:00+02:00');
    expect(premiere.octets).not.toEqual(seconde.octets);
  });

  it('refuse une phrase de passe fausse, sans dire pourquoi', async () => {
    const archive = await chiffrerArchive(CONTENU, PHRASE, '2026-08-12T10:00:00+02:00');
    await expect(dechiffrerArchive(archive.octets, 'phrase de passe fausse')).rejects.toThrow(
      /incorrecte, ou archive altérée/,
    );
  });

  it('détecte une archive altérée', async () => {
    const archive = await chiffrerArchive(CONTENU, PHRASE, '2026-08-12T10:00:00+02:00');
    const abimee = new Uint8Array(archive.octets);
    abimee[abimee.length - 1] = (abimee[abimee.length - 1]! + 1) % 256;
    await expect(dechiffrerArchive(abimee, PHRASE)).rejects.toThrow();
  });

  it('rejette un fichier qui n’est pas une archive Medco', async () => {
    await expect(dechiffrerArchive(new TextEncoder().encode('bonjour'), PHRASE)).rejects.toThrow(
      /pas une archive/,
    );
  });

  it('exige une phrase de passe d’au moins douze caractères', async () => {
    await expect(chiffrerArchive(CONTENU, 'court', '2026-08-12T10:00:00+02:00')).rejects.toThrow(
      /douze caractères/,
    );
  });

  it('n’offre aucun moyen de récupération : la clé n’est nulle part', async () => {
    const archive = await chiffrerArchive(CONTENU, PHRASE, '2026-08-12T10:00:00+02:00');
    // L'en-tête en clair ne porte que le format, le sel et le vecteur.
    expect(archive.octets.length).toBe(6 + 16 + 12 + CONTENU.length + 16);
  });
});
