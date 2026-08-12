"""Les six contrôles bloquants du build (spec §6.5).

Aucun n'est un avertissement : si l'un échoue, le bundle n'est pas publié.
Un catalogue faux est plus dangereux qu'un catalogue absent.
"""

from __future__ import annotations

import json
import re
import sqlite3
from dataclasses import dataclass
from pathlib import Path

SPECIALITES_MIN = 12_000
SPECIALITES_MAX = 20_000
VARIATION_MAX = 0.05
FIABILITE_MIN = 0.95

# Formes orales sèches au sens de §6.4 : comprimés, gélules, sachets.
FORMES_SECHES = re.compile(
    r"comprim|g[ée]lule|capsule|granul[ée]s? pour|poudre pour solution buvable"
    r"|poudre orale|sachet|pastille|lyophilisat",
    re.IGNORECASE,
)
# Les dilutions homéopathiques n'ont pas d'équivalent massique : aucun parseur
# ne peut les convertir. Elles sont comptées à part (§6.4).
DILUTION = re.compile(r"\d+\s*(CH|DH|K|LM)\b", re.IGNORECASE)
HOMEOPATHIE = re.compile(r"hom[ée]opath", re.IGNORECASE)


@dataclass
class Resultat:
    nom: str
    ok: bool
    detail: str

    def __str__(self) -> str:
        return f"[{'OK ' if self.ok else 'ÉCHEC'}] {self.nom} — {self.detail}"


class ControleEchoue(RuntimeError):
    pass


def tous(
    base: Path,
    *,
    manifest_precedent: Path | None,
    regles: Path,
    jeu_dore: Path,
) -> list[Resultat]:
    connexion = sqlite3.connect(f"file:{base}?mode=ro", uri=True)
    connexion.row_factory = sqlite3.Row
    try:
        resultats = [
            _nombre_specialites(connexion),
            _variation(connexion, manifest_precedent),
            _fiabilite_formes_seches(connexion),
            _liaisons_sans_sa(connexion),
            _couverture_atc(connexion, regles),
            _jeu_dore(connexion, jeu_dore),
        ]
    finally:
        connexion.close()
    return resultats


def exiger(resultats: list[Resultat]) -> None:
    if echecs := [r for r in resultats if not r.ok]:
        raise ControleEchoue(
            "Bundle non publié — contrôle(s) bloquant(s) :\n"
            + "\n".join(f"  · {r.nom} : {r.detail}" for r in echecs)
        )


# ---------------------------------------------------------------------------


def _nombre_specialites(cx: sqlite3.Connection) -> Resultat:
    nombre = cx.execute("SELECT COUNT(*) FROM specialite").fetchone()[0]
    return Resultat(
        "nombre de spécialités",
        SPECIALITES_MIN <= nombre <= SPECIALITES_MAX,
        f"{nombre} (attendu {SPECIALITES_MIN}–{SPECIALITES_MAX})",
    )


def _variation(cx: sqlite3.Connection, manifest: Path | None) -> Resultat:
    nombre = cx.execute("SELECT COUNT(*) FROM specialite").fetchone()[0]
    if manifest is None or not manifest.exists():
        return Resultat("variation vs bundle précédent", True, "premier build, rien à comparer")
    precedent = json.loads(manifest.read_text(encoding="utf-8")).get("nb_specialites")
    if not precedent:
        return Resultat("variation vs bundle précédent", True, "manifest précédent sans compte")
    variation = abs(nombre - precedent) / precedent
    return Resultat(
        "variation vs bundle précédent",
        variation <= VARIATION_MAX,
        f"{variation:.2%} ({precedent} → {nombre}, plafond {VARIATION_MAX:.0%})",
    )


def mesurer_fiabilite(cx: sqlite3.Connection) -> dict[str, int]:
    """Compte les liaisons de formes orales sèches, comptées et exclues."""
    lignes = cx.execute(
        """
        SELECT c.cis, c.element, c.num_liaison, c.nature, c.dosage_brut,
               c.comptee, s.forme, s.voies, sub.nom AS nom_substance
        FROM composition c
        JOIN specialite s ON s.cis = c.cis
        LEFT JOIN substance sub ON sub.code = c.code_substance
        """
    ).fetchall()

    liaisons: dict[tuple, dict] = {}
    for ligne in lignes:
        if "orale" not in (ligne["voies"] or "").lower():
            continue
        if not FORMES_SECHES.search(ligne["forme"] or ""):
            continue
        cle = (ligne["cis"], ligne["element"], ligne["num_liaison"])
        etat = liaisons.setdefault(cle, {"comptee": False, "homeo": False})
        etat["comptee"] = etat["comptee"] or bool(ligne["comptee"])
        etat["homeo"] = etat["homeo"] or bool(
            DILUTION.search(ligne["dosage_brut"] or "")
            or HOMEOPATHIE.search(ligne["nom_substance"] or "")
        )

    total = len(liaisons)
    homeo = sum(1 for e in liaisons.values() if e["homeo"])
    retenues = [e for e in liaisons.values() if not e["homeo"]]
    return {
        "total": total,
        "homeopathiques": homeo,
        "denominateur": len(retenues),
        "comptees": sum(1 for e in retenues if e["comptee"]),
        "comptees_toutes": sum(1 for e in liaisons.values() if e["comptee"]),
    }


def _fiabilite_formes_seches(cx: sqlite3.Connection) -> Resultat:
    m = mesurer_fiabilite(cx)
    if not m["denominateur"]:
        return Resultat("fiabilité des formes orales sèches", False, "dénominateur vide")
    taux = m["comptees"] / m["denominateur"]
    return Resultat(
        "fiabilité des formes orales sèches",
        taux >= FIABILITE_MIN,
        f"{taux:.2%} sur {m['denominateur']} liaisons "
        f"(seuil {FIABILITE_MIN:.0%} ; {m['homeopathiques']} liaisons homéopathiques "
        f"exclues du dénominateur, non convertibles en mg)",
    )


def _liaisons_sans_sa(cx: sqlite3.Connection) -> Resultat:
    manquantes = cx.execute(
        """
        SELECT COUNT(*) FROM (
          SELECT cis, element, num_liaison
          FROM composition
          GROUP BY cis, element, num_liaison
          HAVING SUM(nature = 'SA') = 0
        )
        """
    ).fetchone()[0]
    return Resultat(
        "liaison sans ligne SA",
        manquantes == 0,
        f"{manquantes} liaison(s) sans substance active",
    )


def _couverture_atc(cx: sqlite3.Connection, regles: Path) -> Resultat:
    contenu = json.loads(regles.read_text(encoding="utf-8"))
    codes: set[str] = set()
    classes: set[str] = set()
    for regle in contenu["regles"]:
        cible = regle["cible"]
        codes.update(cible.get("substances", []))
        classes.update(cible.get("classes", []))

    sans_atc = [
        code
        for (code,) in cx.execute(
            "SELECT code FROM substance WHERE atc IS NULL AND code IN (%s)"
            % ",".join("?" * len(codes)),
            sorted(codes),
        ).fetchall()
    ] if codes else []

    # Une classe se porte sur la substance (ANTALGIQUE_SIMPLE) ou sur le
    # produit (ANTALGIQUE_ASSOCIATION) : aucune molécule ne porte le code ATC
    # d'une association.
    classes_vides = [
        classe
        for classe in sorted(classes)
        if cx.execute("SELECT COUNT(*) FROM substance WHERE classe = ?", (classe,)).fetchone()[0]
        == 0
        and cx.execute("SELECT COUNT(*) FROM specialite WHERE classe = ?", (classe,)).fetchone()[0]
        == 0
    ]

    ok = not sans_atc and not classes_vides
    detail = f"{len(codes)} substances ciblées, {len(classes)} classes ciblées"
    if sans_atc:
        detail += f" ; sans ATC : {', '.join(sans_atc)}"
    if classes_vides:
        detail += f" ; classes sans substance : {', '.join(classes_vides)}"
    return Resultat("couverture ATC des substances réglées", ok, detail)


def _jeu_dore(cx: sqlite3.Connection, chemin: Path) -> Resultat:
    """Vérifie les cas de cumul du jeu doré (§16.1) sur le catalogue construit."""
    cas = json.loads(chemin.read_text(encoding="utf-8"))["cas_catalogue"]
    echecs: list[str] = []
    for c in cas:
        ligne = cx.execute(
            """
            SELECT c.dose_par_unite, c.fiabilite, c.unite, s.nom
            FROM composition c
            JOIN specialite s ON s.cis = c.cis
            WHERE c.cis = ? AND c.code_substance = ? AND c.comptee = 1
            """,
            (c["cis"], c["code_substance"]),
        ).fetchone()
        if ligne is None:
            echecs.append(f"{c['libelle']} : aucune ligne comptée")
            continue
        if ligne["nom"] != c["nom_specialite"]:
            echecs.append(f"{c['libelle']} : CIS {c['cis']} porte « {ligne['nom']} »")
        if abs(ligne["dose_par_unite"] - c["dose_par_unite_mg"]) > 1e-6:
            echecs.append(
                f"{c['libelle']} : {ligne['dose_par_unite']} mg au lieu de {c['dose_par_unite_mg']}"
            )
        if ligne["fiabilite"] < c["fiabilite_min"]:
            echecs.append(f"{c['libelle']} : fiabilité {ligne['fiabilite']}")
        if ligne["unite"] != c["unite"]:
            echecs.append(f"{c['libelle']} : unité « {ligne['unite']} » au lieu de « {c['unite']} »")

    doubles = cx.execute(
        """
        SELECT COUNT(*) FROM (
          SELECT cis, element, num_liaison
          FROM composition WHERE comptee = 1
          GROUP BY cis, element, num_liaison
          HAVING COUNT(DISTINCT nature) > 1
        )
        """
    ).fetchone()[0]
    if doubles:
        echecs.append(f"{doubles} liaison(s) comptent SA et FT — double comptage")

    return Resultat(
        "jeu doré (catalogue)",
        not echecs,
        f"{len(cas)} cas vérifiés" if not echecs else " ; ".join(echecs),
    )
