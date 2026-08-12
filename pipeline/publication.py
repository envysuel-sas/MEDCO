"""Compression Brotli, empreinte SHA-256 et manifest (spec §6.3, étapes 8 et 9)."""

from __future__ import annotations

import gzip
import hashlib
import json
from datetime import date
from pathlib import Path

import brotli

QUALITE = 11  # bundle produit une fois par semaine, décompressé sur mobile

# ⚠ Le bundle est publié dans **deux** compressions.
#
# La spec §6.3 retient Brotli, et c'est bien lui qui donne la taille annoncée.
# Mais GitHub Pages sert un fichier pré-compressé tel quel, sans en-tête
# `Content-Encoding`, et `DecompressionStream('br')` n'existe pas sur Safari :
# l'application ne saurait pas le décompresser. `DecompressionStream('gzip')`
# est en revanche disponible partout depuis Safari 16.4, qui est déjà le
# plancher imposé par le Web Push iOS (§10.2).
#
# Le brotli reste publié — il est plus petit, et servi directement par un CDN
# capable de poser l'en-tête, il redevient le bon choix.


def publier(
    base: Path,
    dossier: Path,
    *,
    date_bdpm: str,
    date_build: str,
    nb_specialites: int,
    version_regles: str,
    metriques: dict[str, object],
) -> dict[str, object]:
    dossier.mkdir(parents=True, exist_ok=True)
    octets = base.read_bytes()
    horodatage = date.fromisoformat(date_build).isoformat()

    comprime = brotli.compress(octets, quality=QUALITE)
    nom = f"catalogue-{horodatage}.sqlite.br"
    (dossier / nom).write_bytes(comprime)

    # mtime fixe : deux builds d'un même catalogue produisent le même fichier.
    gzippe = gzip.compress(octets, compresslevel=9, mtime=0)
    nom_gzip = f"catalogue-{horodatage}.sqlite.gz"
    (dossier / nom_gzip).write_bytes(gzippe)

    manifest = {
        "version": date_build,
        "fichier": nom,
        "fichier_gzip": nom_gzip,
        "date_bdpm": date_bdpm,
        "date_build": date_build,
        "nb_specialites": nb_specialites,
        "octets": len(comprime),
        "octets_gzip": len(gzippe),
        "octets_decompresses": len(octets),
        "sha256": hashlib.sha256(comprime).hexdigest(),
        "sha256_gzip": hashlib.sha256(gzippe).hexdigest(),
        "sha256_sqlite": hashlib.sha256(octets).hexdigest(),
        "version_regles": version_regles,
        "source": {
            "libelle": "Base de données publique des médicaments (ANSM · HAS · UNCAM)",
            "url": "https://base-donnees-publique.medicaments.gouv.fr/telechargement",
            "licence": "Licence ouverte Etalab",
        },
        "metriques": metriques,
    }

    # Les anciens bundles sont retirés : le dépôt ne conserve que le courant.
    for ancien in dossier.glob("catalogue-*.sqlite.*"):
        if ancien.name not in (nom, nom_gzip):
            ancien.unlink()

    (dossier / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return manifest
