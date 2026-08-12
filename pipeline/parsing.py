"""Lecture des fichiers BDPM (spec §6.2, §6.3).

Caractéristiques de la source, toutes traitées ici : séparateur tabulation,
**aucune ligne d'en-tête**, dates `JJ/MM/AAAA`, encodage hérité (traité en
amont par `sources.decoder`), champs texte pouvant contenir des tabulations
parasites.

Le nombre de colonnes est fixé par fichier : les tabulations en trop sont
recollées dans la dernière colonne plutôt que de décaler la ligne ou de la
faire tomber.
"""

from __future__ import annotations

import re
from pathlib import Path

import polars as pl

COLONNES_CIS = (
    "cis",
    "nom",
    "forme",
    "voies",
    "statut_amm",
    "procedure",
    "etat_commercialisation",
    "date_amm",
    "statut_bdm",
    "numero_autorisation_europeenne",
    "titulaires",
    "surveillance_renforcee",
)

COLONNES_CIP = (
    "cis",
    "cip7",
    "libelle",
    "statut_administratif",
    "etat_commercialisation",
    "date_declaration",
    "cip13",
    "agrement_collectivites",
    "taux_remboursement",
    "prix_hors_honoraire",
    "prix_ttc",
    "honoraire",
    "indications_remboursement",
)

COLONNES_COMPO = (
    "cis",
    "element",
    "code_substance",
    "nom_substance",
    "dosage",
    "ref_dosage",
    "nature",
    "num_liaison",
)

COLONNES_CPD = ("cis", "condition")

COLONNES_GENER = ("groupe", "libelle_groupe", "cis", "type_generique", "tri")


def lire(chemin: Path, colonnes: tuple[str, ...]) -> pl.DataFrame:
    """Lit un fichier BDPM en DataFrame de chaînes, sans perte de ligne."""
    lignes: list[tuple[str, ...]] = []
    for brute in chemin.read_text(encoding="utf-8").splitlines():
        if not brute.strip():
            continue
        champs = brute.split("\t")
        if len(champs) > len(colonnes):
            # Tabulation parasite dans un libellé : on recolle la fin.
            champs = champs[: len(colonnes) - 1] + ["\t".join(champs[len(colonnes) - 1 :])]
        elif len(champs) < len(colonnes):
            champs = champs + [""] * (len(colonnes) - len(champs))
        lignes.append(tuple(c.strip() for c in champs))

    return pl.DataFrame(lignes, schema=[(c, pl.Utf8) for c in colonnes], orient="row")


# ---------------------------------------------------------------------------
# Normalisations
# ---------------------------------------------------------------------------

_DATE = re.compile(r"^(\d{2})/(\d{2})/(\d{4})$")


def date_iso(valeur: str) -> str | None:
    """`JJ/MM/AAAA` → `AAAA-MM-JJ`. `None` si la date n'est pas conforme."""
    correspondance = _DATE.match((valeur or "").strip())
    if not correspondance:
        return None
    jour, mois, annee = correspondance.groups()
    return f"{annee}-{mois}-{jour}"


# Conditions de délivrance impliquant une prescription obligatoire.
# Les autres conditions publiées (surveillance particulière, plan de gestion
# de risque…) ne conditionnent pas la délivrance.
_PMO = re.compile(
    r"liste\s+i{1,2}\b|stup[ée]fiant|hospitali|prescription\s+(initiale|r[ée]serv|restreinte)"
    r"|usage\s+professionnel|prescription\s+par\s+",
    re.IGNORECASE,
)


def prescription(conditions: list[str]) -> str:
    """'PMO' si une condition impose l'ordonnance, 'PMF' sinon (spec §5.1).

    L'absence de condition n'est pas une inconnue : en droit français, une
    spécialité qui ne figure sur aucune liste est à prescription facultative.
    """
    return "PMO" if any(_PMO.search(c or "") for c in conditions) else "PMF"


_NB_UNITES = re.compile(
    r"(?:(\d+)\s*(?:x|×)\s*)?(?:de\s+)?(\d+)\s*"
    r"(comprim|g[ée]lule|capsule|sachet|suppositoire|ampoule|pastille|dose|unit[ée]|ovule|film)",
    re.IGNORECASE,
)
_MULTIPLICATEUR = re.compile(r"^(\d+)\s*(?:plaquette|flacon|film|tube|blister|pilulier|sachet)", re.I)


def nb_unites(libelle: str) -> int | None:
    """Nombre d'unités de prise d'une présentation, ou `None` si non lisible.

    « plaquette(s) PVC de 30 comprimé(s) » → 30
    « 2 plaquettes de 15 comprimés »       → 30
    Aucune valeur par défaut : un libellé non lisible reste inconnu (R1).
    """
    texte = (libelle or "").strip()
    correspondance = _NB_UNITES.search(texte)
    if not correspondance:
        return None
    unites = int(correspondance.group(2))
    facteur = correspondance.group(1)
    if facteur is None and (prefixe := _MULTIPLICATEUR.match(texte)):
        facteur = prefixe.group(1)
    total = unites * int(facteur or 1)
    return total if 0 < total <= 10_000 else None
