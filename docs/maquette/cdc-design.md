# MOLÉCULE — Cahier des charges design

**Version** 2.0 — 27 juillet 2026
**Système de design** ALVÉOLE
**Document lié** `molecule-cdc-technique.md`
**Remplace** la version 1.0 dans son intégralité

> **Changements majeurs depuis la v1.0**
> Direction visuelle entièrement reprise : sombre, chaude, colorée. Système chromatique par groupe ATC. Deuxième composant signature (Pilulier). Périmètre élargi au catalogue complet. Le principe « pas de chaleur » de la v1 est abandonné — il reposait sur un raisonnement erroné.

---

## Sommaire

1. [Promesse et posture](#1-promesse-et-posture)
2. [Principes de design](#2-principes-de-design)
3. [Anti-patterns proscrits](#3-anti-patterns-proscrits)
4. [Direction artistique](#4-direction-artistique)
5. [Système chromatique](#5-système-chromatique)
6. [Typographie](#6-typographie)
7. [Jetons de design](#7-jetons-de-design)
8. [Plaquette — signature rétrospective](#8-plaquette--signature-rétrospective)
9. [Pilulier — signature prospective](#9-pilulier--signature-prospective)
10. [Bibliothèque de composants](#10-bibliothèque-de-composants)
11. [Écrans](#11-écrans)
12. [Extensions système](#12-extensions-système)
13. [Lexique éditorial (contractuel)](#13-lexique-éditorial-contractuel)
14. [États vides, erreurs, onboarding](#14-états-vides-erreurs-onboarding)
15. [Accessibilité](#15-accessibilité)
16. [Documents imprimés](#16-documents-imprimés)
17. [Iconographie et marque](#17-iconographie-et-marque)
18. [Livrables](#18-livrables)

---

## 1. Promesse et posture

### 1.1 La phrase

> **Sachez ce que vous prenez vraiment.**

### 1.2 La posture

L'application est un **instrument**. Un instrument bien fait est précis *et* beau — une Leica, une Braun, un bon garde-temps. La précision n'impose aucune austérité.

La v1 de ce document affirmait que la chaleur menait au jugement, et bannissait donc toute couleur et toute générosité visuelle. C'était faux. Ce qui juge, c'est le **vocabulaire** (« trop », « excessif », « bravo »), pas la palette. On peut afficher une donnée de santé avec beaucoup de soin, de couleur et de densité sans jamais évaluer la personne.

Ce que l'application fait : elle compte, elle affiche, elle rappelle, elle imprime. Elle le fait avec exigence.
Ce qu'elle ne fait pas : elle ne conclut pas sur vous, ne vous félicite pas, ne vous reproche rien.

### 1.3 Les utilisateurs

| Profil | Usage dominant | Écran d'entrée |
|---|---|---|
| **Le foyer** | Rhume, maux de tête, enfants, armoire à pharmacie | Aujourd'hui |
| **Celui qui s'interroge** | Sait qu'il prend « souvent quelque chose », n'a aucun chiffre | Aujourd'hui + Plaquette |
| **Le patient chronique** | Traitement au long cours, veut un carnet et un document de consultation | Pilulier |
| **L'aidant** | Prépare et suit le traitement d'un proche | Pilulier + multi-profils |

Le patient chronique et l'aidant sont des cibles de plein droit, pas des cas tolérés. **Ils ne reçoivent jamais de signal de fréquence** (INV-4) — pour eux, l'application est un pilulier et un carnet.

---

## 2. Principes de design

### P1 — Le chiffre est le héros
Toute information commence par un nombre, grand, avec son unité et sa période. La phrase vient après. Un nombre se vérifie ; une phrase interprète.

### P2 — Cinq secondes
Enregistrer une prise prend moins de cinq secondes depuis l'écran verrouillé. Contrainte structurante de la navigation, et raison d'être des widgets et raccourcis système. Personne ne remplit un formulaire quand il a mal à la tête.

### P3 — La couleur porte la molécule
La couleur n'est pas décorative : elle encode le **groupe ATC** de la substance. Sur une grille de 30 jours, on voit immédiatement quelle famille domine le mois. C'est à la fois ce qui rend l'écran beau et ce qui le rend lisible. Le rouge reste hors palette.

### P4 — Deux directions du temps
**Plaquette** regarde en arrière (ce que vous avez pris). **Pilulier** regarde en avant (ce que vous prenez cette semaine). Les deux piliers visuels du produit ne se confondent jamais.

### P5 — Le vocabulaire du médicament
L'interface emprunte au monde matériel du médicament — l'alvéole du blister, la grille du semainier, le code sous le code-barres, la mise en page de la notice — plutôt qu'au vocabulaire générique des tableaux de bord santé. L'utilisateur sait déjà lire une plaquette et un pilulier.

### P6 — Le sérif cite, la grotesque parle
Le texte issu d'une source institutionnelle (RCP, ANSM, HAS, Ameli) est composé en sérif. Le texte de l'application est en grotesque. La typographie signale d'un coup d'œil qui parle — traduction visuelle de INV-2 : ce qui est cité n'est pas ce que l'application affirme.

### P7 — Le prescrit est sanctuarisé
Un traitement prescrit ne porte jamais de signal de fréquence, jamais de comparaison, jamais de suggestion. Il est identifié visuellement et traité avec une neutralité complète.

---

## 3. Anti-patterns proscrits

| Interdit | Pourquoi |
|---|---|
| **Séries / streaks** | Récompense la régularité — absurde sur de l'automédication, culpabilisant pour le chronique qui « casse » sa série. |
| **Badges, niveaux, points, confettis** | Célébrer une prise de médicament n'a pas de sens. Célébrer une non-prise est dangereux. |
| **Compteur « X jours sans »** | Registre d'abstinence. Transforme un antalgique légitime en écart de conduite. |
| **Rouge, triangles d'avertissement, vibration d'alerte** | Induit une urgence médicale que l'application ne peut pas établir. |
| **Jauge de risque, score, taux d'observance** | Violation directe de INV-1. |
| **Comparaison à d'autres utilisateurs** | Aucune valeur informative, situe la personne dans une population — donc l'évalue. |
| **Illustrations bien-être** | Feuilles, mains jointes, personnages apaisés, aquarelles. Registre naturopathie, exactement ce dont il faut se distinguer. |
| **Bouton dissuasif à l'enregistrement** | L'application ne s'interpose jamais entre l'utilisateur et son médicament. |
| **Emoji dans les états de santé** | Registre incompatible. |

**Autorisé et encouragé**, contrairement à la v1 : couleur saturée, densité, profondeur de surface, mouvement soigné, retour visuel valorisant. Montrer joliment n'est pas gamifier.

---

## 4. Direction artistique

### 4.1 Le concept : ALVÉOLE

L'alvéole du blister est l'unité visuelle du produit. Elle apparaît en grille rétrospective (Plaquette), en grille prospective (Pilulier), en pastille de substance, en icône d'application.

Une plaquette de médicament est déjà une visualisation de données : une grille de cellules, pleines ou percées, lisible sans notice. Le produit reprend cette grammaire au lieu d'importer les graphiques génériques des applications de santé.

### 4.2 Registre

**Sombre, chaud, dense.** Fond noir tirant sur le brun plutôt que sur le bleu — l'écran s'ouvre souvent la nuit, migraine ou insomnie, et un noir froid est agressif dans ces conditions. Surfaces empilées par luminosité, sans ombre portée. Accents saturés portés par la donnée.

Le mode clair existe et doit être excellent, mais le produit est **conçu en sombre d'abord**.

Écarts assumés par rapport au secteur : pas de bleu médical, pas de dégradé pastel, pas de blanc clinique dominant, pas de cercle de progression, pas de photographie de personnes.

### 4.3 Le laiton

Un accent neutre chaud (`--sable`) porte les éléments d'action et d'état actif : bouton principal, onglet sélectionné, jour courant. Il ne porte **jamais** de donnée médicale — les données portent les couleurs ATC. Cette séparation stricte entre chrome et donnée est ce qui garde les écrans lisibles malgré la richesse chromatique.

---

## 5. Système chromatique

### 5.1 Principe : la couleur = le groupe ATC

Chaque substance hérite de la couleur de son **groupe anatomique ATC** (première lettre du code). Classification internationale standard, stable, exhaustive — elle couvre l'intégralité du catalogue BDPM sans exception ni cas particulier à arbitrer.

| ATC | Domaine | Couleur | Sombre | Clair |
|---|---|---|---|---|
| **N** | Système nerveux — antalgiques, triptans, opioïdes, hypnotiques | Ambre | `#E8743C` | `#C4551F` |
| **M** | Muscle et squelette — AINS, myorelaxants | Vert | `#4FA86E` | `#2F7A4B` |
| **A** | Digestif et métabolisme — IPP, antiacides, laxatifs | Bleu | `#4A8FD4` | `#2A6AAC` |
| **R** | Respiratoire — antihistaminiques, décongestionnants, antitussifs | Violet | `#9179D8` | `#6552AE` |
| **J** | Anti-infectieux | Turquoise | `#3BAFA8` | `#1F8880` |
| **C** | Cardiovasculaire | Rose | `#D77CA0` | `#AC5478` |
| **D** | Dermatologie | Sable foncé | `#C2A25E` | `#93763A` |
| **G** | Génito-urinaire, hormones sexuelles | Prune | `#B07AB8` | `#84518C` |
| **B** | Sang et organes hématopoïétiques | Rouille | `#C97B5C` | `#9A553A` |
| **S** | Organes sensoriels | Céladon | `#7FB59C` | `#4F8770` |
| **H · L · P · V** | Hormones, oncologie, antiparasitaires, divers | Gris chaud | `#8E8478` | `#6B6258` |
| — | Produit libre, sans ATC | Neutre | `#6E655B` | `#8A8178` |

### 5.2 Modulation par substance

À l'intérieur d'un groupe, chaque substance reçoit une variation de luminosité déterministe dérivée d'un hachage stable de son code substance (±14 % de luminosité, teinte inchangée). Paracétamol et codéine sont tous deux ambre, distincts mais visiblement apparentés.

La dérivation est **stable dans le temps** : une substance garde sa nuance d'une version à l'autre.

### 5.3 Intensité dans les grilles

Le nombre de prises module l'opacité, jamais la teinte :

```
0 prise    surface creuse
1 prise    couleur ATC à 40 %
2 prises   couleur ATC à 70 %
3 prises + couleur ATC pleine
```

Jour multi-substances : l'alvéole se scinde en bandes horizontales, une par groupe ATC, proportionnelles au nombre de prises.

### 5.4 Couleurs de signal

Elles portent le **niveau**, jamais la substance, et n'apparaissent qu'en filet latéral de carte — jamais en fond plein.

```
information   --sable          #C9B79A
vigilance     --ambre-signal   #EDA100
attention     --prune-signal   #B98BA9
```

**Aucun rouge nulle part.** Une donnée n'est pas une urgence.

### 5.5 Contraste

Toutes les paires texte / fond sont vérifiées à **4,5:1 minimum** dans les deux thèmes. Les couleurs ATC ne portent jamais de texte : elles remplissent des surfaces dont l'étiquette est en encre neutre à proximité.

---

## 6. Typographie

### 6.1 Trois rôles, trois fontes, un job chacun

| Rôle | Fonte | Justification |
|---|---|---|
| **Interface et chiffres** | `Geist Sans` (variable) | Grotesque contemporaine, chiffres tabulaires excellents, tient à 11 px comme à 56 px. OFL. |
| **Codes, dosages, CIP/CIS** | `Geist Mono` | Même squelette que la sans — cohérence de superfamille. OFL. |
| **Citations sourcées** | `Newsreader` (variable) | Sérif éditoriale. **Réservée exclusivement au texte issu d'une source institutionnelle.** OFL. |

Le sérif est le dispositif typographique signature. Il n'apparaît que dans les extraits de RCP, les repères ANSM, les fiches HAS. Partout ailleurs il est interdit. L'utilisateur apprend en deux écrans que « le sérif vient de l'extérieur » — la typographie fait le travail que ferait sinon un encadré d'avertissement.

### 6.2 Échelle

| Jeton | Taille / interligne | Réglage | Usage |
|---|---|---|---|
| `hero` | 56 / 54 | Geist 500, `-0.03em`, tabular | Le chiffre du jour |
| `chiffre-l` | 34 / 38 | Geist 500, `-0.02em`, tabular | Chiffres de carte |
| `chiffre-m` | 22 / 28 | Geist 500, tabular | Chiffres de liste |
| `titre` | 20 / 27 | Geist 500, `-0.01em` | Titres d'écran |
| `eyebrow` | 11 / 15 | Geist 500, `+0.07em`, capitales | Intitulés de section |
| `corps` | 16 / 25 | Geist 400 | Texte courant |
| `corps-s` | 14 / 21 | Geist 400 | Texte secondaire |
| `citation` | 15 / 25 | **Newsreader 400** | Texte de source institutionnelle |
| `legende` | 12 / 17 | Geist 400 | Unités, dates, métadonnées |
| `mono` | 13 / 19 | Geist Mono 400 | CIP, CIS, dosages |

Chiffres systématiquement en `tabular-nums` : un compteur ne doit pas frémir à la mise à jour.

---

## 7. Jetons de design

### 7.1 Surfaces et encre — sombre (thème de référence)

```css
--fond:          #12100E;   /* canevas, noir chaud */
--surface-1:     #1A1613;   /* cartes */
--surface-2:     #221D19;   /* cartes surélevées, feuilles */
--surface-creux: #1E1A17;   /* alvéoles vides, pistes de jauge */
--trait:         #2A241F;
--trait-fort:    #3A322B;

--encre:         #F5F0E8;
--encre-2:       #948C82;
--encre-3:       #6E655B;

--sable:         #C9B79A;   /* action, état actif, jour courant */
--sable-creux:   #2E2820;
```

### 7.2 Surfaces et encre — clair

```css
--fond:          #FAF7F2;
--surface-1:     #FFFFFF;
--surface-2:     #FFFFFF;
--surface-creux: #EFE9E0;
--trait:         #E2DAD0;
--trait-fort:    #CBC0B3;

--encre:         #191512;
--encre-2:       #6B6258;
--encre-3:       #948C82;

--sable:         #8A6F45;
--sable-creux:   #F2EAD9;
```

### 7.3 Espacement, formes, profondeur

```
Espacement (base 4) : 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56
Rayons              : 3 (alvéoles) · 8 (contrôles, champs) · 12 (cartes) · 20 (feuilles)
Profondeur          : par empilement de surfaces, jamais par ombre portée.
                      Exception unique : voile --fond à 60 % sous une feuille modale.
Bordures            : 0,5 px --trait sur les cartes en mode clair.
                      Aucune bordure en sombre, la surface suffit.
Cible tactile       : 48 × 48 minimum, sans exception.
```

### 7.4 Mouvement

```
Durées : 140 ms (micro) · 200 ms (transition) · 320 ms (feuille)
Courbe : cubic-bezier(0.2, 0, 0, 1)
Ressort (feuilles, pilulier) : damping 0.82, stiffness 180
```

**Autorisé et soigné :** remplissage d'alvéole à la validation (140 ms, échelle 0,9 → 1 + montée d'opacité), transition de semaine du Pilulier, apparition de carte, retour haptique léger.

**Interdit :** rebond célébratoire, pulsation d'attention, animation de récompense, tout mouvement sur un signal.

`prefers-reduced-motion` : toutes les transitions deviennent des fondus de 90 ms.

---

## 8. Plaquette — signature rétrospective

### 8.1 Principe

Une grille d'alvéoles. Chaque alvéole est un jour. Sept colonnes alignées sur les jours de la semaine : la géométrie du blister est conservée, et l'alignement hebdomadaire révèle les schémas de week-end et de jour ouvré.

```
      L    M    M    J    V    S    D
    ┌────┬────┬────┬────┬────┬────┬────┐
    │    │ ░N │ █N │    │ ▓M │    │ ░N │
    ├────┼────┼────┼────┼────┼────┼────┤
    │ █N │ █N │    │ █M │ ░N │    │    │
    ├────┼────┼────┼────┼────┼────┼────┤
    │ ▓N │ █N │ ▓N │ ░R │    │ ░N │ █N │
    ├────┼────┼────┼────┼────┼────┼────┤
    │ █N │ ░N │    │ █N │ ▓A │    │ █N │
    ├────┼────┼────┼────┼────┼────┼────┤
    │ ░N │    │ ⊙  │    │    │    │    │
    └────┴────┴────┴────┴────┴────┴────┘

    ░ 1 prise   ▓ 2 prises   █ 3+   ⊙ aujourd'hui
    N ambre (nerveux) · M vert (musculo) · R violet (respi) · A bleu (digestif)

    18 jours avec prise sur 30
```

### 8.2 Variantes

| Variante | Contexte | Rendu |
|---|---|---|
| `densite` | Automédication, toutes substances | Couleur ATC, opacité selon le nombre de prises |
| `substance` | Vue d'une substance | Monochrome dans la couleur de la substance |
| `observance` | Traitement prescrit | Alvéole pleine `--sable` = validée, creuse = non enregistrée |

La variante `observance` n'affiche jamais de compteur de fréquence et n'emprunte jamais les couleurs de signal.

### 8.3 Spécification

```
Alvéole        : 36 × 36 (30 j) · 22 × 22 (90 j), rayon 3
Gouttière      : 5 (30 j) · 3 (90 j)
Grille         : 7 colonnes, hauteur variable
Multi-ATC      : bandes horizontales proportionnelles au nombre de prises
Aujourd'hui    : anneau intérieur 1,5 px --sable
Hors période   : opacité 0,3
Appui simple   : détail du jour (feuille modale)
Appui long     : infobulle — date, produits, doses, heures
Étiquette a11y : « 3 mars, 2 prises : paracétamol 1 000 mg à 08:12,
                  ibuprofène 400 mg à 19:40 »
```

### 8.4 Emplacements

Aujourd'hui (30 j) · Substance (90 j) · Rapport PDF (SVG) · Widget grand format.

---

## 9. Pilulier — signature prospective

Le pendant de la Plaquette. Là où la Plaquette montre ce qui a été pris, le Pilulier montre ce qui est à prendre. C'est l'écran principal du patient chronique et de l'aidant.

### 9.1 Vue semaine

Reprend la géométrie du semainier physique : moments de la journée en lignes, jours en colonnes.

```
              L    M    M    J    V    S    D
            ┌────┬────┬────┬────┬────┬────┬────┐
   MATIN    │ ●● │ ●● │ ●● │ ●● │ ●● │ ●● │ ●● │
            ├────┼────┼────┼────┼────┼────┼────┤
   MIDI     │ ●  │ ●  │ ●  │ ●  │ ●  │    │    │
            ├────┼────┼────┼────┼────┼────┼────┤
   SOIR     │ ●● │ ●● │ ●○ │ ○○ │ ○○ │ ○○ │ ○○ │
            ├────┼────┼────┼────┼────┼────┼────┤
   COUCHER  │ ●  │ ●  │ ○  │ ○  │ ○  │ ○  │ ○  │
            └────┴────┴────┴────┴────┴────┴────┘
                          ▲ aujourd'hui

   ● pris (couleur ATC pleine)   ○ à venir (contour)
   ⊘ sauté (contour barré)       ! non renseigné (contour --encre-3)
```

Chaque pastille est une prise planifiée, dans la couleur ATC de sa substance. Un traitement à quatre molécules produit une ligne polychrome immédiatement lisible.

### 9.2 Vue jour

Écran par défaut dès qu'un plan de prise actif existe. Timeline verticale par moment, validation par appui.

```
  MATIN  ·  08:00                              2 / 2 ✓
  ┌────────────────────────────────────────────────┐
  │ ● Kardégic 75 mg               1 sachet    ✓   │
  │ ● Lévothyrox 75 µg             1 cp        ✓   │
  └────────────────────────────────────────────────┘

  SOIR  ·  20:00                                0 / 2
  ┌────────────────────────────────────────────────┐
  │ ○ Doliprane 1000               1 cp        ○   │
  │ ○ Inexium 20 mg                1 gél       ○   │
  │                                                │
  │             [ Tout valider ]                   │
  └────────────────────────────────────────────────┘
```

**« Tout valider »** est essentiel : la contrainte des cinq secondes s'applique aussi ici. Un patient avec sept comprimés le matin ne fera pas sept appuis chaque jour.

### 9.3 Modes de moment

Moments configurables par profil : `matin`, `midi`, `après-midi`, `soir`, `coucher`, plus des moments personnalisés. Chaque moment porte une heure de référence, modifiable, qui pilote les rappels.

Un plan peut aussi être défini en **heures fixes** (toutes les 8 h) plutôt qu'en moments — nécessaire pour les antibiotiques et les traitements à intervalle strict.

### 9.4 Préparation du pilulier physique

Fonction dédiée à l'aidant et au patient qui remplit un semainier réel.

```
  ┌────────────────────────────────────────────────┐
  │  PRÉPARER LA SEMAINE DU 3 AU 9 AOÛT            │
  │                                                │
  │  Lévothyrox 75 µg                     7 cp     │
  │  ████████░░  stock : 12 cp                     │
  │                                                │
  │  Kardégic 75 mg                       7 sach.  │
  │  ██░░░░░░░░  stock : 4 sachets · insuffisant   │
  │                                                │
  │  Inexium 20 mg                        7 gél    │
  │  ██████████  stock : 28 gélules                │
  │                                                │
  │  Total : 21 unités à répartir                  │
  │                                                │
  │  [ Imprimer le plan ]   [ Marquer préparé ]    │
  └────────────────────────────────────────────────┘
```

Le plan imprimable est un vrai livrable (§16.2) : c'est ce que l'aidant colle sur le semainier ou emmène à l'officine.

### 9.5 Spécification

```
Pastille        : 14 × 14, cercle. L'alvéole est carrée, la prise
                  planifiée est ronde — la forme distingue le
                  rétrospectif du prospectif.
Cellule semaine : 40 × 44
Validation      : appui sur la pastille · 140 ms · haptique léger
Saut            : balayage gauche sur la ligne
Décalage        : appui long → « pris à … » avec sélecteur d'heure
Retard          : au-delà de 2 h après l'heure prévue, contour --encre-3.
                  Jamais de rouge, jamais de badge, jamais de vibration.
Étiquette a11y  : « Soir, 20 h, Doliprane 1000, 1 comprimé, non validé.
                  Appuyer pour valider. »
```

### 9.6 Ce que le Pilulier ne fait jamais

- **Aucun taux d'observance en pourcentage, aucun cumul de doses manquées.** Un chiffre d'observance est une évaluation de la personne (INV-1) et, pour un patient chronique, une source d'anxiété sans contrepartie utile.
- Aucun signal de fréquence, aucune couleur de vigilance (INV-4).
- Aucune relance culpabilisante. Le rappel se répète une fois, puis se tait.

---

## 10. Bibliothèque de composants

### 10.1 `CompteurSubstance`

```
┌──────────────────────────────────────────────┐
│ ● PARACÉTAMOL                                │  pastille ATC + eyebrow
│                                              │
│ 2 000 mg                                     │  hero
│                                              │
│ ███████████████████░│░░░░░░░░░               │  jauge, teinte ATC
│ 2 prises · 08:12 · 14:30      repère 3 000 mg│
└──────────────────────────────────────────────┘
```

- Jauge **linéaire**, jamais circulaire : un cercle suggère un objectif à atteindre.
- Le repère est une graduation, pas une fin de course. Au-delà, la jauge continue en `--prune-signal` sans saturer ni clignoter.
- Le mot employé est **« repère »** — jamais « limite », « maximum » ou « objectif ».

### 10.2 `CarteSignal`

```
┌──────────────────────────────────────────────┐
│▌ 18 jours avec prise d'antalgique sur 30.    │  corps, grotesque
│▌                                             │
│▌ Les recommandations situent à 15 jours par  │  citation — SÉRIF
│▌ mois le repère au-delà duquel une prise     │
│▌ répétée est signalée.                       │
│▌                                             │
│▌ Source ANSM · consultée le 27/07/2026  ↗    │  legende
│▌                                             │
│▌ [ J'ai vu ]              [ Voir le détail ] │
└──────────────────────────────────────────────┘
```

Trois blocs, dans cet ordre, sans exception :
1. **le fait de l'utilisateur** — chiffre, période, en grotesque ;
2. **l'information publique** — seuil cité, **en sérif**, sourcé, daté ;
3. **la source cliquable**.

Pas de quatrième bloc. Pas de conclusion, pas de conseil. Deux faits juxtaposés — le rapprochement appartient à l'utilisateur.

Filet latéral 2 px en couleur de niveau. Jamais d'icône d'avertissement, jamais de fond plein coloré.

### 10.3 `FicheNotice`

Nouveau en v2 — affichage du RCP officiel.

```
┌──────────────────────────────────────────────┐
│ DOLIPRANE 1000 mg, comprimé                  │
│ ● paracétamol 1 000 mg          CIS 61234567 │
│                                              │
│ ┌─ Sections ─────────────────────────────┐   │
│ │ Indications                          › │   │
│ │ Posologie                            › │   │
│ │ Contre-indications                   › │   │
│ │ Interactions                         › │   │
│ │ Effets indésirables                  › │   │
│ │ Grossesse et allaitement             › │   │
│ └────────────────────────────────────────┘   │
│                                              │
│ Texte officiel du résumé des                 │
│ caractéristiques du produit, publié par      │  ← tout le contenu
│ l'ANSM. Reproduit sans modification.         │     en SÉRIF
│                                              │
│ Source BDPM · mise à jour du 21/07/2026  ↗   │
└──────────────────────────────────────────────┘
```

**Intégralement en sérif** : c'est du texte officiel reproduit, pas la parole de l'application. Aucun surlignage, aucune synthèse, aucune mise en avant sélective — mettre en gras une contre-indication plutôt qu'une autre serait déjà une interprétation.

### 10.4 `LignePrise`

```
 08:12  ● Doliprane 1000 mg                    1 cp   ✓
        paracétamol 1 000 mg
```
Heure en mono, pastille ATC, produit en corps, substance et quantité en `corps-s`. Étiquette `Prescrit` le cas échéant. Balayage gauche : annuler. Balayage droit : dupliquer maintenant.

### 10.5 `SaisieRapide`

Feuille modale depuis le bouton central, le widget, le raccourci Siri, ou l'action rapide de l'icône.

```
┌──────────────────────────────────────────────┐
│  ENREGISTRER UNE PRISE          maintenant ▾ │
│                                              │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌───────┐ │
│  │● Doli  │ │● Advil │ │● Spas  │ │● Humex│ │
│  │  1000  │ │  400   │ │  fon   │ │       │ │
│  └────────┘ └────────┘ └────────┘ └───────┘ │
│                                              │
│  [ − ]        1 comprimé        [ + ]        │
│                                              │
│  [         Enregistrer          ]            │
│                                              │
│  ＋ Autre produit        ⛶ Scanner            │
└──────────────────────────────────────────────┘
```

Deux appuis dans le cas courant. Les produits récents sont triés par fréquence d'usage, avec leur pastille ATC.

### 10.6 `CarteStock`

```
┌──────────────────────────────────────────────┐
│ ● Lévothyrox 75 µg                           │
│ ████████████░░░░░░░░  12 cp                  │
│ ≈ 12 jours au rythme actuel                  │
│ Péremption 03/2027                           │
└──────────────────────────────────────────────┘
```

L'estimation de durée est un **calcul arithmétique sur le plan de prise**, pas une prédiction : stock divisé par la dose planifiée quotidienne. Formulée avec « ≈ » et « au rythme actuel ».

### 10.7 `EtiquetteProduit`

Rectangle 0,5 px, rayon 8, sans fond plein.
`Sur ordonnance` · `Sans ordonnance` · `Médication officinale` · `Produit libre` · `Dosage non exploitable` · `Surveillance renforcée` (repris de la BDPM, jamais commenté).

### 10.8 `BlocSource`

Obligatoire partout où une information externe apparaît.

```
Source : ANSM — Bon usage du paracétamol et des AINS
Consultée le 27/07/2026  ↗
```

La mention BDPM avec sa date de mise à jour figure en pied de tout écran catalogue et de tout document exporté — obligation de la licence ouverte.

### 10.9 Graphiques secondaires

Rétablis en v2. Tous sont des **comptages**, jamais des projections.

| Graphique | Forme | Usage |
|---|---|---|
| Répartition horaire | Histogramme 24 h | À quelles heures on prend |
| Tendance mensuelle | Barres empilées par ATC | Comparer les mois |
| Répartition par substance | Barres horizontales | Ce qui domine la période |
| Cumul journalier d'une substance | Ligne + graduation de repère | Vue 90 jours |

Marques fines, grilles récessives, couleurs ATC, une seule échelle par graphique. **Aucune courbe de tendance extrapolée, aucune projection, aucune moyenne mobile** — l'application affiche le passé, elle ne prédit rien.

---

## 11. Écrans

### 11.1 Navigation

```
Aujourd'hui  ·  Pilulier  ·  [ + ]  ·  Produits  ·  Repères
                                             ⚙ dans l'en-tête
```

L'onglet **Pilulier** est de premier rang et devient l'écran d'accueil dès qu'un plan de prise actif existe.

L'onglet **Repères** contient la bibliothèque éditoriale. Il n'est atteint que par appui délibéré : aucun de ses contenus n'est jamais poussé ou suggéré ailleurs (INV-3). Cette séparation est structurelle et ne peut pas être assouplie pour des raisons d'engagement.

### 11.2 Aujourd'hui

```
┌────────────────────────────────────────┐
│  ◉ Camille ▾                        ⚙  │
│                                        │
│  AUJOURD'HUI                           │
│  2 000 mg                              │  hero
│  ● paracétamol                         │
│  ███████████████░│░░░░░░  repère 3 000 │
│  2 prises · 08:12 · 14:30              │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │ 30 DERNIERS JOURS   18 j de prise│  │
│  │  ▓░ █ ░▒ ░                       │  │
│  │  ██ ░█ ▒░                        │  │  Plaquette
│  │  ▒█ ▓░ ▒█                        │  │  polychrome
│  │  █░ █▓ ░█                        │  │
│  │  ░ ⊙                             │  │
│  │  ● nerveux  ● musculo  ● respi   │  │
│  └──────────────────────────────────┘  │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │▌ 18 jours avec prise sur 30.     │  │  CarteSignal
│  │▌ « Les recommandations… »        │  │
│  │▌ Source ANSM · 27/07/2026 ↗      │  │
│  └──────────────────────────────────┘  │
│                                        │
│  AUJOURD'HUI                           │
│  08:12 ● Doliprane 1000        1 cp    │
│  14:30 ● Advil 400             1 cp    │
└────────────────────────────────────────┘
```

Sans prise et sans signal, l'écran reste sobre — il ne se remplit pas de cartes rassurantes.

### 11.3 Pilulier

Vue jour par défaut, bascule vers la vue semaine par geste horizontal ou sélecteur d'en-tête. Accès à la préparation de semaine depuis l'en-tête.

### 11.4 Produits

Liste groupée par mode de traitement, avec pastille ATC, stock et péremption. Recherche instantanée sur l'ensemble du catalogue.

**Fiche produit** : dénomination, forme, composition détaillée par substance, CIS et CIP en mono, étiquettes réglementaires, mode de traitement, dose par défaut, plan de prise, stock, péremption, photo de la boîte, historique des prises, Plaquette de la substance, accès à la `FicheNotice`.

### 11.5 Substance

Plaquette 90 jours, cumuls journaliers, tous les produits du catalogue contenant la substance, repères publiés avec sources. Aucune projection.

### 11.6 Catalogue et recherche

Recherche plein texte sur les ~15 800 spécialités : dénomination, substance, laboratoire, code. Filtres — sans ordonnance, médication officinale, forme, groupe ATC, générique. Classement par pertinence puis par état de commercialisation.

Depuis un résultat : ajouter à mes produits · consulter la notice · voir la substance.

### 11.7 Repères

Bibliothèque éditoriale. Catégories → fiches. Chaque fiche : titre, texte, `BlocSource`. Aucun lien vers un produit, aucun déclenchement depuis un symptôme, aucune personnalisation.

### 11.8 Réglages

Profils · Pilulier (moments, heures) · Rappels · Stock et péremption · Sécurité (verrouillage, biométrie) · Sauvegarde, restauration, synchronisation · Télémétrie (désactivée par défaut) · **Sources et données** (BDPM avec date, licence, version des règles) · Mentions légales et CGU · Version.

---

## 12. Extensions système

Rétablies en v2 — elles servent directement la contrainte des cinq secondes.

| Extension | Contenu |
|---|---|
| **Widget petit** | Cumul du jour de la substance dominante + bouton d'enregistrement |
| **Widget moyen** | Prochaines prises du pilulier + validation directe |
| **Widget grand** | Plaquette 30 jours |
| **Live Activity / notification persistante** | Prises restantes de la journée, si le pilulier est actif |
| **Raccourcis Siri / App Actions** | « Enregistrer un Doliprane » → saisie rapide préremplie |
| **Action rapide sur l'icône** | Enregistrer · Scanner · Pilulier du jour |
| **Watch** | Validation des prises du pilulier, cumul du jour |

Toutes fonctionnent hors ligne et ne transmettent rien. Aucun contenu médical sur l'écran verrouillé : la notification affiche `Rappel — Camille`, le détail n'apparaît qu'après déverrouillage.

---

## 13. Lexique éditorial (contractuel)

> S'applique à l'interface, aux fiches éditoriales, aux notifications, aux documents exportés, aux fiches store et à toute communication commerciale. Vérifié en intégration continue (`test_lexique_interdit`, bloquant au merge).
>
> **Exception explicite :** le texte reproduit d'une source institutionnelle (RCP, ANSM, HAS, Ameli), affiché en sérif et attribué, échappe au lexique — il est cité, pas rédigé. Le contrôle CI ignore les chaînes marquées `source: institutionnelle`.

### 13.1 Verbes d'effet — interdits dans le texte rédigé

`soulage` · `traite` · `soigne` · `guérit` · `apaise` · `calme` · `réduit` (appliqué à un symptôme) · `combat` · `lutte contre` · `efficace contre` · `agit sur` · `aide à` (effet physiologique) · `favorise` (effet physiologique) · `prévient` · `protège de`

### 13.2 Évaluation de l'utilisateur — interdits

`vous présentez` · `votre risque` · `anormal` · `excessif` · `trop` · `vous devriez` · `nous vous recommandons` · `il est conseillé de` · `attention, vous` · `votre score` · `votre niveau` · `bravo` · `bien joué` · `continuez comme ça`

### 13.3 Registre commercial — interdits

`réduisez vos douleurs` · `soulagez-vous naturellement` · `prenez le contrôle` · `libérez-vous des médicaments` · `alternative naturelle` · `remède` · `détox` · `naturellement`

### 13.4 Substitutions

| ❌ | ✅ |
|---|---|
| Vous avez dépassé la limite | Vous avez enregistré 3 500 mg. Le repère publié est de 3 000 mg par jour. |
| Attention : consommation excessive | 18 jours avec prise sur les 30 derniers jours |
| Nous vous recommandons de consulter | Vous pouvez montrer ce relevé à votre médecin ou à votre pharmacien |
| Vous avez oublié votre traitement | Prise du soir non validée |
| Observance : 87 % | *(à ne pas afficher — §9.6)* |
| La camomille favorise l'endormissement | L'infusion de camomille est traditionnellement consommée le soir |
| Alternatives naturelles | Repères d'hygiène de vie |
| Limite journalière | Repère publié |
| Alerte | Signal |

### 13.5 Le cas de la céphalée par abus médicamenteux

C'est l'information la plus utile du produit, et la plus délicate à formuler.

**Interdit — dépistage individualisé, bascule en classe IIa :**
> « Votre consommation évoque une céphalée par abus médicamenteux. »

**Autorisé — juxtaposition d'un comptage et d'une information publique :**
> **18 jours avec prise d'antalgique sur les 30 derniers jours.**
>
> *« Les recommandations sur les céphalées indiquent qu'une prise d'antalgiques 15 jours ou plus par mois, pendant plus de trois mois, expose à un risque de céphalée par abus médicamenteux. »* — en sérif
>
> Source [référence], consultée le [date] ↗

Le premier bloc est un fait sur l'utilisateur, en grotesque. Le second est un fait sur le monde, en sérif. **Aucune phrase ne relie les deux.**

### 13.6 Rédaction générale

- Voix active, phrases courtes, présent de l'indicatif.
- Vouvoiement. Ton neutre et soigné — **la neutralité porte sur le jugement, pas sur la qualité d'écriture.**
- Toujours l'unité et la période avec un chiffre : `2 000 mg aujourd'hui`.
- Une action garde le même nom du bouton au message : `Enregistrer` → `Prise enregistrée`.
- Aucun point d'exclamation.
- Pas de première personne du pluriel : l'application ne dit pas « nous ».
- Sentence case partout, y compris dans les eyebrows composés en capitales par CSS.

---

## 14. États vides, erreurs, onboarding

### 14.1 États vides

Une invitation à agir, jamais une ambiance. Pas d'illustration.

| Écran | Texte |
|---|---|
| Aujourd'hui, aucune prise | `Aucune prise enregistrée aujourd'hui.` + `[ Enregistrer une prise ]` |
| Pilulier sans plan | `Aucun traitement planifié. Créez un plan de prise pour un produit.` |
| Aucun produit | `Ajoutez un premier produit en le scannant ou en le recherchant.` |
| Recherche sans résultat | `Aucun médicament trouvé pour « … » dans la base BDPM.` + `[ Créer un produit libre ]` |
| Stock non suivi | `Le suivi de stock est désactivé pour ce produit.` + `[ Activer ]` |

### 14.2 Erreurs

Elles expliquent et proposent. Elles ne s'excusent pas.

| Situation | Texte |
|---|---|
| Code-barres illisible | `Code non reconnu. Recherchez le médicament par son nom.` |
| Caméra refusée | `L'accès à la caméra est désactivé. La recherche par nom reste disponible.` |
| Dosage non exploitable | `Le dosage de ce produit n'est pas exploitable automatiquement. La prise est enregistrée mais n'entre pas dans le cumul par substance.` |
| Catalogue non à jour | `Référentiel BDPM du 12/07/2026. La mise à jour n'a pas abouti ; les données restent utilisables.` |
| Restauration échouée | `Phrase de passe incorrecte. L'archive ne peut pas être ouverte sans elle.` |
| Conflit de synchronisation | `Deux versions de ce jour existent. Choisissez celle à conserver.` |

### 14.3 Onboarding

Cinq écrans, aucun compte, aucune donnée demandée avant usage.

1. **Ce que fait l'application** — « Enregistrez ce que vous prenez. Le comptage se fait par substance active, pas par boîte. »
2. **Ce qu'elle ne fait pas** — « Elle ne donne pas de conseil médical, ne remplace pas un professionnel de santé, et ne recommande aucun traitement. » *Écran obligatoire, non passable.*
3. **Vos données** — « Tout reste sur cet appareil, chiffré. Rien n'est envoyé sur un serveur. »
4. **Traitement régulier ?** — bifurcation vers la création d'un pilulier, ou passage.
5. **Premier produit** — scanner, rechercher, ou passer.

L'écran 2 n'est pas une formalité juridique : c'est la définition du produit et le cadrage d'attente.

---

## 15. Accessibilité

Cible **WCAG 2.1 AA**.

| Exigence | Mise en œuvre |
|---|---|
| Contraste texte | ≥ 4,5:1 corps, ≥ 3:1 grands caractères, vérifié dans les deux thèmes |
| Contraste non textuel | ≥ 3:1 entre alvéoles adjacentes et pastilles voisines |
| Jamais la couleur seule | Les groupes ATC portent une étiquette textuelle dans les légendes ; les niveaux de la Plaquette varient en opacité **et** portent un compte dans l'étiquette a11y ; les états du Pilulier se distinguent par la forme (plein, contour, barré) |
| Daltonisme | Palette ATC vérifiée en deutéranopie et protanopie ; ambre / vert / bleu / violet restent distincts. Mode « fortes différences » en réglages, qui accroît l'écart de luminosité entre groupes |
| Type dynamique | Jusqu'à 200 % ; colonne unique au-delà de 130 % ; aucune troncature de chiffre |
| Lecteurs d'écran | Chaque alvéole et pastille étiquetée ; ordre de lecture explicite ; Pilulier navigable ligne par ligne |
| Cibles tactiles | 48 × 48 minimum |
| Mouvement | `prefers-reduced-motion` respecté |
| Saisie | Aucune limite de temps, aucun geste complexe obligatoire, tout balayage doublé d'une action de menu |
| Seniors | Densité modérée par défaut, base 16, jamais de gris clair sur clair pour une information essentielle. Le Pilulier est explicitement conçu pour ce public. |

---

## 16. Documents imprimés

### 16.1 Relevé de consommation

A4, monochrome, lisible en photocopie — un cabinet imprime encore.

```
Marges       : 18 mm
Typographie  : Geist pour la structure et les chiffres,
               Geist Mono pour les codes,
               Newsreader pour toute mention sourcée
Couleur      : noir + niveaux de gris.
               Variante couleur ATC proposée à l'export.
Plaquette    : SVG inline
Pied de page : source BDPM et date · version des règles ·
               version de l'application · pagination
```

Bandeau en pied de première page, corps 9 :
`Données déclaratives saisies par l'utilisateur, non vérifiées. Document sans valeur médicale. Référentiel BDPM du JJ/MM/AAAA.`

### 16.2 Plan de prise imprimable

Nouveau en v2. Le document que l'aidant colle sur le semainier ou emmène à l'officine.

Une page A4, format tableau, gros caractères (14 pt minimum), une ligne par produit, une colonne par moment, avec forme galénique et dose. Photo du produit en vignette si disponible — pour un patient âgé, l'aspect de la boîte identifie mieux que son nom.

Aucune mention de seuil, aucun signal, aucune couleur d'alerte. C'est un document logistique.

---

## 17. Iconographie et marque

Jeu d'icônes propriétaire, tracé 1,5 px, grille 24, angles légèrement adoucis. Géométrie plutôt que représentation.

Aucune icône médicale conventionnelle : ni stéthoscope, ni gélule stylisée, ni cœur, ni croix rouge. Le vocabulaire est celui de l'emballage — l'alvéole, la grille, le trait, le code.

**Icône d'application** : grille d'alvéoles 3 × 3, une seule pleine, en `--sable` sur `--fond`. Lisible à 24 px, immédiatement distincte des croix et des gélules qui saturent la catégorie Santé des stores.

---

## 18. Livrables

| Livrable | Format |
|---|---|
| Jetons de design | `tokens.json` + `theme.ts` typé, deux thèmes |
| Table de couleurs ATC | `atc-colors.json`, dérivation de nuance documentée |
| Bibliothèque de composants | Storybook React Native, tous états, deux thèmes |
| Maquettes haute fidélité | Figma — 22 écrans, sombre et clair |
| Prototypes de parcours | Saisie rapide · scan · pilulier du jour · préparation de semaine · export |
| Jeu d'icônes | SVG + police d'icônes |
| Icône, écran de lancement, widgets | Toutes densités iOS et Android |
| Captures store | 6 par plateforme, **passées au lexique §13** |
| Gabarits imprimés | HTML/CSS — relevé et plan de prise |
| Guide éditorial | §13, exporté en fichier de règles pour la CI |

---

## Annexe — Points à trancher

1. **Nom définitif.** `MOLÉCULE` porte le différenciateur mais reste clinique. `ALVÉOLE` est plus incarné et cohérent avec le système de design — au prix d'une collision de nommage à arbitrer.
2. **Modèle économique.** Gratuit, achat unique, ou abonnement. Un abonnement sur un outil de sécurité sanitaire pose une question d'acceptabilité, et le pilulier est précisément la fonction qui justifierait un paiement.
3. **Densité par défaut.** Le public senior et le public power-user n'ont pas les mêmes besoins. Un réglage de densité en deux crans est probablement nécessaire dès la V1.
4. **Photographie.** Autorisée pour les boîtes de médicaments (utile à l'identification, prise par l'utilisateur). Toujours proscrite pour les personnes et les mises en scène de bien-être.
