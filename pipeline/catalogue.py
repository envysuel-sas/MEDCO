"""Construction de `catalogue.db` (spec §5.1) : schéma, insertion, index, FTS5, VACUUM.

Écarts assumés au schéma §5.1, chacun rendu nécessaire par la source réelle :

* `specialite.substances` — la définition FTS5 de §5.1 déclare
  `content='specialite'` avec une colonne `substances` qui n'existe pas dans
  la table. La colonne est ajoutée (noms de substances concaténés) pour que
  l'index externe de la spec soit constructible tel qu'écrit.

* `specialite.atc` et `specialite.classe` — une classe comme
  `ANTALGIQUE_ASSOCIATION` (§5.4 : paracétamol + codéine, + caféine…) qualifie
  un **produit**, jamais une substance : aucune molécule ne porte le code ATC
  d'une association. Portée uniquement par `substance.classe`, cette classe
  reste vide et la règle `ASSOC-30J` ne peut pas se déclencher. Les deux
  colonnes sont donc ajoutées sur la spécialité, et le moteur de règles fait
  correspondre une classe ciblée à celle de la substance **ou** à celle du
  produit.

* `composition.element` — la désignation de l'élément pharmaceutique fait
  partie de la clé. Sans elle, 16 lignes de plaquettes multiphasiques
  (comprimé blanc / comprimé rose d'une même plaquette contraceptive, dosages
  différents) s'écrasent mutuellement. Perdre la moitié d'une plaquette de
  pilule dans une app de suivi de pilule n'est pas envisageable.

* `composition.unite` — unité de prise à laquelle `dose_par_unite` se
  rapporte (comprimé, ml, g). Sans elle, une dose en ml n'est pas
  interprétable.

* `composition.comptee` — désigne la ligne retenue pour le cumul. Rend
  l'invariant « une seule ligne comptée par liaison » structurel au lieu
  d'être une convention de code (voir `composition.py`).
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

SCHEMA = """
PRAGMA journal_mode = OFF;
PRAGMA synchronous  = OFF;

CREATE TABLE substance (
  code        TEXT PRIMARY KEY,
  nom         TEXT NOT NULL,
  atc         TEXT,
  groupe_atc  TEXT,
  classe      TEXT
);

CREATE TABLE specialite (
  cis            TEXT PRIMARY KEY,
  nom            TEXT NOT NULL,
  forme          TEXT,
  voies          TEXT,
  commercialisee INTEGER,
  prescription   TEXT,
  substances     TEXT,
  atc            TEXT,
  classe         TEXT
);

CREATE TABLE presentation (
  cip13     TEXT PRIMARY KEY,
  cis       TEXT NOT NULL REFERENCES specialite(cis),
  libelle   TEXT,
  nb_unites INTEGER
);

CREATE TABLE composition (
  cis            TEXT NOT NULL,
  element        TEXT NOT NULL,
  code_substance TEXT NOT NULL,
  nature         TEXT NOT NULL,
  num_liaison    INTEGER,
  dose_par_unite REAL,
  fiabilite      INTEGER NOT NULL,
  dosage_brut    TEXT,
  unite          TEXT,
  comptee        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (cis, element, code_substance, nature, num_liaison)
) WITHOUT ROWID;

CREATE TABLE meta (cle TEXT PRIMARY KEY, valeur TEXT);
"""

INDEX = """
CREATE INDEX idx_compo_cis      ON composition(cis);
CREATE INDEX idx_compo_comptee  ON composition(cis, comptee);
CREATE INDEX idx_compo_substance ON composition(code_substance) WHERE comptee = 1;
CREATE INDEX idx_pres_cis       ON presentation(cis);
"""

FTS = """
CREATE VIRTUAL TABLE specialite_fts USING fts5(
  nom, substances,
  content='specialite', content_rowid='rowid',
  tokenize='unicode61 remove_diacritics 2'
);
INSERT INTO specialite_fts(rowid, nom, substances)
  SELECT rowid, nom, substances FROM specialite;
INSERT INTO specialite_fts(specialite_fts) VALUES('optimize');
"""


def construire(
    destination: Path,
    *,
    substances: list[tuple],
    specialites: list[tuple],
    presentations: list[tuple],
    compositions: list[tuple],
    meta: dict[str, str],
) -> Path:
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.unlink(missing_ok=True)

    connexion = sqlite3.connect(destination)
    try:
        connexion.executescript(SCHEMA)
        connexion.executemany("INSERT INTO substance VALUES (?,?,?,?,?)", substances)
        connexion.executemany("INSERT INTO specialite VALUES (?,?,?,?,?,?,?,?,?)", specialites)
        connexion.executemany("INSERT INTO presentation VALUES (?,?,?,?)", presentations)
        connexion.executemany(
            "INSERT INTO composition VALUES (?,?,?,?,?,?,?,?,?,?)", compositions
        )
        connexion.executemany(
            "INSERT INTO meta VALUES (?,?)", sorted((c, str(v)) for c, v in meta.items())
        )
        connexion.executescript(INDEX)
        connexion.executescript(FTS)
        connexion.commit()
        connexion.execute("PRAGMA query_only = 0")
        connexion.execute("VACUUM")
        connexion.commit()
    finally:
        connexion.close()
    return destination
