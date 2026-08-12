"""Téléchargement des fichiers sources et normalisation de leur encodage.

Sources (spec §6.2) :
  - BDPM : cinq fichiers texte publiés par l'ANSM, licence ouverte (§6.6).
  - Open Medic (Assurance Maladie, licence ouverte) : seule source publique
    exploitable reliant un CIP13 à un code ATC. La BDPM ne publie pas l'ATC.

⚠ Les URL de téléchargement de la BDPM ont changé : l'ancien
`telechargement.php?fichier=X` renvoie 404, le chemin actuel est
`/download/file/X`. Vérifié le 12/08/2026.
"""

from __future__ import annotations

import re
import urllib.request
import zipfile
from dataclasses import dataclass
from pathlib import Path

BDPM_BASE = "https://base-donnees-publique.medicaments.gouv.fr/download/file"

FICHIERS_BDPM = (
    "CIS_bdpm.txt",
    "CIS_CIP_bdpm.txt",
    "CIS_COMPO_bdpm.txt",
    "CIS_CPD_bdpm.txt",
    "CIS_GENER_bdpm.txt",
)

# Page intermédiaire d'Open Medic : elle porte un jeton de session, l'URL du
# fichier ne peut donc pas être écrite en dur.
OPEN_MEDIC_PAGE = (
    "https://open-data-assurance-maladie.ameli.fr/medicaments/"
    "download.php?Dir_Rep=Open_MEDIC_Base_Complete&Annee={annee}"
)
OPEN_MEDIC_HOTE = "https://open-data-assurance-maladie.ameli.fr/medicaments/"

ENTETES = {"User-Agent": "medco-pipeline/1.0 (usage personnel, données publiques)"}


class TelechargementBloque(RuntimeError):
    """Le réseau n'a pas permis d'obtenir une source. Le build s'arrête."""


@dataclass(frozen=True)
class Source:
    nom: str
    chemin: Path
    octets: int


def _get(url: str, timeout: int = 300) -> bytes:
    requete = urllib.request.Request(url, headers=ENTETES)
    try:
        with urllib.request.urlopen(requete, timeout=timeout) as reponse:
            if reponse.status != 200:
                raise TelechargementBloque(f"{url} → HTTP {reponse.status}")
            return reponse.read()
    except TelechargementBloque:
        raise
    except Exception as cause:  # noqa: BLE001 — on veut le message brut du réseau
        raise TelechargementBloque(f"{url} → {cause}") from cause


def telecharger_bdpm(dossier: Path) -> list[Source]:
    """Récupère les cinq fichiers §6.2 et les écrit en UTF-8."""
    dossier.mkdir(parents=True, exist_ok=True)
    sources: list[Source] = []
    for nom in FICHIERS_BDPM:
        brut = _get(f"{BDPM_BASE}/{nom}")
        if brut.lstrip()[:15].lower().startswith(b"<!doctype html"):
            raise TelechargementBloque(
                f"{nom} : la source a renvoyé une page HTML, pas le fichier. "
                "URL de téléchargement à revérifier."
            )
        texte = decoder(brut, nom)
        chemin = dossier / nom
        chemin.write_text(texte, encoding="utf-8")
        sources.append(Source(nom, chemin, len(brut)))
    return sources


PAGE_TELECHARGEMENT = "https://base-donnees-publique.medicaments.gouv.fr/telechargement"


def date_publication_bdpm() -> str:
    """Date de mise à jour affichée par la source, au format ISO.

    Obligation de licence (§6.6) : la date de mise à jour doit être citée. Elle
    n'est pas dans les fichiers, seulement sur la page de téléchargement.
    """
    page = decoder(_get(PAGE_TELECHARGEMENT))
    trouve = re.search(r"Dernière mise à jour le\s*(\d{2})/(\d{2})/(\d{4})", page)
    if not trouve:
        raise TelechargementBloque(
            "Date de mise à jour BDPM introuvable sur la page de téléchargement."
        )
    jour, mois, annee = trouve.groups()
    return f"{annee}-{mois}-{jour}"


def telecharger_open_medic(dossier: Path, annee: int) -> Path:
    """Récupère la base complète Open Medic (CIP13 ↔ ATC) et la décompresse."""
    dossier.mkdir(parents=True, exist_ok=True)
    destination = dossier / f"OPEN_MEDIC_{annee}.CSV"
    if destination.exists():
        return destination

    page = _get(OPEN_MEDIC_PAGE.format(annee=annee)).decode("latin-1")
    lien = re.search(r'href="\./(download_file\.php\?token=[^"]+)"', page)
    if not lien:
        raise TelechargementBloque(
            f"Open Medic {annee} : aucun lien de fichier sur la page de téléchargement."
        )
    archive = dossier / f"OPEN_MEDIC_{annee}.zip"
    archive.write_bytes(_get(OPEN_MEDIC_HOTE + lien.group(1).replace("&amp;", "&")))

    with zipfile.ZipFile(archive) as zf:
        interne = next(n for n in zf.namelist() if n.upper().endswith(".CSV"))
        with zf.open(interne) as source, destination.open("wb") as cible:
            while morceau := source.read(1 << 20):
                cible.write(morceau)
    archive.unlink()
    return destination


# ---------------------------------------------------------------------------
# Encodage
# ---------------------------------------------------------------------------

# Signature d'un texte UTF-8 relu comme du latin-1 puis réencodé en UTF-8
# (« Ã© » pour « é »). Le fichier CIS_CIP_bdpm.txt est publié dans cet état.
_MOJIBAKE = re.compile(r"[ÃÂ][-¿–—‚-„†-•©®°±µ¹²³»«]")


def decoder(brut: bytes, nom: str = "") -> str:
    """Décode un fichier BDPM vers de l'UTF-8 propre.

    Trois cas rencontrés en production :
      1. latin-1 / cp1252 (la majorité des fichiers) ;
      2. UTF-8 valide ;
      3. UTF-8 doublement encodé — valide en UTF-8 mais illisible (« Ã© »).
    """
    try:
        texte = brut.decode("utf-8")
    except UnicodeDecodeError:
        # cp1252 avant latin-1 : il couvre en plus la plage 0x80–0x9F
        # (apostrophe typographique, tiret cadratin) présente dans les libellés.
        try:
            return brut.decode("cp1252")
        except UnicodeDecodeError:
            return brut.decode("latin-1")

    avant = len(_MOJIBAKE.findall(texte))
    if avant == 0:
        return texte
    try:
        repare = texte.encode("latin-1").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return texte
    return repare if len(_MOJIBAKE.findall(repare)) < avant else texte
