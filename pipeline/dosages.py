"""Normalisation des dosages BDPM → milligrammes par unité de prise (spec §6.4).

Trois niveaux de fiabilité, jamais d'estimation par défaut (R1) :

  2 — direct   : masse explicite rapportée à une unité de prise dénombrable.
                 `500 mg` + `un comprimé` → 500 mg / comprimé.
  1 — dérivé   : masse rapportée à un volume ou à une masse de préparation.
                 `5 mg/ml` + `un ml` → 5 mg / ml.
                 `500 mg` + `100 ml`  → 5 mg / ml.
  0 — non calculable : tout le reste. La ligne n'entre pas dans le cumul.

Une valeur non reconnue reste à 0. Elle n'est jamais approchée : un faux
négatif de sécurité coûte plus cher qu'une donnée manquante affichée comme
telle.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

FIABILITE_DIRECTE = 2
FIABILITE_DERIVEE = 1
FIABILITE_NULLE = 0

# Masses ramenées au milligramme.
MASSES_MG: dict[str, float] = {
    "kg": 1_000_000.0,
    "g": 1_000.0,
    "gramme": 1_000.0,
    "grammes": 1_000.0,
    "mg": 1.0,
    "milligramme": 1.0,
    "milligrammes": 1.0,
    "µg": 0.001,
    "ug": 0.001,
    "mcg": 0.001,
    "microgramme": 0.001,
    "microgrammes": 0.001,
    "ng": 0.000_001,
    "nanogramme": 0.000_001,
    "nanogrammes": 0.000_001,
}

# Volumes ramenés au millilitre.
VOLUMES_ML: dict[str, float] = {
    "l": 1_000.0,
    "litre": 1_000.0,
    "litres": 1_000.0,
    "ml": 1.0,
    "millilitre": 1.0,
    "millilitres": 1.0,
    "µl": 0.001,
    "ul": 0.001,
    "microlitre": 0.001,
    "microlitres": 0.001,
}

# Unités de prise dénombrables acceptées comme référence directe.
UNITES_DENOMBRABLES: dict[str, str] = {
    "comprime": "comprimé",
    "gelule": "gélule",
    "capsule": "capsule",
    "sachet": "sachet",
    "sachet-dose": "sachet",
    "sachetdose": "sachet",
    "suppositoire": "suppositoire",
    "ovule": "ovule",
    "pastille": "pastille",
    "ampoule": "ampoule",
    "flacon": "flacon",
    "seringue": "seringue",
    "stylo": "stylo",
    "cartouche": "cartouche",
    "dose": "dose",
    "dosette": "dose",
    "pipette": "dose",
    "unidose": "dose",
    "poche": "poche",
    "dispositif": "dispositif",
    "patch": "dispositif",
    "implant": "dispositif",
    "comprime pellicule": "comprimé",
    "lyophilisat": "comprimé",
    "granule": "dose",
    "film": "dose",
    "bouffee": "dose",
    "pulverisation": "dose",
    "goutte": "dose",
    "cuillere": "dose",
    "cuillere-mesure": "dose",
}

# Motifs qui interdisent tout calcul, quel que soit le reste de la chaîne.
_INCALCULABLE = re.compile(
    r"""
      \b\d+\s*(ch|dh|k|kh|lm)\b        # dilutions homéopathiques : 4CH, 30DH…
    | \bq\.?s\.?p?\b                   # quantité suffisante pour
    | quantite\s+correspondant         # équivalence non chiffrée en masse
    | \bui\b | \bu\.i\b                # unités internationales
    | unite[s]?\s+(internationale|fpu|ph\.eur|antitoxine|dose)
    | \bpour\s+cent\b | %
    | \btitre\b
    | \bdl50\b
    """,
    re.VERBOSE,
)

_NOMBRE = r"\d+(?:[.,]\d+)?"
_ESPACES_MILLIERS = re.compile(r"(?<=\d)[\s  ](?=\d{3}\b)")

# « 500 mg », « 1 g », « 400,00 mg »
_MASSE = re.compile(rf"^({_NOMBRE})\s*([a-zµ]+)$", re.IGNORECASE)
# « 5 mg/ml », « 2 g pour 100 ml », « 5 mg par ml »
_CONCENTRATION = re.compile(
    rf"^({_NOMBRE})\s*([a-zµ]+)\s*(?:/|pour|par)\s*({_NOMBRE})?\s*([a-zµ]+)$",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class Dosage:
    """Résultat de la normalisation d'une ligne de composition."""

    dose_par_unite: float | None
    fiabilite: int
    unite: str | None
    motif: str

    @property
    def comptee(self) -> bool:
        return self.fiabilite > 0 and self.dose_par_unite is not None


def _sans_accent(valeur: str) -> str:
    decompose = unicodedata.normalize("NFD", valeur)
    return "".join(c for c in decompose if unicodedata.category(c) != "Mn")


_BALISE = re.compile(r"</?[a-z][^>]*>")


def _nettoyer(valeur: str) -> str:
    # Quelques libellés de la source contiennent des balises HTML résiduelles.
    valeur = _BALISE.sub(" ", valeur or "")
    valeur = _sans_accent(valeur).lower().strip()
    valeur = valeur.replace(" ", " ").replace(" ", " ")
    valeur = re.sub(r"\s+", " ", valeur)
    # « 1 000 mg » : espace de milliers, pas un séparateur.
    return _ESPACES_MILLIERS.sub("", valeur)


def _nombre(brut: str) -> float:
    return float(_ESPACES_MILLIERS.sub("", brut).replace(",", "."))


def _masse_mg(valeur: str, unite: str) -> float | None:
    facteur = MASSES_MG.get(unite)
    return None if facteur is None else _nombre(valeur) * facteur


def analyser_reference(ref_dosage: str) -> tuple[str, float | None, str | None]:
    """Interprète le champ `référence dosage`.

    Retourne (genre, quantité, unité) où genre ∈ {unite, volume, masse, inconnu}.
      « un comprimé »        → ('unite',  1.0,   'comprimé')
      « 100 ml de solution » → ('volume', 100.0, 'ml')
      « une ampoule de 2 ml »→ ('volume', 2.0,   'ml')
      « 100 g de crème »     → ('masse',  100.0, 'g')
    """
    texte = _nettoyer(ref_dosage)
    if not texte:
        return ("inconnu", None, None)

    # Un volume explicite prime : « une ampoule de 2 ml » se dose en ml.
    volume = re.search(rf"({_NOMBRE})\s*(ml|l|litre|litres|millilitres?|µl|ul)\b", texte)
    if volume and (facteur := VOLUMES_ML.get(volume.group(2))):
        return ("volume", _nombre(volume.group(1)) * facteur, "ml")
    # « un ml de solution » : quantité implicite de 1.
    if re.search(r"\b(un|une|1)\s+(ml|millilitre)\b", texte):
        return ("volume", 1.0, "ml")

    masse = re.search(rf"({_NOMBRE})\s*(g|mg|kg|grammes?)\b", texte)
    if masse and (facteur := MASSES_MG.get(masse.group(2))):
        return ("masse", _nombre(masse.group(1)) * facteur / 1000.0, "g")

    for cle, unite in UNITES_DENOMBRABLES.items():
        if re.search(rf"\b{re.escape(cle)}s?\b", texte):
            return ("unite", 1.0, unite)
    return ("inconnu", None, None)


def normaliser(dosage_brut: str, ref_dosage: str) -> Dosage:
    """Normalise un couple (dosage, référence) en mg par unité de prise."""
    dosage = _nettoyer(dosage_brut)
    if not dosage:
        return Dosage(None, FIABILITE_NULLE, None, "dosage absent")
    if _INCALCULABLE.search(dosage):
        return Dosage(None, FIABILITE_NULLE, None, "dosage non massique")

    genre, quantite, unite_ref = analyser_reference(ref_dosage)
    if _INCALCULABLE.search(_nettoyer(ref_dosage)):
        return Dosage(None, FIABILITE_NULLE, None, "référence non exploitable")

    # 1. Le dosage porte déjà une concentration : « 5 mg/ml ».
    if concentration := _CONCENTRATION.match(dosage):
        masse = _masse_mg(concentration.group(1), concentration.group(2))
        diviseur_brut, unite_diviseur = concentration.group(3), concentration.group(4)
        if masse is None:
            return Dosage(None, FIABILITE_NULLE, None, "unité de masse inconnue")
        diviseur = _nombre(diviseur_brut) if diviseur_brut else 1.0
        if facteur := VOLUMES_ML.get(unite_diviseur):
            return Dosage(masse / (diviseur * facteur), FIABILITE_DERIVEE, "ml", "concentration")
        if facteur := MASSES_MG.get(unite_diviseur):
            return Dosage(
                masse / (diviseur * facteur / 1000.0), FIABILITE_DERIVEE, "g", "concentration"
            )
        return Dosage(None, FIABILITE_NULLE, None, "dénominateur inconnu")

    # 2. Le dosage est une masse simple : la référence décide du niveau.
    if masse_simple := _MASSE.match(dosage):
        masse = _masse_mg(masse_simple.group(1), masse_simple.group(2))
        if masse is None:
            return Dosage(None, FIABILITE_NULLE, None, "unité de masse inconnue")
        if genre == "unite":
            return Dosage(masse, FIABILITE_DIRECTE, unite_ref, "masse par unité")
        if genre == "volume" and quantite:
            return Dosage(masse / quantite, FIABILITE_DERIVEE, "ml", "masse par volume")
        if genre == "masse" and quantite:
            return Dosage(masse / quantite, FIABILITE_DERIVEE, "g", "masse par masse")
        return Dosage(None, FIABILITE_NULLE, None, "référence de dosage inconnue")

    return Dosage(None, FIABILITE_NULLE, None, "dosage non analysable")
