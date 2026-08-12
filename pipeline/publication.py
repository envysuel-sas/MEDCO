"""Compression Brotli, empreinte SHA-256 et manifest (spec §6.3, étapes 8 et 9)."""

from __future__ import annotations

import hashlib
import json
from datetime import date
from pathlib import Path

import brotli

QUALITE = 11  # bundle produit une fois par semaine, décompressé sur mobile


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
    comprime = brotli.compress(octets, quality=QUALITE)

    nom = f"catalogue-{date.fromisoformat(date_build).isoformat()}.sqlite.br"
    cible = dossier / nom
    cible.write_bytes(comprime)

    manifest = {
        "version": date_build,
        "fichier": nom,
        "date_bdpm": date_bdpm,
        "date_build": date_build,
        "nb_specialites": nb_specialites,
        "octets": len(comprime),
        "octets_decompresses": len(octets),
        "sha256": hashlib.sha256(comprime).hexdigest(),
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
    for ancien in dossier.glob("catalogue-*.sqlite.br"):
        if ancien.name != nom:
            ancien.unlink()

    (dossier / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return manifest
