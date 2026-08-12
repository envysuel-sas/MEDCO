"""Composition : choix de la ligne qui entre dans le cumul (spec §7.2, R1).

## Ce que dit la source, et pourquoi la règle diffère du texte de R1

Deux écarts entre la spécification et `CIS_COMPO_bdpm.txt` réel :

1. La spec nomme `ST` la seconde nature de ligne. La source publie `FT`
   (fraction thérapeutique). Les valeurs stockées sont celles de la source.

2. Pour un sel, la source publie **deux masses différentes de la même
   molécule**, sur la même `num_liaison` :

       NUROFENFEM 400 mg, comprimé pelliculé
         SA · 29909 LYSINATE D'IBUPROFÈNE · 684 mg · un comprimé
         FT · 02092 IBUPROFÈNE            · 400 mg · un comprimé

   La lecture littérale de R1 — « ne compter que SA » — attribue 684 mg au
   code du sel. Trois conséquences, toutes mauvaises :

     - la règle `IBU-24H`, qui cible l'ibuprofène (02092), ne se déclenche
       jamais pour ce produit : faux négatif de sécurité, précisément ce que
       R1 existe pour empêcher ;
     - le cumul se fragmente entre autant de codes que de sels commercialisés
       (lysinate, sodique, base) alors qu'il s'agit d'une seule molécule ;
     - l'UI affiche 684 mg là où la boîte imprime 400 mg.

   Par ailleurs 2 768 liaisons publient une ligne `SA` **sans dosage**, la
   masse n'étant portée que par la `FT` (atorvastatine calcique, chlorhydrate
   de tramadol…). Strictement lues, ces spécialités deviennent non comptables
   et la fiabilité des formes orales sèches tombe à 82,8 %, sous le seuil
   bloquant de 95 % (§6.5).

## Règle retenue

**Une `num_liaison` ne produit jamais plus d'une ligne comptée.** C'est
l'invariant que R1 protège — sommer SA et FT double le comptage. Au sein
d'une liaison, la ligne comptée est choisie par la politique :

  `fraction_therapeutique` (défaut) — la `FT` si elle porte un dosage
      exploitable, sinon la `SA`. Le cumul est exprimé en molécule active,
      unifiée entre sels, dans l'unité imprimée sur la boîte.
  `substance_active` — la `SA` d'abord, la `FT` en secours.
  `substance_active_stricte` — la `SA` seule, lecture littérale de R1.

Les lignes non retenues restent en base (`comptee = 0`) pour l'affichage
informatif, et ne sont jamais sommées.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from enum import StrEnum

from .dosages import FIABILITE_DERIVEE, normaliser

NATURE_ACTIVE = "SA"
NATURE_FRACTION = "FT"


class Politique(StrEnum):
    FRACTION = "fraction_therapeutique"
    ACTIVE = "substance_active"
    ACTIVE_STRICTE = "substance_active_stricte"


@dataclass(frozen=True)
class LigneComposition:
    cis: str
    element: str
    code_substance: str
    nom_substance: str
    nature: str
    num_liaison: int
    dose_par_unite: float | None
    fiabilite: int
    dosage_brut: str
    unite: str | None
    comptee: bool = False


def normaliser_lignes(
    brutes: list[dict[str, str]],
    *,
    politique: Politique = Politique.FRACTION,
) -> list[LigneComposition]:
    """Normalise les dosages puis désigne les lignes comptées.

    `brutes` : lignes de `CIS_COMPO_bdpm.txt`, clés cis · element ·
    code_substance · nom_substance · dosage · ref_dosage · nature · num_liaison.
    """
    lignes = [_analyser(brute) for brute in brutes]

    # `element` fait partie de la clé : une plaquette multiphasique publie le
    # même couple (substance, num_liaison) pour le comprimé blanc et pour le
    # rose, avec deux dosages distincts.
    par_liaison: dict[tuple[str, str, int], list[int]] = {}
    for index, ligne in enumerate(lignes):
        par_liaison.setdefault((ligne.cis, ligne.element, ligne.num_liaison), []).append(index)

    for indices in par_liaison.values():
        for index in _choisir(lignes, indices, politique):
            derivee = lignes[index].nature == NATURE_FRACTION
            lignes[index] = replace(
                lignes[index],
                comptee=True,
                # Une masse lue sur la fraction thérapeutique est une valeur
                # dérivée de la ligne active, jamais une mesure directe.
                fiabilite=FIABILITE_DERIVEE if derivee else lignes[index].fiabilite,
            )
    return lignes


def _choisir(
    lignes: list[LigneComposition], indices: list[int], politique: Politique
) -> list[int]:
    """Indices des lignes comptées pour une liaison. Vide si rien n'est exploitable."""
    exploitables = [i for i in indices if lignes[i].fiabilite > 0]
    actives = [i for i in exploitables if lignes[i].nature == NATURE_ACTIVE]
    fractions = [i for i in exploitables if lignes[i].nature == NATURE_FRACTION]

    match politique:
        case Politique.ACTIVE_STRICTE:
            return actives
        case Politique.ACTIVE:
            return actives or fractions[:1]
        case Politique.FRACTION:
            return fractions[:1] or actives
    raise ValueError(f"politique inconnue : {politique}")


def _analyser(brute: dict[str, str]) -> LigneComposition:
    dosage = normaliser(brute["dosage"], brute["ref_dosage"])
    return LigneComposition(
        cis=brute["cis"],
        element=brute["element"],
        code_substance=brute["code_substance"],
        nom_substance=brute["nom_substance"],
        nature=brute["nature"],
        num_liaison=int(brute["num_liaison"] or 0),
        dose_par_unite=dosage.dose_par_unite,
        fiabilite=dosage.fiabilite,
        dosage_brut=brute["dosage"],
        unite=dosage.unite,
    )
