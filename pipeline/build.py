"""Chaîne de production du bundle catalogue (spec §6.3).

    1. Télécharger les fichiers BDPM
    2. Détecter l'encodage → UTF-8
    3. Parser (polars), typer, normaliser les dates
    4. Normaliser les dosages → fiabilité (§6.4)
    5. Enrichir ATC → groupe_atc + classe (§5.4)
    6. Construire le SQLite, VACUUM, index, FTS5
    7. Contrôles bloquants (§6.5)
    8. Brotli + SHA-256
    9. Écrire /public/bundles + manifest.json

Usage :
    python -m pipeline.build [--cache DOSSIER] [--politique fraction_therapeutique]
"""

from __future__ import annotations

import argparse
import collections
import datetime as dt
import json
import sys
from pathlib import Path

import polars as pl

from . import atc as atc_module
from . import catalogue, controles, parsing, publication, sources
from .composition import Politique, normaliser_lignes

RACINE = Path(__file__).resolve().parent.parent
DOSSIER_BUNDLES = RACINE / "public" / "bundles"
DOSSIER_DATA = RACINE / "data"
ANNEE_OPEN_MEDIC = 2025


def journal(message: str) -> None:
    print(message, file=sys.stderr, flush=True)


def executer(cache: Path, politique: Politique, ignorer_controles: bool = False) -> dict:
    cache.mkdir(parents=True, exist_ok=True)

    # 1 & 2 — téléchargement, encodage
    journal("1/9 · téléchargement BDPM")
    dossier_bdpm = cache / "bdpm"
    if all((dossier_bdpm / n).exists() for n in sources.FICHIERS_BDPM):
        journal("     (fichiers déjà en cache)")
    else:
        for source in sources.telecharger_bdpm(dossier_bdpm):
            journal(f"     {source.nom} · {source.octets // 1024} Ko")
    date_bdpm = sources.date_publication_bdpm()
    journal(f"2/9 · encodage normalisé en UTF-8 · BDPM du {date_bdpm}")

    # 3 — parsing
    journal("3/9 · parsing")
    cis = parsing.lire(dossier_bdpm / "CIS_bdpm.txt", parsing.COLONNES_CIS)
    cip = parsing.lire(dossier_bdpm / "CIS_CIP_bdpm.txt", parsing.COLONNES_CIP)
    compo = parsing.lire(dossier_bdpm / "CIS_COMPO_bdpm.txt", parsing.COLONNES_COMPO)
    cpd = parsing.lire(dossier_bdpm / "CIS_CPD_bdpm.txt", parsing.COLONNES_CPD)
    journal(f"     {cis.height} spécialités · {cip.height} présentations · {compo.height} lignes de composition")

    # 4 — dosages
    journal("4/9 · normalisation des dosages")
    lignes = normaliser_lignes(compo.to_dicts(), politique=politique)
    comptees = sum(1 for l in lignes if l.comptee)
    journal(f"     {comptees} lignes comptées sur {len(lignes)}")

    # 5 — ATC
    journal("5/9 · enrichissement ATC (Open Medic)")
    chemin_om = sources.telecharger_open_medic(cache / "openmedic", ANNEE_OPEN_MEDIC)
    cip_vers_atc, noms_atc = atc_module.lire_open_medic(chemin_om)

    substances = {}
    for ligne in lignes:
        substances.setdefault(ligne.code_substance, ligne.nom_substance)
    substances_par_cis: dict[str, list[str]] = collections.defaultdict(list)
    for ligne in lignes:
        if ligne.comptee:
            substances_par_cis[ligne.cis].append(ligne.code_substance)
    for code, liste in substances_par_cis.items():
        substances_par_cis[code] = sorted(set(liste))

    atc_des_cis = atc_module.atc_par_specialite(
        cip_vers_atc, list(zip(cip["cip13"].to_list(), cip["cis"].to_list()))
    )

    # Deux écritures d'une même molécule au sein d'une liaison (sel et fraction
    # thérapeutique) partagent leur ATC.
    liaisons_substances: set[tuple[str, str]] = set()
    par_liaison: dict[tuple[str, str, int], set[str]] = collections.defaultdict(set)
    for ligne in lignes:
        par_liaison[(ligne.cis, ligne.element, ligne.num_liaison)].add(ligne.code_substance)
    for codes in par_liaison.values():
        ordonnes = sorted(codes)
        for gauche in ordonnes:
            for droite in ordonnes:
                if gauche < droite:
                    liaisons_substances.add((gauche, droite))

    attributions = atc_module.attribuer(
        substances, noms_atc, atc_des_cis, dict(substances_par_cis), liaisons_substances
    )
    avec_atc = sum(1 for a in attributions.values() if a.atc)
    origines = collections.Counter(a.origine for a in attributions.values())
    journal(f"     {avec_atc}/{len(attributions)} substances avec un ATC · {dict(origines)}")
    journal(f"     {len(atc_des_cis)} spécialités avec un ATC")

    # 6 — SQLite
    journal("6/9 · construction du SQLite")
    conditions: dict[str, list[str]] = collections.defaultdict(list)
    for ligne in cpd.iter_rows(named=True):
        conditions[ligne["cis"]].append(ligne["condition"])

    noms_par_cis: dict[str, list[str]] = collections.defaultdict(list)
    for ligne in lignes:
        if ligne.comptee:
            noms_par_cis[ligne.cis].append(ligne.nom_substance)

    lignes_specialite = [
        (
            r["cis"],
            r["nom"],
            r["forme"],
            r["voies"],
            1 if r["etat_commercialisation"].startswith("Commercialis") else 0,
            parsing.prescription(conditions.get(r["cis"], [])),
            " ".join(sorted(set(noms_par_cis.get(r["cis"], [])))),
            atc_des_cis.get(r["cis"]),
            atc_module.classe_pour(atc_des_cis.get(r["cis"])),
        )
        for r in cis.iter_rows(named=True)
    ]
    connus = {r[0] for r in lignes_specialite}

    lignes_presentation = [
        (r["cip13"], r["cis"], r["libelle"], parsing.nb_unites(r["libelle"]))
        for r in cip.iter_rows(named=True)
        if r["cip13"] and r["cis"] in connus
    ]

    lignes_substance = [
        (code, nom, a.atc, a.groupe_atc, a.classe)
        for code, nom in sorted(substances.items())
        if (a := attributions[code])
    ]

    lignes_composition = [
        (
            l.cis,
            l.element,
            l.code_substance,
            l.nature,
            l.num_liaison,
            l.dose_par_unite,
            l.fiabilite,
            l.dosage_brut,
            l.unite,
            1 if l.comptee else 0,
        )
        for l in lignes
        if l.cis in connus
    ]

    date_build = dt.date.today().isoformat()
    version_regles = json.loads((DOSSIER_DATA / "regles.json").read_text("utf-8"))["version"]
    base = catalogue.construire(
        cache / "catalogue.db",
        substances=lignes_substance,
        specialites=lignes_specialite,
        presentations=lignes_presentation,
        compositions=lignes_composition,
        meta={
            "version": date_build,
            "date_bdpm": date_bdpm,
            "date_build": date_build,
            "nb_specialites": len(lignes_specialite),
            "politique_liaison": politique.value,
            "version_regles": version_regles,
            "source": "BDPM (ANSM/HAS/UNCAM), licence ouverte Etalab",
            "source_atc": f"Open Medic {ANNEE_OPEN_MEDIC} (Assurance Maladie), licence ouverte",
        },
    )
    journal(f"     {base.stat().st_size // 1024} Ko")

    # 7 — contrôles bloquants
    journal("7/9 · contrôles bloquants")
    manifest_precedent = DOSSIER_BUNDLES / "manifest.json"
    resultats = controles.tous(
        base,
        manifest_precedent=manifest_precedent,
        regles=DOSSIER_DATA / "regles.json",
        jeu_dore=DOSSIER_DATA / "jeu-dore.json",
    )
    for resultat in resultats:
        journal(f"     {resultat}")
    if not ignorer_controles:
        controles.exiger(resultats)

    # 8 & 9 — brotli, empreinte, manifest
    journal("8/9 · compression Brotli et empreinte SHA-256")
    import sqlite3

    connexion = sqlite3.connect(f"file:{base}?mode=ro", uri=True)
    connexion.row_factory = sqlite3.Row
    mesures = controles.mesurer_fiabilite(connexion)
    connexion.close()

    manifest = publication.publier(
        base,
        DOSSIER_BUNDLES,
        date_bdpm=date_bdpm,
        date_build=date_build,
        nb_specialites=len(lignes_specialite),
        version_regles=version_regles,
        metriques={
            "substances": len(lignes_substance),
            "substances_avec_atc": avec_atc,
            "origine_atc": dict(origines),
            "specialites_avec_atc": len(atc_des_cis),
            "presentations": len(lignes_presentation),
            "lignes_composition": len(lignes_composition),
            "lignes_comptees": comptees,
            "politique_liaison": politique.value,
            "formes_orales_seches": {
                "liaisons": mesures["total"],
                "homeopathiques_exclues": mesures["homeopathiques"],
                "denominateur": mesures["denominateur"],
                "comptees": mesures["comptees"],
                "taux": round(mesures["comptees"] / mesures["denominateur"], 4),
                "taux_toutes_liaisons": round(mesures["comptees_toutes"] / mesures["total"], 4),
            },
            "controles": [{"nom": r.nom, "ok": r.ok, "detail": r.detail} for r in resultats],
        },
    )
    journal(f"9/9 · {manifest['fichier']} · {manifest['octets'] // 1024} Ko · sha256 {manifest['sha256'][:16]}…")
    return manifest


def main() -> int:
    parseur = argparse.ArgumentParser(description="Ingestion BDPM → bundle catalogue")
    parseur.add_argument("--cache", type=Path, default=RACINE / ".cache" / "pipeline")
    parseur.add_argument(
        "--politique",
        type=Politique,
        default=Politique.FRACTION,
        choices=list(Politique),
        help="ligne comptée par liaison (voir pipeline/composition.py)",
    )
    parseur.add_argument(
        "--ignorer-controles",
        action="store_true",
        help="produit le bundle malgré un contrôle en échec — jamais en CI",
    )
    arguments = parseur.parse_args()
    try:
        executer(arguments.cache, arguments.politique, arguments.ignorer_controles)
    except (sources.TelechargementBloque, controles.ControleEchoue) as erreur:
        journal(f"\nARRÊT — {erreur}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
