"""Enrichissement ATC : `substance.atc`, `groupe_atc`, `classe` (spec §5.4, §12.2).

**La BDPM ne publie pas l'ATC.** La seule source publique française qui relie
un médicament à un code ATC est *Open Medic* (Assurance Maladie, licence
ouverte) : chaque ligne porte un CIP13 et son ATC5.

Deux signaux, dans cet ordre :

1. **Nom** — le libellé `L_ATC5` d'Open Medic est le nom de la molécule
   (`PARACETAMOL`, `IBUPROFENE`). Comparé au nom de substance BDPM une fois
   normalisé (accents, casse, ponctuation). Retenu seulement si le nom ne
   désigne qu'un ATC5 : « IBUPROFENE » vaut M01AE01 (oral) et M02AA13
   (topique), l'ambiguïté est alors laissée au signal 2.

2. **Vote par spécialité** — CIP13 → CIS → substances. Seules les spécialités
   à **une seule substance comptée** votent : sur une association, l'ATC5 est
   celui de l'association, pas d'un de ses composants. L'ATC majoritaire
   l'emporte, les égalités sont tranchées par le code le plus petit pour que
   la dérivation reste stable entre versions (§12.2).

Aucune valeur n'est inventée : une substance sans correspondance garde
`atc = NULL`, `groupe_atc = '_'` et `classe = 'AUTRE'`. Le contrôle §6.5
échoue si une substance ciblée par une règle est dans ce cas.
"""

from __future__ import annotations

import collections
import csv
import json
import unicodedata
from dataclasses import dataclass
from pathlib import Path

GROUPE_SANS_ATC = "_"
CLASSE_DEFAUT = "AUTRE"

CHEMIN_CLASSES = Path(__file__).parent / "classes_atc.json"


@dataclass(frozen=True)
class Attribution:
    atc: str | None
    groupe_atc: str
    classe: str
    origine: str  # 'nom' | 'vote' | 'aucune'


def normaliser_nom(valeur: str) -> str:
    decompose = unicodedata.normalize("NFD", (valeur or "").upper())
    sans_accent = "".join(c for c in decompose if unicodedata.category(c) != "Mn")
    lettres = "".join(c if c.isalnum() else " " for c in sans_accent)
    return " ".join(lettres.split())


def lire_open_medic(chemin: Path) -> tuple[dict[str, str], dict[str, set[str]]]:
    """Retourne (cip13 → atc5, nom normalisé → {atc5}) depuis la base complète."""
    cip_vers_atc: dict[str, str] = {}
    noms: dict[str, set[str]] = collections.defaultdict(set)
    with chemin.open(encoding="latin-1", newline="") as fichier:
        lecteur = csv.DictReader(fichier, delimiter=";")
        for ligne in lecteur:
            atc5 = (ligne.get("ATC5") or "").strip().upper()
            cip13 = (ligne.get("CIP13") or "").strip()
            libelle = ligne.get("L_ATC5") or ""
            if not atc5:
                continue
            if cip13:
                cip_vers_atc[cip13] = atc5
            if libelle:
                noms[normaliser_nom(libelle)].add(atc5)
    return cip_vers_atc, dict(noms)


def atc_par_specialite(
    cip_vers_atc: dict[str, str], presentations: list[tuple[str, str]]
) -> dict[str, str]:
    """CIS → ATC5, via les présentations connues d'Open Medic."""
    resultat: dict[str, str] = {}
    for cip13, cis in presentations:
        if atc := cip_vers_atc.get(cip13):
            resultat.setdefault(cis, atc)
    return resultat


def attribuer(
    substances: dict[str, str],
    noms_atc: dict[str, set[str]],
    atc_des_cis: dict[str, str],
    substances_par_cis: dict[str, list[str]],
    liaisons: set[tuple[str, str]],
) -> dict[str, Attribution]:
    """Attribue un ATC à chaque code substance BDPM.

    `substances`          code substance → nom
    `atc_des_cis`         cis → ATC5
    `substances_par_cis`  cis → codes substance comptés
    `liaisons`            couples (code sel, code fraction) d'une même liaison :
                          deux écritures de la même molécule, donc même ATC.
    """
    classes = _charger_classes()

    votes: dict[str, collections.Counter[str]] = collections.defaultdict(collections.Counter)
    for cis, codes in substances_par_cis.items():
        # Sur une association, l'ATC est celui de l'association : il ne dit
        # rien d'un composant pris isolément.
        if len(codes) != 1:
            continue
        if atc := atc_des_cis.get(cis):
            votes[codes[0]][atc] += 1

    trouves: dict[str, tuple[str, str]] = {}
    for code, nom in substances.items():
        candidats = noms_atc.get(normaliser_nom(nom), set())
        if len(candidats) == 1:
            trouves[code] = (next(iter(candidats)), "nom")
        elif compte := votes.get(code):
            maximum = max(compte.values())
            trouves[code] = (min(a for a, n in compte.items() if n == maximum), "vote")
        elif len(candidats) > 1:
            trouves[code] = (min(candidats), "nom")

    # Propagation sel ↔ fraction thérapeutique : le chlorhydrate de tramadol et
    # le tramadol sont la même molécule. Itéré jusqu'au point fixe, les chaînes
    # de sels pouvant compter plus d'un maillon.
    while True:
        ajouts = 0
        for gauche, droite in liaisons:
            for source, cible in ((gauche, droite), (droite, gauche)):
                if source in trouves and cible not in trouves:
                    trouves[cible] = (trouves[source][0], "liaison")
                    ajouts += 1
        if not ajouts:
            break

    return {
        code: Attribution(
            atc=(atc := trouves.get(code, (None, "aucune"))[0]),
            groupe_atc=atc[0] if atc else GROUPE_SANS_ATC,
            classe=classe_pour(atc, classes),
            origine=trouves.get(code, (None, "aucune"))[1],
        )
        for code in substances
    }


def classe_pour(atc: str | None, classes: list[tuple[str, str]] | None = None) -> str:
    """Classe de substance §5.4, par préfixe ATC le plus spécifique."""
    if not atc:
        return CLASSE_DEFAUT
    for prefixe, classe in classes if classes is not None else _charger_classes():
        if atc.upper().startswith(prefixe):
            return classe
    return CLASSE_DEFAUT


_CACHE: list[tuple[str, str]] | None = None


def _charger_classes() -> list[tuple[str, str]]:
    global _CACHE
    if _CACHE is None:
        donnees = json.loads(CHEMIN_CLASSES.read_text(encoding="utf-8"))
        # Préfixe le plus long d'abord : N02AJ (association) prime sur N02A.
        _CACHE = sorted(
            ((e["prefixe_atc"], e["classe"]) for e in donnees["correspondances"]),
            key=lambda e: -len(e[0]),
        )
    return _CACHE
