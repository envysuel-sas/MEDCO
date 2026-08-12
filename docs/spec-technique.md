# MEDCO — Spécification technique

**Version** 3.1 — 12 août 2026
**Cible** PWA, ~20 utilisateurs, 50 % iOS / 50 % Android
**Hébergement** GitHub Pages + Cloudflare Worker (rappels uniquement)

---

## Sommaire

1. [Cadre](#1-cadre)
2. [Règles non négociables](#2-règles-non-négociables)
3. [Périmètre](#3-périmètre)
4. [Architecture](#4-architecture)
5. [Base de données](#5-base-de-données)
6. [Catalogue et pipeline BDPM](#6-catalogue-et-pipeline-bdpm)
7. [Cumul par substance](#7-cumul-par-substance)
8. [Moteur de règles](#8-moteur-de-règles)
9. [Pilulier](#9-pilulier)
10. [Rappels](#10-rappels)
11. [PWA et installation](#11-pwa-et-installation)
12. [Invariants de design](#12-invariants-de-design)
13. [Scan](#13-scan)
14. [Export](#14-export)
15. [Sécurité](#15-sécurité)
16. [Tests](#16-tests)
17. [Build et CI](#17-build-et-ci)
18. [Lotissement](#18-lotissement)
19. [Annexes](#19-annexes)

---

## 1. Cadre

### 1.1 Le problème

Trois angles morts dans la consommation médicamenteuse courante :

- **Le cumul involontaire par substance.** L'utilisateur raisonne en boîtes, pas en medcos. Doliprane 1000, puis Fervex, puis Actifed Rhume : trois boîtes, une medco, plus de 3 g de paracétamol sans en avoir conscience.
- **La fréquence de prise.** Personne ne sait combien de jours par mois il prend un antalgique.
- **Le traitement quotidien.** Pilule contraceptive, traitement chronique : le semainier papier et le rappel manqué.

### 1.2 La proposition

Un carnet qui couvre l'intégralité du catalogue français, compte **par substance active**, gère le pilulier avec des rappels fiables, et produit un relevé exploitable en consultation.

### 1.3 Contraintes de contexte

Usage personnel, non commercial : pas de marquage CE, pas de RGPD (exemption domestique, aucune donnée n'atteint l'éditeur), pas d'hébergement HDS, pas de mise sur le marché.

Ce qui subsiste (§2) n'est pas juridique : ce sont des règles d'ingénierie et de sécurité utilisateur, qui comptent **davantage** à vingt personnes qu'à cent mille, parce qu'on les connaît.

---

## 2. Règles non négociables

### R1 — Le cumul doit être juste

Voir §7.2 (piège SA/ST) et §6.4 (fiabilité des dosages). Aucune estimation par défaut : une valeur inventée produirait un faux négatif de sécurité.

### R2 — Pas de signal de fréquence sur un traitement prescrit

`produit.mode ∈ {prescrit, libre}`. Les règles `duree_consecutive` et `jours_de_prise` ne s'évaluent que sur `libre`. Les règles de dose s'évaluent sur les deux, avec un message qui renvoie au médecin **sans jamais suggérer de réduire, d'espacer ou d'arrêter**.

Appliqué au niveau du format (§8.2), pas seulement du code.

### R3 — Restituer, pas conclure

Deux faits juxtaposés, aucune phrase de liaison. Ni score, ni taux d'observance, ni jauge de risque. Toute règle porte une `source` non vide et datée.

### R4 — Aucune logique d'oubli de pilule

L'app enregistre l'oubli, affiche l'heure prévue et l'heure réelle, renvoie à la notice ou au pharmacien. Aucune consigne.

---

## 3. Périmètre

### 3.1 V1

Catalogue BDPM complet embarqué · recherche et ajout par nom ou scan · prises ponctuelles et planifiées · multi-profils · cumul par substance · Plaquette 30/90 j · Pilulier (plans, vue jour et semaine, validation groupée) · rappels push + calendrier · relevé PDF · hors ligne intégral.

### 3.2 Reporté

Notices RCP (lien vers la page officielle suffit) · parapharmacie et compléments · stock et péremption · photos · ordonnances · journal de symptômes · fiches d'hygiène de vie · synchronisation multi-appareils.

### 3.3 Hors périmètre définitif

Analyse d'interactions calculée · suggestion thérapeutique · conduite à tenir en cas d'oubli (R4) · taux d'observance.

---

## 4. Architecture

```
┌────────────── APPAREIL ────────────────────────────────┐
│  PWA installée (écran d'accueil obligatoire, §11.1)    │
│  React + Vite · Service Worker · Web Push              │
│                                                         │
│  ┌───────────────────┐  ┌───────────────────────────┐ │
│  │ user.db           │  │ catalogue.db              │ │
│  │ SQLite WASM/OPFS  │  │ SQLite WASM, lecture seule│ │
│  │ prises, produits, │  │ BDPM complète, ~2,5 Mo br │ │
│  │ plans, occurrences│  │ remplacée à chaque MAJ    │ │
│  └───────────────────┘  └───────────────────────────┘ │
└────────┬──────────────────────────┬────────────────────┘
         │ push entrant             │ GET statique
┌────────▼───────────────┐  ┌───────▼────────────────────┐
│ Cloudflare Worker      │  │ GitHub Pages               │
│ Cron Triggers 1 min    │  │ app + bundles + manifest   │
│ KV : endpoint, heure,  │  └───────▲────────────────────┘
│      blob chiffré      │          │
│ webcal:// (iOS)        │  ┌───────┴────────────────────┐
└────────────────────────┘  │ GitHub Actions, cron hebdo │
                            │ BDPM → bundle → commit     │
                            └────────────────────────────┘
```

Aucun VPS. Le pipeline BDPM tourne dans Actions et ne traite que des données publiques.

### 4.1 Stack

| Couche | Choix | Note |
|---|---|---|
| Build | Vite, React 19, TypeScript strict | |
| PWA | `vite-plugin-pwa` (Workbox) | |
| Base | `@sqlite.org/sqlite-wasm`, VFS **`opfs-sahpool`** | ⚠ Voir §5.5 — le VFS `opfs` par défaut est inutilisable sur GitHub Pages |
| Requêtes | SQL direct, wrapper typé maison | Drizzle possible, pas indispensable |
| État | Zustand | |
| Routage | React Router | Historique géré explicitement (§11.4) |
| Scan | `BarcodeDetector` si dispo, sinon `zbar-wasm` | |
| PDF | Impression navigateur → PDF | `pdf-lib` si insuffisant |
| Graphiques | SVG maison | Aucune librairie de charts |
| Push | Web Push API + VAPID | |
| Worker | Cloudflare Workers + KV + Cron Triggers | Plan gratuit suffisant |
| Pipeline | Python 3.12, `polars` | Dans GitHub Actions |
| Tests | Vitest | |

---

## 5. Base de données

### 5.1 `catalogue.db` — lecture seule, remplaçable

```sql
CREATE TABLE substance (
  code        TEXT PRIMARY KEY,
  nom         TEXT NOT NULL,
  atc         TEXT,
  groupe_atc  TEXT,        -- 1re lettre ATC — pilote la couleur (§12.2)
  classe      TEXT         -- cible des règles de fréquence (§5.4)
);

CREATE TABLE specialite (
  cis            TEXT PRIMARY KEY,
  nom            TEXT NOT NULL,
  forme          TEXT,
  voies          TEXT,
  commercialisee INTEGER,
  prescription   TEXT      -- 'PMO' | 'PMF' | NULL
);

CREATE TABLE presentation (
  cip13     TEXT PRIMARY KEY,
  cis       TEXT NOT NULL REFERENCES specialite(cis),
  libelle   TEXT,
  nb_unites INTEGER
);

CREATE TABLE composition (
  cis            TEXT NOT NULL,
  code_substance TEXT NOT NULL,
  nature         TEXT NOT NULL,    -- 'SA' | 'ST'  ⚠ §7.2
  num_liaison    INTEGER,
  dose_par_unite REAL,             -- mg par unité de prise
  fiabilite      INTEGER NOT NULL, -- 0 non calculable · 1 dérivé · 2 direct
  dosage_brut    TEXT,
  PRIMARY KEY (cis, code_substance, nature, num_liaison)
);

CREATE INDEX idx_compo_cis ON composition(cis);
CREATE INDEX idx_pres_cis  ON presentation(cis);

CREATE VIRTUAL TABLE specialite_fts USING fts5(
  nom, substances,
  content='specialite', content_rowid='rowid',
  tokenize='unicode61 remove_diacritics 2'
);

CREATE TABLE meta (cle TEXT PRIMARY KEY, valeur TEXT);
-- version, date_bdpm, date_build, nb_specialites
```

### 5.2 `user.db` — OPFS

```sql
CREATE TABLE profil (
  id      TEXT PRIMARY KEY,
  nom     TEXT NOT NULL,
  couleur TEXT,
  cree_le TEXT NOT NULL
);

CREATE TABLE produit (
  id          TEXT PRIMARY KEY,
  profil_id   TEXT NOT NULL REFERENCES profil(id),
  cis         TEXT,                -- NULL si produit libre
  cip13       TEXT,
  nom_affiche TEXT NOT NULL,
  mode        TEXT NOT NULL        -- ⚠ R2
              CHECK (mode IN ('prescrit','libre')),
  dose_defaut REAL DEFAULT 1,
  unite       TEXT,                -- 'comprimé','sachet','ml','gélule','dose'
  actif       INTEGER NOT NULL DEFAULT 1,
  cree_le     TEXT NOT NULL
);

CREATE TABLE produit_compo_libre (
  produit_id     TEXT NOT NULL REFERENCES produit(id) ON DELETE CASCADE,
  code_substance TEXT,
  nom_substance  TEXT NOT NULL,
  dose_par_unite REAL NOT NULL,
  unite          TEXT NOT NULL
);

CREATE TABLE moment (
  id        TEXT PRIMARY KEY,
  profil_id TEXT NOT NULL REFERENCES profil(id),
  code      TEXT NOT NULL,         -- 'matin','midi','soir','coucher', libre
  libelle   TEXT NOT NULL,
  heure     TEXT NOT NULL,         -- 'HH:MM'
  ordre     INTEGER NOT NULL
);

CREATE TABLE plan (
  id           TEXT PRIMARY KEY,
  produit_id   TEXT NOT NULL REFERENCES produit(id) ON DELETE CASCADE,
  mode         TEXT NOT NULL       -- 'moments' | 'heures' | 'intervalle'
               CHECK (mode IN ('moments','heures','intervalle')),
  rrule        TEXT NOT NULL,      -- RFC 5545
  moments      TEXT,               -- JSON [moment_id]
  heures       TEXT,               -- JSON ['21:00']
  intervalle_h REAL,
  dose         REAL NOT NULL,
  debut        TEXT NOT NULL,
  fin          TEXT,
  rappel       INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE occurrence (
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
CREATE INDEX idx_occ ON occurrence(profil_id, prevue_le);

CREATE TABLE prise (
  id            TEXT PRIMARY KEY,
  profil_id     TEXT NOT NULL REFERENCES profil(id),
  produit_id    TEXT NOT NULL REFERENCES produit(id),
  occurrence_id TEXT REFERENCES occurrence(id),
  horodatage    TEXT NOT NULL,     -- ISO 8601 avec offset local
  fuseau        TEXT NOT NULL,     -- IANA
  dose          REAL NOT NULL,
  statut        TEXT NOT NULL DEFAULT 'prise'
                CHECK (statut IN ('prise','annulee')),
  saisie_le     TEXT NOT NULL,     -- distingue la saisie a posteriori
  source        TEXT NOT NULL      -- 'manuelle','push','scan','rattrapage'
);
CREATE INDEX idx_prise ON prise(profil_id, horodatage);

-- Dénormalisé à l'écriture : évite de joindre catalogue.db à chaque calcul
CREATE TABLE prise_substance (
  prise_id       TEXT NOT NULL REFERENCES prise(id) ON DELETE CASCADE,
  code_substance TEXT NOT NULL,
  quantite_mg    REAL NOT NULL,
  fiabilite      INTEGER NOT NULL,
  PRIMARY KEY (prise_id, code_substance)
);

CREATE TABLE signal_vu (
  regle_id  TEXT NOT NULL,
  profil_id TEXT NOT NULL,
  vu_le     TEXT NOT NULL,
  valeur    REAL NOT NULL,
  PRIMARY KEY (regle_id, profil_id)
);

CREATE TABLE reglage (cle TEXT PRIMARY KEY, valeur TEXT);
```

### 5.3 Ouverture des deux bases

`catalogue.db` est attachée en lecture seule :

```sql
ATTACH DATABASE 'file:catalogue.db?mode=ro' AS cat;
PRAGMA cat.query_only = 1;
```

Les jointures s'écrivent alors naturellement (`prise.produit_id → produit.cis → cat.composition`).

⚠ Le catalogue **ne se remplace pas** par substitution de fichier : le VFS retenu ne l'autorise pas. Voir §5.5.

### 5.4 Classes de substance

Enrichissement produit par le pipeline, adossé à l'ATC. Cible des règles de fréquence (§8).

| Classe | Contenu | Repère jours/mois |
|---|---|---|
| `ANTALGIQUE_SIMPLE` | paracétamol, ibuprofène, kétoprofène, aspirine, naproxène | 15 |
| `ANTALGIQUE_ASSOCIATION` | paracétamol + codéine / opium / caféine / tramadol | 10 |
| `OPIOIDE` | codéine, tramadol, opium, morphiniques | 10 |
| `TRIPTAN` | sumatriptan, zolmitriptan… | 10 |
| `ERGOTAMINE` | dérivés ergotés | 10 |
| `DECONGESTIONNANT_NASAL` | oxymétazoline, tuaminoheptane, éphédrine | durée consécutive |
| `LAXATIF_STIMULANT` | bisacodyl, séné, docusate | durée consécutive |
| `AUTRE` | défaut | — |

### 5.5 ⚠ Choix du VFS OPFS

SQLite WASM propose plusieurs VFS OPFS. **Le choix n'est pas libre ici.**

Le VFS `opfs` par défaut s'appuie sur `SharedArrayBuffer` et `Atomics.wait` pour rendre synchrones des opérations asynchrones. Cela exige les en-têtes de réponse `Cross-Origin-Opener-Policy` et `Cross-Origin-Embedder-Policy` — **que GitHub Pages ne permet pas de définir.** Symptôme : `Cannot install OPFS: Missing SharedArrayBuffer and/or Atomics`.

**Le projet utilise `opfs-sahpool`** (SyncAccessHandle Pool), qui ne requiert aucun en-tête particulier et offre les meilleures performances des VFS OPFS.

Trois conséquences à intégrer dès la conception :

**1. Pas de transparence du système de fichiers.** Les fichiers sont stockés dans un pool opaque, sous des noms internes. On ne peut pas écrire `catalogue.sqlite` dans OPFS puis l'ouvrir par son chemin. Le bundle téléchargé doit être importé :

```ts
const poolUtil = await sqlite3.installOpfsSAHPoolVfs({ name: 'medco' });
await poolUtil.importDb('/catalogue.db', octetsDuBundle);  // Uint8Array
```

Le remplacement d'un bundle passe donc par `importDb()` sur le même nom, pas par une substitution de fichier.

**2. Une seule connexion simultanée.** Le VFS prend un verrou exclusif. La connexion vit dans un Web Worker unique, propriétaire ; l'UI communique par messages. Aucun second accès concurrent n'est possible.

**Conséquence PWA à traiter explicitement :** si l'utilisateur ouvre l'app dans un second onglet, l'initialisation du VFS échoue. Détecter le cas (`navigator.locks` ou `BroadcastChannel`) et afficher un écran dédié — `L'application est déjà ouverte dans un autre onglet` — plutôt que de laisser remonter une erreur brute.

**3. Capacité du pool à provisionner.** Le pool alloue un nombre fixe de fichiers à l'installation (`initialCapacity`). Deux bases plus les fichiers temporaires de SQLite : prévoir large, et gérer l'agrandissement via `addCapacity()`.

Le `ATTACH` de §5.3 reste valide : c'est **une** connexion avec deux fichiers attachés, pas deux connexions.

---

## 6. Catalogue et pipeline BDPM

### 6.1 Tout est embarqué

**Il n'existe pas d'API BDPM officielle interrogeable depuis un navigateur** : la source officielle publie des fichiers et des pages HTML, sans en-têtes CORS. Dépendre d'une API tierce gratuite pour une fonction de sécurité est exclu.

Sans les RCP, le catalogue tient largement :

| Table | Lignes | |
|---|---|---|
| substance | ~3 000 | |
| specialite | ~15 800 | |
| presentation | ~40 000 | |
| composition (SA seules) | ~30 000 | |
| **SQLite** | | **~12 Mo** |
| **Brotli** | | **~2,5 Mo** |

Téléchargé au premier lancement, stocké en OPFS. Le cumul par substance ne dépend jamais du réseau.

### 6.2 Fichiers sources

| Fichier | Usage |
|---|---|
| `CIS_bdpm.txt` | Spécialités |
| `CIS_CIP_bdpm.txt` | Présentations, CIP13 |
| `CIS_COMPO_bdpm.txt` | Composition — **fichier critique** |
| `CIS_CPD_bdpm.txt` | Conditions de prescription → PMO/PMF |
| `CIS_GENER_bdpm.txt` | Groupes génériques |

Caractéristiques : encodage hérité (ISO-8859-1 / Windows-1252, à détecter), séparateur tabulation, **pas de ligne d'en-tête**, dates `JJ/MM/AAAA`, tabulations parasites dans certains champs texte, clés non systématiquement uniques.

Référence utile pour valider le parseur : [`api-bdpm-graphql`](https://github.com/axel-op/api-bdpm-graphql) documente une partie de ces écueils.

### 6.3 Chaîne de production

```
GitHub Actions, cron hebdomadaire
  1. Télécharger les fichiers BDPM
  2. Détecter l'encodage → UTF-8
  3. Parser (polars), typer, normaliser les dates
  4. Normaliser les dosages → fiabilité (§6.4)
  5. Enrichir ATC → groupe_atc + classe
  6. Construire le SQLite, VACUUM, index, FTS5
  7. Contrôles bloquants (§6.5)
  8. Brotli + SHA-256
  9. Commit dans /public/bundles + mise à jour manifest.json
```

### 6.4 Normalisation des dosages

`dosage_libelle` est un champ texte libre. Trois niveaux :

| Fiabilité | Exemples | Comportement |
|---|---|---|
| **2 — direct** | `500 mg` · `1 g` · `50 microgrammes` · `400,00 mg` (virgule décimale) | Compté |
| **1 — dérivé** | `5 mg/ml` + `ref_dosage: un ml` | Compté, mention « valeur dérivée » |
| **0 — non calculable** | `quantité correspondant à…` · titrage en UI sans équivalence massique · formes composées | **Non compté.** Prise enregistrée, UI : `Dosage non exploitable — cette prise n'entre pas dans le cumul` |

Objectif : fiabilité ≥ 1 sur **95 % des formes orales sèches** (comprimés, gélules, sachets). Métrique produite et contrôlée à chaque build.

### 6.5 Contrôles bloquants du build

Le bundle n'est pas publié si :

- spécialités hors de 12 000 – 20 000
- variation > 5 % vs bundle précédent
- fiabilité < 95 % sur formes orales sèches
- un `num_liaison` sans ligne `SA` correspondante
- couverture ATC < 100 % sur les substances portant une règle
- un cas du jeu doré échoue

### 6.6 Licence

La BDPM est sous licence ouverte, avec obligation de **mentionner la source et la date de mise à jour** et de ne pas altérer les données. Un écran « Sources » affiche `Données BDPM du JJ/MM/AAAA`, repris en pied du relevé PDF.

---

## 7. Cumul par substance

> Cœur du produit. Toute erreur ici invalide le reste.

### 7.1 Écriture

À l'enregistrement d'une prise :

```
pour chaque ligne de composition de la spécialité
  ne garder que nature = 'SA'                    ← §7.2
  quantite_mg = dose_par_unite × prise.dose
  insérer dans prise_substance (avec fiabilite)
```

Les lignes de `fiabilite = 0` ne sont **pas** insérées : la prise existe, elle n'entre pas dans le cumul, et l'UI le signale.

### 7.2 ⚠ Le piège SA / ST

`CIS_COMPO_bdpm.txt` contient deux natures de lignes, reliées par `num_liaison` :

- **SA** — substance active
- **ST** — substance thérapeutique (fraction thérapeutique, ex. la base d'un sel)

**Sommer les deux double le comptage.** C'est l'erreur qui rendrait l'app plus dangereuse que son absence.

**Règle : ne compter que `SA`.** Les lignes `ST` servent à l'affichage informatif et n'entrent jamais dans `prise_substance`. Le pipeline échoue si un `num_liaison` n'a pas de ligne `SA`.

### 7.3 Lecture

```sql
-- Cumul sur fenêtre glissante
SELECT ps.code_substance, SUM(ps.quantite_mg) AS mg
FROM prise p
JOIN prise_substance ps ON ps.prise_id = p.id
WHERE p.profil_id = ?1 AND p.statut = 'prise'
  AND p.horodatage >= ?2 AND p.horodatage < ?3
GROUP BY ps.code_substance;

-- Jours de prise (règles de fréquence)
SELECT COUNT(DISTINCT date(p.horodatage)) AS nb_jours
FROM prise p
JOIN prise_substance ps ON ps.prise_id = p.id
JOIN cat.substance s    ON s.code = ps.code_substance
JOIN produit pr         ON pr.id = p.produit_id
WHERE p.profil_id = ?1 AND p.statut = 'prise'
  AND s.classe IN (?2)
  AND pr.mode = 'libre'                    -- ⚠ R2, non négociable
  AND p.horodatage >= date('now','-30 days');
```

### 7.4 Temps

- **Fenêtre 24 h glissante** (`PT24H`), pas calendaire : le cumul nocturne ne se réinitialise pas à minuit.
- **Comptages de jours** : jour calendaire local, dans le fuseau enregistré sur la prise. Ne jamais normaliser en UTC pour ces comptages.

### 7.5 Pureté

Le module `src/domain/cumul.ts` n'accède ni à la base, ni à l'UI, ni à `Date.now()`. Signature :

```ts
type Instant = string; // ISO 8601

function cumulParSubstance(
  prises: PriseAvecSubstances[],
  fenetre: { debut: Instant; fin: Instant }
): Map<CodeSubstance, { mg: number; fiabiliteMin: number }>;
```

---

## 8. Moteur de règles

### 8.1 Format

`data/regles.json`, versionné, chaque règle avec sa source datée.

```json
{
  "version": "2026.08.01",
  "regles": [
    {
      "id": "PARA-24H",
      "type": "cumul_fenetre",
      "cible": { "substance": "<code_paracetamol>" },
      "mode": ["prescrit", "libre"],
      "fenetre": "PT24H",
      "seuil": 3000,
      "unite": "mg",
      "niveau": "vigilance",
      "message": "MSG_PARA_24H",
      "source": {
        "libelle": "ANSM — Bon usage du paracétamol et des AINS",
        "url": "https://ansm.sante.fr/...",
        "consulte_le": "2026-07-27"
      }
    }
  ]
}
```

### 8.2 Types et validation

| Type | Sémantique | Modes autorisés |
|---|---|---|
| `cumul_fenetre` | Somme sur fenêtre glissante | tous |
| `dose_unitaire` | Quantité d'une prise | tous |
| `intervalle_min` | Délai entre deux prises | tous |
| `duree_consecutive` | Jours consécutifs avec prise | **`libre` seul** |
| `jours_de_prise` | Jours distincts sur fenêtre | **`libre` seul** |

Le validateur de bundle **rejette** toute règle `duree_consecutive` ou `jours_de_prise` incluant `prescrit`, et toute règle sans `source.url` et `source.consulte_le`.

**Aucun opérateur de croisement inter-produits n'existe dans le schéma.** C'est ce qui empêche structurellement une dérive vers l'analyse d'interactions.

### 8.3 Jeu V1

Valeurs indicatives — **à revérifier à la source et dater avant intégration**.

| ID | Type | Cible | Seuil | Mode |
|---|---|---|---|---|
| `PARA-24H` | cumul `PT24H` | paracétamol | 3 000 mg | tous |
| `PARA-PRISE` | dose unitaire | paracétamol | 1 000 mg | tous |
| `PARA-INTERVALLE` | intervalle min | paracétamol | 4 h | tous |
| `IBU-24H` | cumul `PT24H` | ibuprofène | 1 200 mg | libre |
| `IBU-DUREE` | durée consécutive | ibuprofène | 5 j | libre |
| `ASPI-24H` | cumul `PT24H` | aspirine | 3 000 mg | libre |
| `ANTALG-30J` | jours de prise `P30D` | classe `ANTALGIQUE_SIMPLE` | 15 j | libre |
| `ASSOC-30J` | jours de prise `P30D` | `ASSOCIATION`, `OPIOIDE`, `TRIPTAN`, `ERGOTAMINE` | 10 j | libre |
| `DECONG-DUREE` | durée consécutive | `DECONGESTIONNANT_NASAL` | 5 j | libre |

### 8.4 Évaluation

Pure, sans effet de bord :

```ts
function evaluer(
  contexte: { prises: PriseAvecSubstances[]; produits: Produit[] },
  regles: Regle[],
  maintenant: Instant
): Signal[];
```

Déclenchée à chaque enregistrement (< 50 ms), à l'ouverture de l'app, et une fois par jour.

### 8.5 Anti-répétition

Un même couple `(regle_id, profil_id)` ne produit pas plus d'un signal visible par période. Un signal acquitté (`signal_vu`) ne réapparaît qu'au franchissement d'un nouveau seuil.

### 8.6 Affichage

Trois blocs, dans cet ordre, jamais un quatrième :

```
18 jours avec prise d'antalgique sur 30.           ← le chiffre de l'utilisateur

Les recommandations situent à 15 jours par mois     ← le repère publié, cité
le seuil au-delà duquel une prise répétée
est signalée.

Source ANSM · consultée le 27/07/2026 ↗            ← la source, cliquable
```

Aucune phrase ne relie les deux premiers blocs (R3).

---

## 9. Pilulier

### 9.1 Occurrences matérialisées

Les plans génèrent des `occurrence` en base plutôt que d'être recalculés à la volée. Trois raisons : le Worker doit connaître les horaires sans exécuter de moteur de récurrence ; l'historique reste exact si un plan est modifié ; le calendrier `.ics` se génère directement depuis la table.

```
Horizon         : J+60
Régénération    : à la création/modification d'un plan, puis à chaque ouverture
Modification    : occurrences futures régénérées, occurrences passées intactes
```

### 9.2 Modes de plan

| Mode | Définition | Usage type |
|---|---|---|
| `moments` | Rattaché aux moments du profil | Traitement chronique |
| `heures` | Heures absolues | **Pilule** — 21:00 quotidien |
| `intervalle` | Toutes les N heures depuis la première prise | Antibiotique |

Récurrence des jours portée par une `RRULE` RFC 5545 : quotidien, jours de semaine, cycles 21/7.

### 9.3 Validation

| Action | Effet |
|---|---|
| Valider | `statut = validee`, création de la `prise` liée |
| Valider un moment entier | Transaction unique sur toutes ses occurrences |
| Sauter | `statut = sautee`, aucune prise |
| Valider à une heure passée | `horodatage` ajusté, `saisie_le` conservé |
| Sans action à J+1 | `statut = expiree`, **sans notification, sans badge, sans compteur** |

`Tout valider` est indispensable : personne ne fait sept appuis chaque matin.

Aucun taux d'observance n'est calculé ni affiché (R3).

---

## 10. Rappels

> Section critique. Une pilule contraceptive est en jeu : **aucun canal unique n'est suffisant.**

### 10.1 Le problème

Le web n'a **aucune API de notification programmée**. Le service worker ne se réveille que sur un push entrant ; aucun minuteur ne survit à la fermeture de l'app. « Push programmé » signifie donc toujours qu'un émetteur externe envoie à l'heure dite.

### 10.2 Trois couches

| Couche | iOS | Android | Rôle |
|---|---|---|---|
| **Calendrier** | `webcal://` abonné, un tap, resynchronisation auto | Export `.ics` manuel — Google Agenda mobile n'accepte pas les URL | **Garantie** — alarme gérée par l'OS, indépendante du réseau, du Worker et de l'app |
| **Web Push** | iOS 16.4+, **PWA installée obligatoire** | Chrome / FCM, solide | **Actionnable** — validation en un tap |
| **Rattrapage** | à l'ouverture + `setAppBadge()` | idem | **Filet** |

Pour la pilule, la couche calendrier est **activée par défaut et non désactivable sans confirmation explicite**.

### 10.3 Le Worker aveugle

Cloudflare Workers, plan gratuit : Cron Triggers à la minute, 100 000 requêtes/jour.

```
KV  key:   sub:<uuid>
    value: {
      endpoint, p256dh, auth,     ← abonnement push, opaque
      tz: "Europe/Paris",
      slots: ["21:00"],           ← une heure, pas un diagnostic
      rrule: "FREQ=DAILY",
      payload: "<blob AES-GCM chiffré côté client>"
    }
```

Le Worker sait qu'un endpoint veut un ping à 21 h. Il ne peut pas savoir que c'est une pilule : le contenu est chiffré par l'app, la clé n'est jamais transmise, et le service worker déchiffre à réception.

Cron chaque minute → sélection des slots correspondant à l'heure locale de chaque abonnement → envoi Web Push (VAPID).

### 10.4 Génération du calendrier

```
BEGIN:VEVENT
UID:medco-<plan_id>@<domaine>       ← stable, permet la mise à jour
SEQUENCE:<incrémenté à chaque modification du plan>
DTSTART;TZID=Europe/Paris:20260803T210000
RRULE:FREQ=DAILY
SUMMARY:Rappel                          ← neutre, jamais de nom de médicament
BEGIN:VALARM
TRIGGER:PT0M
ACTION:DISPLAY
END:VALARM
END:VEVENT
```

**Piège de la réimportation :** la déduplication repose sur `UID` + `SEQUENCE`. Apple Calendar gère correctement ; Google Agenda beaucoup moins et produit des alarmes en double. D'où l'abonnement `webcal://` privilégié sur iOS, et sur Android un avertissement explicite invitant à supprimer l'ancien import avant d'en charger un nouveau.

`SUMMARY` reste neutre : l'entrée est visible par toute personne à qui l'utilisateur partage son agenda.

### 10.5 Répétition

Un rappel, une seule relance à +15 min si l'occurrence reste `attendue`, puis silence. Aucune relance au-delà, aucune notification d'engagement.

---

## 11. PWA et installation

### 11.1 L'installation est un préalable

Sans installation sur l'écran d'accueil :

- **iOS** — pas de Push API du tout, et le stockage tombe sous la purge à 7 jours de Safari ;
- **Android** — dégradé mais fonctionnel.

L'app **refuse de créer un profil** tant qu'elle n'est pas installée. Un journal de pilule dans un onglet Safari est un piège.

### 11.2 Deux parcours d'installation

| | iOS | Android |
|---|---|---|
| Invite | Aucune — instructions manuelles | `beforeinstallprompt` → un bouton |
| Navigateur | **Safari uniquement** | Chrome |
| Navigateur intégré (WhatsApp, Instagram, Gmail) | Option absente → détecter et proposer « Ouvrir dans Safari » | Généralement OK |

Détection : `navigator.standalone` (iOS) et `window.matchMedia('(display-mode: standalone)')`.

### 11.3 Persistance du stockage

`navigator.storage.persist()` appelé **à chaque ouverture** — la permission n'est pas durable sur Safari. Safari l'accorde généralement aux PWA installées, Chrome selon l'engagement.

Reste hors de contrôle : iOS purge en cas d'espace disque insuffisant, et vider l'historique Safari efface le stockage de la PWA. D'où un export chiffré proposé toutes les deux semaines.

### 11.4 Détails d'intégration

```
manifest    display: standalone · theme_color · background_color
            icons 192/512 maskable
iOS         apple-touch-icon 180×180
            apple-mobile-web-app-status-bar-style: black-translucent
            écrans de lancement générés par taille d'appareil
            (iOS ne les dérive pas du manifest)
CSS         env(safe-area-inset-*) sur toutes les barres
            overscroll-behavior: none        → supprime le rebond élastique
            -webkit-touch-callout: none      → supprime le menu au appui long
            -webkit-tap-highlight-color: transparent
            user-select: none hors champs de saisie
Android     bouton retour matériel : gestion explicite de l'historique,
            sinon il éjecte de l'app depuis n'importe quel écran
Navigation  View Transitions API, aucun flash blanc
Badge       navigator.setAppBadge(n) — prises en attente
```

---

## 12. Invariants de design

> La maquette (`docs/maquette/`) fait foi sur l'esthétique. Cette section liste ce qui doit survivre **quelle que soit** la direction visuelle retenue, parce que ce sont des choix fonctionnels, pas décoratifs.

### 12.1 Interdits

| Interdit | Raison |
|---|---|
| Séries, streaks, badges de régularité | Absurde sur de l'automédication, culpabilisant pour le patient chronique qui « casse » sa série |
| Compteur « X jours sans » | Registre d'abstinence — transforme un antalgique légitime en écart de conduite |
| Rouge, triangles d'avertissement, vibration d'alerte | Induit une urgence médicale que l'app ne peut pas établir |
| Score, taux d'observance, jauge de risque | R3 |
| Jauge circulaire pour un cumul | Un cercle suggère un objectif à atteindre. Jauge **linéaire** avec le repère en graduation |
| Confettis, animation de récompense | Célébrer une prise de médicament n'a pas de sens |

### 12.2 Couleur = groupe ATC

La couleur d'une substance est déterminée par la **première lettre de son code ATC**, pas par un choix esthétique. Sur une grille de 30 jours, on voit quelle famille domine le mois — c'est de l'information, pas de la décoration.

```
N  système nerveux — antalgiques, triptans, opioïdes
M  muscle et squelette — AINS
A  voies digestives et métabolisme — IPP, antiacides
R  système respiratoire — antihistaminiques, décongestionnants
J  anti-infectieux
C  système cardiovasculaire
G  génito-urinaire, hormones sexuelles — pilule
D  dermatologie
_  sans ATC
```

Variation intra-groupe par hachage stable du code substance (±14 % de luminosité, teinte inchangée) : deux antalgiques sont distincts mais visiblement apparentés. La dérivation doit être **stable entre versions**.

Les teintes exactes viennent de la maquette. La **correspondance groupe → teinte** est fixe.

### 12.3 Vocabulaire

Le mot est **« repère »**, jamais « limite », « maximum » ni « objectif ». Un dépassement n'est pas un échec.

Interdits dans le texte rédigé : `vous devriez`, `trop`, `excessif`, `anormal`, `votre risque`, `bravo`, `continuez comme ça`.

Le texte cité d'une source institutionnelle est visuellement distingué du texte de l'app (dans la direction ALVÉOLE d'origine : sérif contre grotesque — libre à la maquette de choisir un autre marqueur, mais il doit exister).

### 12.4 Contrainte de saisie

**Enregistrer une prise en moins de cinq secondes** depuis l'écran verrouillé. Deux appuis dans le cas courant : produit récent, puis Enregistrer. Cette contrainte prime sur toute considération de mise en page.

---

## 13. Scan

Les boîtes françaises portent un **Datamatrix GS1** :

| AI | Contenu |
|---|---|
| `01` | GTIN-14 — les 13 derniers chiffres correspondent au **CIP13** (préfixe `3400`) |
| `17` | Péremption `AAMMJJ` |
| `10` | Lot |
| `21` | Numéro de série |

**Traitement :** décodage → parsing GS1 avec gestion du séparateur `FNC1` / `<GS>` (0x1D) pour les AI de longueur variable → extraction du GTIN → CIP13 → recherche dans `catalogue.db`.

`BarcodeDetector` natif sur Chrome Android (rapide). Absent sur Safari → `zbar-wasm`. Détection de fonctionnalité, deux chemins.

Numéro de série et lot **ni stockés ni transmis**.

Le scan est un confort : trois chemins équivalents en permanence (scan, recherche texte, saisie libre). Une caméra refusée ne dégrade aucun parcours.

---

## 14. Export

### 14.1 Relevé de consommation

Généré localement, impression navigateur vers PDF.

```
1. SYNTHÈSE PAR SUBSTANCE ACTIVE
   Substance · jours de prise · quantité totale · maximum journalier
2. RÉPARTITION DANS LE TEMPS
   Plaquette 30 ou 90 j (SVG)
3. PRODUITS ENREGISTRÉS
   Nom · CIS · mode (prescrit / libre)
4. TRAITEMENTS PLANIFIÉS        (si pilulier actif)
5. DÉTAIL DES PRISES            (annexe, optionnel)

MENTIONS
Données déclaratives saisies par l'utilisateur, non vérifiées.
Référentiel BDPM du JJ/MM/AAAA. Règles version X.
```

**Aucune conclusion, aucune mise en regard d'un seuil dans la synthèse.** Des chiffres, une période, une méthode.

### 14.2 Sauvegarde

Archive chiffrée par phrase de passe (Argon2id → AES-256-GCM), destination au choix de l'utilisateur via le sélecteur de fichiers.

**Une phrase de passe perdue rend l'archive irrécupérable.** Avertissement explicite à la création — aucun mécanisme de récupération n'existe ni ne peut exister.

---

## 15. Sécurité

À cette échelle, la menace réaliste est un téléphone perdu ou prêté, pas une attaque ciblée.

| Mesure | Mise en œuvre |
|---|---|
| Verrouillage | **WebAuthn PRF** — déverrouillage biométrique par passkey, clé dérivée jamais stockée. Repli : phrase de passe + Argon2 (WASM) |
| Chiffrement | AES-GCM applicatif sur les champs sensibles. OPFS n'offre pas de chiffrement natif : c'est un cran en dessous d'un Keychain, à assumer |
| Clé en mémoire | Session uniquement, effacée à la fermeture |
| Payload push | Chiffré côté client, illisible par le Worker |
| Journaux | Aucun `console.*` sur un objet `prise`, `produit` ou `profil`, même en développement |
| Télémétrie | Aucune |

---

## 16. Tests

Le domaine — cumul, règles, occurrences — est **pur** : testable sans base, sans UI, avec injection de l'instant.

| Périmètre | Cible |
|---|---|
| `domain/cumul` | 100 % de branches |
| `domain/regles` | 100 % de branches |
| `domain/occurrences` | 100 % de branches |
| Reste | au jugé |

### 16.1 Jeu doré — non négociable

**Cumul**

| Cas | Attendu |
|---|---|
| 1 × Doliprane 1000 | 1 000 mg paracétamol |
| 3 × Doliprane 1000 sur 24 h | 3 000 mg → `PARA-24H` atteint |
| 2 × Doliprane 1000 + 2 Fervex (500 mg) | 3 000 mg — **cas fondateur** |
| Doliprane + Actifed Rhume + Humex | Cumul correct, aucune substance omise |
| Spécialité avec lignes SA et ST | Comptée **une seule fois** |
| Sirop dosé en mg/ml, dose en ml | Conversion correcte |
| Dosage `fiabilite = 0` | Prise enregistrée, exclue du cumul, signalée |
| Prise 23 h + prise 1 h | Même fenêtre `PT24H` |
| Prise annulée | Exclue de tous les calculs |
| Changement de fuseau en cours de période | Jours calendaires cohérents |

**Invariants**

| Cas | Attendu |
|---|---|
| Produit `prescrit`, 20 jours de prise sur 30 | **Aucun signal de fréquence** (R2) |
| Produit `libre`, 16 jours sur 30 | `ANTALG-30J` déclenché |
| Règle `jours_de_prise` avec `mode: ['prescrit']` | Bundle **rejeté** à la validation |
| Règle sans `source.url` | Bundle **rejeté** |

**Occurrences**

| Cas | Attendu |
|---|---|
| Plan quotidien 1 heure sur 60 j | 60 occurrences |
| `RRULE` cyclique 21/7 | Interruption correcte |
| Modification rétroactive d'un plan | Passé intact, futur régénéré |
| Passage à l'heure d'hiver | Aucune occurrence dupliquée ni perdue |
| Occurrence non traitée à J+1 | `expiree`, aucun compteur visible |

### 16.2 Tests sur appareils réels

Non automatisables, à valider manuellement sur les deux plateformes :

- installation depuis Safari et depuis Chrome ;
- réception d'un push sur PWA iOS installée ;
- réception d'un push Android en doze mode ;
- import `.ics` sur Apple Calendar **et** sur Google Agenda ;
- réimportation après modification de plan — **contrôle des doublons d'alarme** ;
- persistance du stockage après une semaine sans ouverture.

**Un iPhone et un Android physiques sont indispensables.** Les simulateurs mentent précisément sur ces points.

---

## 17. Build et CI

### 17.1 Structure

```
/src
  /domain         cumul, règles, occurrences — PUR
  /db             SQLite WASM, schéma, migrations
  /ui             composants, écrans
  /pwa            service worker, installation, push
/worker           Cloudflare Worker (push + webcal)
/pipeline         ingestion BDPM (Python)
/data             regles.json
/public/bundles   catalogue-<date>.sqlite.br, manifest.json
/docs             spec-technique.md, maquette/
```

### 17.2 Workflows

| Fichier | Déclencheur | Rôle |
|---|---|---|
| `deploy.yml` | push sur `main` | lint → typecheck → test → build → GitHub Pages |
| `catalogue.yml` | cron hebdomadaire | ingestion BDPM → contrôles → commit des bundles |
| `worker.yml` | push sur `worker/**` | déploiement Cloudflare |

Le jeu doré est **bloquant** dans `deploy.yml`.

### 17.3 Distribution

Un lien, domaine personnalisé sur GitHub Pages. Mise à jour instantanée à chaque déploiement, sans action des utilisateurs.

Limite : GitHub Pages plafonne à ~100 Go/mois. Avec ~2,5 Mo de bundle et 20 personnes, sans objet.

---

## 18. Lotissement

| Lot | Contenu | Durée |
|---|---|---|
| **L0** | Pipeline BDPM dans Actions, bundle, normalisation des dosages | 1,5 sem. |
| **L1** | SQLite WASM/OPFS, schéma, cumul, règles, **jeu doré complet** | 2 sem. |
| **L2** | Écrans, Plaquette, saisie rapide, design depuis la maquette | 2 sem. |
| **L3** | Pilulier, plans, occurrences | 1 sem. |
| **L4** | Worker push, webcal, `.ics`, installation PWA | 1,5 sem. |
| **L5** | Scan, export PDF, sauvegarde, tests sur appareils réels | 1 sem. |

**~9 semaines.** L4 est le lot le plus risqué : les rappels ne se testent que sur matériel réel, sur les deux plateformes, sur plusieurs jours.

**L0 et L1 avant tout le reste.**

---

## 19. Annexes

### A. Glossaire

| Terme | Définition |
|---|---|
| **CIS** | Code Identifiant de Spécialité — identifiant BDPM d'un médicament |
| **CIP13** | Code Identifiant de Présentation — identifiant d'une boîte |
| **SA / ST** | Substance Active / Substance Thérapeutique dans la composition BDPM |
| **BDPM** | Base de Données Publique des Médicaments (ANSM / HAS / UNCAM) |
| **ATC** | Anatomical Therapeutic Chemical — classification OMS |
| **PMO / PMF** | Prescription Médicale Obligatoire / Facultative |
| **OPFS** | Origin Private File System — système de fichiers privé du navigateur |
| **VAPID** | Clés d'identification du serveur d'envoi Web Push |
| **Occurrence** | Instance matérialisée d'une prise planifiée |

### B. Risques

| Risque | Grav. | Prob. | Traitement |
|---|---|---|---|
| Double comptage SA/ST | Critique | Moyenne | §7.2, jeu doré, contrôle de build bloquant |
| Rappel de pilule non délivré | Critique | Moyenne | Trois couches (§10.2), calendrier non désactivable sans confirmation |
| Doublons d'alarmes après réimport `.ics` | Élevée | Élevée | `UID` + `SEQUENCE`, webcal sur iOS, avertissement sur Android |
| Purge du stockage iOS | Élevée | Faible | Installation obligatoire, `persist()` à chaque ouverture, export périodique |
| Dosage non normalisable | Élevée | Moyenne | Fiabilité explicite, exclusion du cumul, seuil 95 % contrôlé |
| Signal sur traitement prescrit | Élevée | Faible | R2 appliqué au format de règle |
| Indisponibilité du Worker | Moyenne | Faible | Couche calendrier indépendante |
| Perte de phrase de passe | Moyenne | Élevée | Avertissement fort, rappel d'export |

### C. À trancher

1. **Domaine** — nécessaire pour un `webcal://` propre et une icône crédible.
2. **Multi-profils en V1** ou profil unique — le sélecteur permanent coûte de la place en tête d'écran.
3. **Nom** — `MEDCO` porte le différenciateur, `ALVÉOLE` colle mieux au design. Aucun dépôt INPI nécessaire à cette échelle.
