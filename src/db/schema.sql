-- Schéma de `user.db` — spec §5.2.
-- Appliqué par migrations versionnées (`src/db/migrations.ts`).

CREATE TABLE IF NOT EXISTS profil (
  id      TEXT PRIMARY KEY,
  nom     TEXT NOT NULL,
  couleur TEXT,
  cree_le TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS produit (
  id          TEXT PRIMARY KEY,
  profil_id   TEXT NOT NULL REFERENCES profil(id),
  cis         TEXT,                -- NULL si produit libre
  cip13       TEXT,
  -- Élément pharmaceutique retenu quand la spécialité en porte plusieurs
  -- (HUMEX RHUME : comprimé *et* gélule ; plaquette multiphasique). Sans lui,
  -- une prise compterait tous les éléments de la boîte à la fois.
  element     TEXT,
  nom_affiche TEXT NOT NULL,
  mode        TEXT NOT NULL        -- ⚠ R2
              CHECK (mode IN ('prescrit','libre')),
  dose_defaut REAL DEFAULT 1,
  unite       TEXT,
  actif       INTEGER NOT NULL DEFAULT 1,
  cree_le     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS produit_compo_libre (
  produit_id     TEXT NOT NULL REFERENCES produit(id) ON DELETE CASCADE,
  code_substance TEXT,
  nom_substance  TEXT NOT NULL,
  dose_par_unite REAL NOT NULL,
  unite          TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS moment (
  id        TEXT PRIMARY KEY,
  profil_id TEXT NOT NULL REFERENCES profil(id),
  code      TEXT NOT NULL,
  libelle   TEXT NOT NULL,
  heure     TEXT NOT NULL,         -- 'HH:MM'
  ordre     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS plan (
  id           TEXT PRIMARY KEY,
  produit_id   TEXT NOT NULL REFERENCES produit(id) ON DELETE CASCADE,
  mode         TEXT NOT NULL
               CHECK (mode IN ('moments','heures','intervalle')),
  rrule        TEXT NOT NULL,      -- RFC 5545 (+ X-CYCLE, voir occurrences.ts)
  moments      TEXT,               -- JSON [moment_id]
  heures       TEXT,               -- JSON ['21:00']
  intervalle_h REAL,
  dose         REAL NOT NULL,
  debut        TEXT NOT NULL,
  fin          TEXT,
  rappel       INTEGER NOT NULL DEFAULT 1,
  -- Incrémenté à chaque modification : porte le SEQUENCE du .ics (§10.4).
  sequence     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS prise (
  id            TEXT PRIMARY KEY,
  profil_id     TEXT NOT NULL REFERENCES profil(id),
  produit_id    TEXT NOT NULL REFERENCES produit(id),
  occurrence_id TEXT,
  horodatage    TEXT NOT NULL,     -- ISO 8601 avec offset local
  fuseau        TEXT NOT NULL,     -- IANA
  dose          REAL NOT NULL,
  statut        TEXT NOT NULL DEFAULT 'prise'
                CHECK (statut IN ('prise','annulee')),
  saisie_le     TEXT NOT NULL,     -- distingue la saisie a posteriori
  source        TEXT NOT NULL      -- 'manuelle','push','scan','rattrapage'
);
CREATE INDEX IF NOT EXISTS idx_prise ON prise(profil_id, horodatage);

CREATE TABLE IF NOT EXISTS occurrence (
  id        TEXT PRIMARY KEY,
  plan_id   TEXT NOT NULL REFERENCES plan(id) ON DELETE CASCADE,
  profil_id TEXT NOT NULL,
  prevue_le TEXT NOT NULL,         -- ISO 8601 local avec offset
  moment_id TEXT,
  dose      REAL NOT NULL,
  statut    TEXT NOT NULL DEFAULT 'attendue'
            CHECK (statut IN ('attendue','validee','sautee','expiree')),
  prise_id  TEXT REFERENCES prise(id)
);
CREATE INDEX IF NOT EXISTS idx_occ ON occurrence(profil_id, prevue_le);

-- Dénormalisé à l'écriture : évite de joindre catalogue.db à chaque calcul.
-- ⚠ R1 — n'accueille que des lignes de fiabilité ≥ 1, une par liaison.
CREATE TABLE IF NOT EXISTS prise_substance (
  prise_id       TEXT NOT NULL REFERENCES prise(id) ON DELETE CASCADE,
  code_substance TEXT NOT NULL,
  quantite_mg    REAL NOT NULL,
  fiabilite      INTEGER NOT NULL,
  classe         TEXT NOT NULL DEFAULT 'AUTRE',
  PRIMARY KEY (prise_id, code_substance)
);

-- Lignes écartées du cumul, conservées pour que l'UI puisse le dire
-- explicitement plutôt que de taire l'absence (§6.4).
CREATE TABLE IF NOT EXISTS prise_exclusion (
  prise_id      TEXT NOT NULL REFERENCES prise(id) ON DELETE CASCADE,
  nom_substance TEXT NOT NULL,
  dosage_brut   TEXT
);

CREATE TABLE IF NOT EXISTS signal_vu (
  regle_id  TEXT NOT NULL,
  profil_id TEXT NOT NULL,
  vu_le     TEXT NOT NULL,
  valeur    REAL NOT NULL,
  PRIMARY KEY (regle_id, profil_id)
);

CREATE TABLE IF NOT EXISTS reglage (cle TEXT PRIMARY KEY, valeur TEXT);
