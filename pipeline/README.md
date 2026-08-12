# Pipeline BDPM

Ingestion de la Base de Données Publique des Médicaments vers le bundle
catalogue embarqué dans la PWA. Spec §6.

```bash
python3.12 -m venv .venv && .venv/bin/pip install -r pipeline/requirements.txt
.venv/bin/python -m pipeline.build
```

Sortie : `public/bundles/catalogue-<date>.sqlite.br` + `manifest.json`.

## Sources

| Source | Usage | Licence |
|---|---|---|
| `CIS_bdpm.txt`, `CIS_CIP_bdpm.txt`, `CIS_COMPO_bdpm.txt`, `CIS_CPD_bdpm.txt`, `CIS_GENER_bdpm.txt` | catalogue | Licence ouverte (ANSM · HAS · UNCAM) |
| Open Medic, base complète | **codes ATC** — la BDPM n'en publie pas | Licence ouverte (Assurance Maladie) |

⚠ Les URL de téléchargement BDPM ont changé : `/download/file/<nom>`,
l'ancien `telechargement.php?fichier=` renvoie 404. Vérifié le 12/08/2026.

## Étapes

Les neuf étapes de §6.3 sont dans `build.py`, une fonction par module :

| Module | Rôle |
|---|---|
| `sources.py` | téléchargement, détection d'encodage, date de publication BDPM |
| `parsing.py` | lecture tabulée sans en-tête, dates, PMO/PMF, nombre d'unités |
| `dosages.py` | normalisation du dosage → mg par unité de prise, fiabilité 0/1/2 |
| `composition.py` | choix de **la** ligne comptée par liaison (SA / FT) |
| `atc.py` | ATC, `groupe_atc`, `classe` |
| `catalogue.py` | schéma SQLite, index, FTS5, VACUUM |
| `controles.py` | les six contrôles bloquants de §6.5 |
| `publication.py` | Brotli, SHA-256, manifest |

## Ce qu'il faut savoir avant de modifier

**Encodage.** Trois cas coexistent dans la même publication : latin-1 /
cp1252, UTF-8, et UTF-8 doublement encodé (`CIS_CIP_bdpm.txt` publie « Ã© »
pour « é »). `sources.decoder` traite les trois.

**SA / FT.** La spec parle de lignes `ST`, la source publie `FT`. Surtout, la
masse d'un sel et celle de sa fraction thérapeutique sont **deux valeurs
différentes de la même molécule** sur la même liaison. Lire l'en-tête de
`composition.py` avant de toucher à quoi que ce soit ici : c'est le point où
une erreur rend l'application dangereuse.

**Aucune estimation.** Un dosage non analysable donne `fiabilite = 0` et la
ligne n'est pas comptée. Ne jamais ajouter de valeur par défaut pour faire
monter la métrique — le contrôle §6.5 existe pour détecter une régression du
parseur, pas pour être satisfait.

**Homéopathie.** 6 499 liaisons de formes orales sèches sont dosées en
dilutions (`4CH à 30CH`), sans équivalent massique. Elles sont exclues du
dénominateur du contrôle de fiabilité et comptées à part dans le manifest.

## Politique de liaison

`--politique` choisit la ligne comptée :

| Valeur | Effet |
|---|---|
| `fraction_therapeutique` (défaut) | FT si elle porte un dosage, sinon SA. Le cumul est en molécule active, unifiée entre sels. |
| `substance_active` | SA d'abord, FT en secours. |
| `substance_active_stricte` | SA seule — lecture littérale de R1. Fait échouer le contrôle de fiabilité (82,8 %). |
