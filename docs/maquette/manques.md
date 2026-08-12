# Manques — ce que la maquette ne tranche pas

Format : `[écran/composant] — ce qui manque — ce qui a été fait en attendant`.

Ce fichier n'est pas un aveu d'échec : c'est le livrable qui permet de
compléter la maquette. Rien de ce qui suit n'a été comblé par une valeur
plausible.

---

## 1. Contradictions à arbitrer

### 1.1 [Système] — Thème sombre absent de l'export

L'export ne contient que la direction claire. La maquette y fait pourtant
référence à une palette sombre antérieure (« le sérif sur fond clair pèse plus
qu'en sombre », « valeurs clair, inchangées »), sans en livrer les valeurs.

Inventer un thème sombre reviendrait à inventer douze couleurs de chrome et
onze teintes ATC — et les teintes ATC portent de l'information (§12.2), pas de
la décoration.

**Fait en attendant :** `tokens.css` déclare `color-scheme: light`, aucun bloc
`prefers-color-scheme: dark`. L'application est en thème clair uniquement.
Le protocole demande « les deux thèmes dès l'extraction » : ce point est donc
ouvert et bloque une livraison complète de L2.

### 1.2 [Système] — « Deux niveaux d'encre, pas trois », mais trois sont employés

La note de la palette dit : « Deux niveaux d'encre pour le texte, pas trois :
`#56737F` est le plus clair admis ». L'export utilise pourtant `#31505E`
47 fois, comme troisième niveau (texte des citations, sous-titre du cumul).

**Fait en attendant :** trois jetons — `--encre-1` `#0F2E3D`, `--encre-2`
`#31505E`, `--encre-3` `#56737F` — conformes à l'usage réel de l'export.
À confirmer : la note est-elle périmée, ou `#31505E` est-il une scorie ?

### 1.3 [Plaquette] — Une variante s'appelle `observance`

Le composant `MedcoPlaquette` de la maquette expose
`variant: 'densite' | 'substance' | 'observance'`. Le mot « observance » est
interdit (§12.1, R3). La variante ne calcule aucun taux — elle colore les
prises validées d'un plan — mais son nom induit en erreur.

**Fait en attendant :** la variante est implémentée sous le nom `validation`.
Aucun pourcentage n'est calculé nulle part.

### 1.4 [Repères] — Seuil aspirine dépendant de la forme

`data/regles.json` retient 3 000 mg/24 h pour l'acide acétylsalicylique, valeur
du §8.3 de la spec, sourcée sur le RCP d'ASPIRINE UPSA 500 mg effervescent. Le
RCP d'ASPIRINE DU RHONE 500 mg comprimé retient **2 000 mg/j**.

Le seuil le plus bas du marché serait plus prudent. Ce n'est pas un arbitrage
d'ingénierie : la règle est notée dans `regles.json`, champ `remarque`.

### 1.5 [Alvéole] — Rayon non tranché par la maquette

La maquette pose la question elle-même (« À trancher, 3 · Rayon de l'alvéole :
4 px (CDC) ou capsule Medco ») et livre les deux options, 1q et 1r.

**Fait en attendant :** `--rayon-alveole: 4px`, valeur par défaut du composant
`MedcoPlaquette` et option CDC. Un seul jeton à changer pour basculer.

---

## 2. Valeurs absentes de l'export

### 2.1 [Tous composants] — Aucune durée ni courbe de mouvement

`scripts/extraire-maquette.mjs` ne trouve **aucune** valeur de `transition` ni
d'`animation` dans l'export.

**Fait en attendant :** aucun jeton de mouvement, aucune transition dans les
composants. Seul `prefers-reduced-motion` est respecté par précaution. Les
transitions d'écran (View Transitions API, §11.4) restent à définir.

### 2.2 [Tous composants] — États absents

L'export ne montre que l'état de repos. Manquent : survol, focus, actif,
désactivé, chargement.

**Fait en attendant, dérivé des jetons existants et à valider :**

| État | Dérivation |
|---|---|
| focus | `outline: 1.5px solid var(--action)`, décalé de 2 px |
| pressé (bouton primaire) | fond `--action-appuyee` (`#0F2E3D`, couleur de `a:hover` de l'export) |
| pressé (bouton secondaire) | fond `--surface-active` (`#EAF2F6`, fond du chip sélectionné) |
| désactivé | opacité `--intensite-1` (0,4, valeur d'intensité de la maquette) |
| chargement | non traité — aucun indicateur de chargement dans l'export |

### 2.3 [Chrome] — Couleur de thème du manifeste

L'export ne donne pas de couleur pour la barre système ni pour l'écran de
lancement. Le dépôt portait `#12100E`, une couleur qui n'existe nulle part
dans la maquette.

**Fait en attendant :** `theme_color` et `background_color` prennent `#F1F6F9`,
le fond d'écran de la maquette. À confirmer.

### 2.4 [Chrome] — Barre d'état à 54 px

Tous les écrans de la maquette posent `padding-top: 54px` : c'est la barre
d'état du simulateur, pas une valeur de design.

**Fait en attendant :** remplacée par `env(safe-area-inset-top)` (§11.4).

### 2.5 [Écrans] — Aucun état d'erreur

Ni erreur réseau, ni échec d'installation du catalogue, ni base illisible.

**Fait en attendant :** les erreurs s'affichent dans une `Carte` à filet
`information` — jamais en rouge, jamais avec un triangle (§12.1).

### 2.6 [EcranSecondOnglet] — Écran non dessiné

Le refus d'ouverture en second onglet (§5.5) n'existe pas dans la maquette.

**Fait en attendant :** recomposé avec `TitreEcran`, un paragraphe `meta` et un
`Bouton`. Aucun motif visuel nouveau.

### 2.7 [KitchenSink] — Écran non dessiné, par nature

Recomposé à partir des composants existants.

---

## 3. Regroupements de quasi-doublons

Ces valeurs ont été fusionnées. Chaque ligne demande confirmation.

| Valeurs de l'export | Jeton retenu | Note |
|---|---|---|
| `56px/54px` (bloc Échelle) et `56px/58px` (écran 1b) | `--interligne-chiffre-cle: 58px` | valeur des écrans, pas du bloc de démonstration |
| `.07em`, `.08em`, `.09em` (interlettrages de capitales) | `--interlettrage-etiquette: .07em` (UI) et `--interlettrage-etiquette-large: .09em` (titres de groupe) | `.08em` fusionné vers `.07em` |
| `9px`, `11px` (rayons vus une fois chacun) | non repris | scories probables |
| `10.5px` (mono des identifiants de la visionneuse) | non repris | chrome de la visionneuse, hors application |
| `3px`, `7px`, `1px` (rayons isolés) | non repris | idem |
| `#999999`, `#666666`, `rgba(0,0,0,0.08)` | non repris | chrome de la visionneuse |
| `#FF8A80` | **non repris** | rouge présent une fois dans le cadre iOS de démonstration (icône de batterie). Aucun rouge dans l'application (§12.1) |

---

## 4. Écrans de la maquette non implémentés en V1

| Écran | Raison |
|---|---|
| 1h Préparer la semaine (§9.4) | Hors périmètre V1 : absent de la liste §3.1 de la spec. |
| 1j Notice / RCP | Spec §3.2 — reporté, un lien vers la page officielle suffit. |
| 1p Type dynamique 200 % | Contrainte, pas écran : à vérifier sur chaque écran. Aucune hauteur fixe n'a été posée sur un conteneur de texte. |

---

## 5. Écarts de données à connaître pour l'UI

Ils ne viennent pas de la maquette mais de la BDPM réelle, et changent ce que
les écrans doivent savoir afficher.

### 5.1 Une boîte peut contenir plusieurs éléments pharmaceutiques

1 437 spécialités portent plusieurs éléments : HUMEX RHUME est une boîte de
comprimés **et** de gélules, une plaquette contraceptive multiphasique porte un
comprimé blanc et un rose à dosages différents.

L'UI doit demander **lequel** est pris. Tant que le choix n'est pas fait,
`substancesPourPrise` ne compte rien et retourne `elementsAChoisir`. Aucun
écran de la maquette ne pose cette question.

### 5.2 Dosages exprimés pour une unité non manipulable

Certains sachets sont dosés « pour 100 g de poudre » : la conversion est exacte
(mg par gramme) mais l'utilisateur ne pèse pas son sachet. La prise reste
enregistrable, la mention « valeur dérivée » s'affiche. À arbitrer : faut-il
plutôt les traiter comme non exploitables ?

### 5.3 Trois erreurs du texte de la spec, trouvées à l'exécution

| Point | Ce que dit la spec | Ce que fait SQLite |
|---|---|---|
| §5.3 | `ATTACH … AS cat;` puis `PRAGMA cat.query_only = 1;` | `query_only` est un réglage de **connexion** : le préfixe de schéma est ignoré et **toute** la connexion passe en lecture seule, `user.db` compris. Symptôme : `SQLITE_READONLY` à la première écriture. La lecture seule vient désormais de l'URI `mode=ro` de l'attachement. |
| §5.1 | `specialite_fts` en `content='specialite'` avec une colonne `substances` | La colonne n'existe pas dans `specialite` : l'index externe n'est pas constructible tel qu'écrit. La colonne a été ajoutée à la table. |
| §6.3 | bundle Brotli servi tel quel | `DecompressionStream('br')` n'existe ni sur Safari ni sur Firefox, et GitHub Pages ne pose pas `Content-Encoding`. Le pipeline publie donc **aussi** une variante gzip, et l'application vérifie l'empreinte du SQLite décompressé — la seule qui tienne quel que soit l'hébergeur. |

À noter aussi, sans être une erreur de la spec : l'opérande gauche de `MATCH`
doit être le **nom nu** de la table FTS. Ni `cat.specialite_fts`, ni un alias
ne fonctionnent (« no such column »).

### 5.4 ZBar ne décode pas le Datamatrix

La spec §4.1 et §13 proposent `zbar-wasm` comme repli sur Safari, où
`BarcodeDetector` est absent. ZBar couvre les codes-barres linéaires et le QR,
**pas** l'ECC 200 du Datamatrix GS1 des boîtes françaises.

**Fait en attendant :** le repli est `@zxing/library`, qui embarque un
`DataMatrixReader`, chargé à la demande pour rester hors du bundle initial.
À confirmer.

### 5.5 Fragmentation des sels sans fraction thérapeutique

Quand la BDPM ne publie pas de ligne `FT`, deux sels d'une même molécule
gardent deux codes distincts (naproxène / naproxène sodique, codéine /
phosphate de codéine). Le cumul les compte séparément. Les règles ciblant une
substance précise doivent lister tous les codes concernés ; celles ciblant une
classe ne sont pas affectées.
