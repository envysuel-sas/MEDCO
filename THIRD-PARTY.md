# Éléments tiers

Ce fichier est visé par l'article 6 de [`LICENSE`](LICENSE) et en fait partie
intégrante. Il recense ce qui, dans ce dépôt et dans l'application distribuée,
**n'appartient pas** au Titulaire et reste régi par sa licence propre.

Deux raisons de le tenir à jour : la SIL Open Font License et la licence
Apache 2.0 imposent que leurs notices accompagnent la redistribution, et la
Licence Ouverte impose l'attribution de la source de données. Servir
l'application depuis GitHub Pages **est** une redistribution.

---

## 1. Données

| Source | Contenu | Licence | Obligation |
|---|---|---|---|
| [Base de données publique des médicaments](https://base-donnees-publique.medicaments.gouv.fr) — ANSM · HAS · UNCAM | spécialités, présentations, compositions | Licence Ouverte Etalab 2.0 | attribution + date de mise à jour |
| [Open Medic](https://www.data.gouv.fr/fr/datasets/open-medic-base-complete-sur-les-depenses-de-medicaments-interregimes/) — Assurance Maladie | codes ATC, absents de la BDPM | Licence Ouverte Etalab 2.0 | attribution |

Redistribués dans `public/bundles/` sous forme de bundle SQLite compressé.

**Ces données ne sont pas la propriété du Titulaire et ne peuvent pas être
soumises à sa licence.** La Licence Ouverte autorise leur réutilisation, y
compris commerciale, sous réserve d'attribution. Ce qui est protégé, c'est le
travail d'ingestion, de normalisation des dosages et d'enrichissement ATC —
pas la donnée source.

Les données ne sont pas altérées. La date de mise à jour BDPM est affichée
dans l'écran Réglages et sur tout document exporté, comme la licence l'exige.

Les seuils de `data/regles.json` proviennent de sources publiques (ANSM, HAS,
RCP), chacune citée et datée dans le fichier lui-même.

## 2. Polices

Redistribuées dans `public/polices/`, sous-ensembles latin et latin-ext, non
modifiées.

| Famille | Copyright | Licence |
|---|---|---|
| Poppins | 2020 The Poppins Project Authors | SIL Open Font License 1.1 |
| Newsreader | 2020 The Newsreader Project Authors | SIL Open Font License 1.1 |
| DM Mono | 2020 The DM Mono Project Authors | SIL Open Font License 1.1 |

**Texte intégral des trois licences : [`public/polices/LICENSES.txt`](public/polices/LICENSES.txt).**

⚠ Ce fichier est servi avec les polices et ne doit pas être supprimé du
répertoire `public/` : l'OFL exige qu'il accompagne le fichier de police.

## 3. Bibliothèques incorporées au code distribué

Présentes dans le bundle servi aux utilisateurs.

| Paquet | Licence | À savoir |
|---|---|---|
| `react`, `react-dom` | MIT | |
| `react-router` | MIT | |
| `zustand` | MIT | |
| `hash-wasm` | MIT | SHA-256 et Argon2id |
| `workbox-precaching` | MIT | service worker |
| `@zxing/library` | **Apache 2.0** | repli Datamatrix ; §4 impose de conserver la licence et le fichier NOTICE éventuel |
| `@sqlite.org/sqlite-wasm` | **Apache 2.0** | idem. Le moteur SQLite lui-même est dans le domaine public |

La licence MIT et la licence Apache 2.0 exigent toutes deux que leur texte et
les notices de copyright accompagnent le code redistribué. Les copies
intégrales se trouvent dans `node_modules/<paquet>/LICENSE` ; elles sont
reproduites au build dans les fichiers de sortie par leurs auteurs respectifs
lorsque ceux-ci les y ont placées.

> **À faire avant une diffusion commerciale.** Générer un inventaire de
> licences complet et vérifié, dépendances transitives comprises, plutôt que
> cette liste limitée aux dépendances directes. Un outil du type
> `license-checker` ou `oss-attribution-generator` produit ce document. Ce
> point n'est pas traité ici et ne doit pas être présenté comme fait.

## 4. Outils de développement

Non redistribués : ils ne s'exécutent qu'au build et ne figurent pas dans
l'application servie. Vite, TypeScript, ESLint, Vitest, Playwright, sharp,
polars — MIT, Apache 2.0 ou BSD selon le paquet.

## 5. Maquette et direction visuelle

`docs/maquette/` et les jetons qui en sont extraits (`src/ui/tokens.css`,
`src/ui/tokens.ts`) sont l'œuvre du Titulaire et **sont** couverts par
[`LICENSE`](LICENSE).
