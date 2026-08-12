# Architecture

Ce document décrit **ce qui a été construit**, non ce qui était prévu. La
spécification est dans [`spec-technique.md`](spec-technique.md) ; quand les deux
divergent, c'est ici que l'écart est expliqué, et dans
[`maquette/manques.md`](maquette/manques.md) §5.3 qu'il est consigné.

---

## Le problème, en une phrase

Doliprane 1000, Fervex et Actifed Rhume sont trois boîtes. Personne n'en compte
la somme, et pourtant elles versent toutes du paracétamol dans le même foie.
L'application compte **par substance active**. Tout le reste — écrans, pilulier,
rappels — n'existe que pour alimenter ce calcul ou le restituer.

D'où l'ordre de construction : le cumul d'abord. S'il est faux, le reste ne vaut
rien.

---

## Vue d'ensemble

```
   ANSM / BDPM                Assurance Maladie
   5 fichiers .txt            Open Medic (codes ATC)
        │                            │
        └────────────┬───────────────┘
                     ▼
        pipeline/  (Python 3.12 + polars)
        GitHub Actions, tous les mercredis
                     │
                     │  catalogue-<date>.sqlite.br  (1,8 Mo)
                     │  catalogue-<date>.sqlite.gz  (3,0 Mo)
                     │  manifest.json  (SHA-256, métriques, date BDPM)
                     ▼
        public/bundles/  ──────  servis par GitHub Pages
                     │
                     │  téléchargés au premier lancement
                     ▼
   ┌─────────────────────────────────────────────────┐
   │  Le téléphone — tout se passe ici               │
   │                                                 │
   │   src/services/catalogue.ts                     │
   │      décompresse, vérifie l'empreinte           │
   │            │                                    │
   │            ▼                                    │
   │   src/db/  SQLite WASM, VFS opfs-sahpool        │
   │      cat.db  catalogue, lecture seule           │
   │      user.db carnet de l'utilisateur            │
   │            │                                    │
   │            ▼                                    │
   │   src/domain/  PUR — cumul, règles, occurrences │
   │            │                                    │
   │            ▼                                    │
   │   src/ui/  React 19, jetons de la maquette      │
   └─────────────────────────────────────────────────┘
                     │
                     │  facultatif (§10)
                     ▼
        worker/  Cloudflare — push chiffré + webcal
```

Aucune donnée de santé ne quitte l'appareil. Le Worker de rappel reçoit un
endpoint, un fuseau, des heures et un blob chiffré dont il n'a pas la clé : il
sait qu'un ping est attendu à 21 h, jamais pourquoi.

---

## `pipeline/` — de la BDPM au bundle

Neuf étapes, une fonction par module, orchestrées par `build.py`. Le détail des
sources et des pièges d'encodage est dans [`../pipeline/README.md`](../pipeline/README.md).

Ce qu'il faut retenir ici, c'est **le point où une erreur rend l'application
dangereuse**.

### La ligne comptée

`CIS_COMPO_bdpm.txt` décrit une composition par lignes reliées entre elles par
`num_liaison`. Deux natures coexistent :

| Nature | Contenu |
|---|---|
| `SA` | la substance telle qu'elle est formulée — souvent un sel |
| `FT` | sa fraction thérapeutique — la molécule qui agit |

La spec les appelle `SA` et `ST` ; la source publie `FT`. Surtout, ce ne sont
**pas** deux substances : ce sont deux masses de la même molécule sur la même
liaison. 1 000 mg de paracétamol codéiné, c'est 1 000 mg de paracétamol, pas
2 000.

> **La règle absolue : une seule ligne comptée par `num_liaison`, jamais deux.**
> Sommer `SA` et `FT` double le paracétamol et rend l'application plus
> dangereuse que son absence.

Trois politiques sont implémentées, `fraction_therapeutique` par défaut :

| Politique | Ligne retenue | Conséquence |
|---|---|---|
| `fraction_therapeutique` | FT si elle porte un dosage, sinon SA | le cumul est en molécule active, unifiée entre sels |
| `substance_active` | SA d'abord, FT en secours | — |
| `substance_active_stricte` | SA seule, lecture littérale de la spec | fiabilité 82,8 % : les sels sans dosage SA sortent du cumul |

Le défaut n'est pas un confort. Naproxène et naproxène sodique, codéine et
phosphate de codéine portent des codes distincts : sans la fraction
thérapeutique, deux boîtes de la même molécule se comptent séparément.

### Le dosage, ou son absence

`dosages.py` normalise vers des milligrammes par unité de prise et attribue une
fiabilité :

| Fiabilité | Sens | Effet sur le cumul |
|---|---|---|
| `2` | dosage lu directement, unité de masse explicite | compté |
| `1` | valeur dérivée — « pour 100 g de poudre », concentration × volume | compté, l'UI mentionne la dérivation |
| `0` | non analysable — dilutions homéopathiques, « quantité suffisante pour » | **exclu**, la prise reste enregistrée |

> **Aucune estimation par défaut.** Un dosage illisible ne reçoit jamais de
> valeur plausible pour faire tourner un calcul. Il donne `fiabilite = 0`,
> la prise est enregistrée, elle ne compte pas, et l'écran le dit.

Sur les 32 420 lignes de composition, 17 450 sont comptées ; 12 322 portent une
fiabilité nulle, dont l'essentiel est homéopathique.

### Codes ATC

La BDPM n'en publie aucun. La seule source publique française est Open Medic
(Assurance Maladie), qui relie des CIP13 à des ATC5. `atc.py` en tire un code
par trois voies, tracées dans le manifest :

| Origine | Substances | Méthode |
|---|---|---|
| `nom` | 611 | correspondance de libellé |
| `liaison` | 405 | propagation sel ↔ fraction thérapeutique |
| `vote` | 374 | spécialités mono-substance : l'ATC du produit est celui de la molécule |
| `aucune` | 2 505 | non résolu |

1 390 substances sur 3 895 portent un ATC, et 8 958 spécialités sur 15 857. La
couverture compte moins que sa complétude sur les molécules réglées : le
contrôle §6.5 vérifie que **toute** substance ou classe visée par une règle est
couverte, et bloque sinon.

Une classe qualifie un **produit**, pas une molécule : « antalgique en
association » n'a aucun sens appliqué à du paracétamol seul. D'où
`specialite.atc` et `specialite.classe`, absents de la spec.

### Les six contrôles bloquants

`controles.py` refuse de publier si l'un échoue. État du bundle courant :

| Contrôle | Résultat |
|---|---|
| Nombre de spécialités dans 12 000–20 000 | 15 857 |
| Variation vs bundle précédent < 5 % | 0,00 % |
| Fiabilité des formes orales sèches ≥ 95 % | **98,89 %** sur 10 105 liaisons |
| Aucune liaison sans ligne SA | 0 |
| Couverture ATC des substances réglées | 3 substances, 6 classes |
| Jeu doré exécuté sur le catalogue | 9 cas |

6 499 liaisons homéopathiques sont exclues du dénominateur de fiabilité et
comptées à part : dosées en dilutions `4CH` à `30CH`, elles n'ont pas
d'équivalent massique. Les inclure ferait tomber le taux à 60,18 % sans qu'une
seule ligne de parseur soit en cause. Le contrôle existe pour détecter une
régression du parseur, pas pour être satisfait.

---

## `src/db/` — deux bases, un seul propriétaire

```
   UI (thread principal)
        │  client.ts — Proxy : toute méthode de depots.ts devient asynchrone
        ▼
   worker.ts (Web Worker)  ── propriétaire exclusif de la connexion
        │
        ├─ user.db   carnet : profils, produits, prises, plans, occurrences
        └─ cat.db    catalogue, ATTACH en mode=ro
```

Le VFS **`opfs-sahpool` est obligatoire**. Le VFS `opfs` par défaut exige les
en-têtes COOP/COEP, que GitHub Pages ne peut pas émettre. Deux conséquences que
la spec §5.5 énonce et que le code applique :

- le catalogue s'installe par `importDb()`, pas par écriture de fichier ;
- le VFS prend un verrou exclusif : **une seule connexion**. D'où le Web Worker
  propriétaire, et l'écran dédié quand l'application est ouverte dans un second
  onglet — `BaseDejaOuverte` remonte jusqu'à `App.tsx`.

### Trois corrections apportées à la spec

Elles sont dans `manques.md` §5.3, résumées ici parce qu'on les rencontre en
lisant le code.

**`PRAGMA cat.query_only = 1` ne fait pas ce qu'il annonce.** `query_only` est un
réglage de **connexion** : le préfixe de schéma est ignoré et *toute* la
connexion passe en lecture seule, `user.db` compris. Symptôme : `SQLITE_READONLY`
à la création du premier profil. La lecture seule vient désormais de l'URI
d'attachement, `file:…?mode=ro`.

**L'opérande gauche de `MATCH` doit être le nom nu de la table FTS.** Ni
`cat.specialite_fts`, ni un alias : « no such column ». La recherche passe donc
par une sous-requête.

```sql
SELECT s.cis, … FROM cat.specialite s
JOIN (SELECT rowid AS ligne, rank AS rang FROM cat.specialite_fts
      WHERE specialite_fts MATCH ?1) f ON f.ligne = s.rowid
ORDER BY s.commercialisee DESC, f.rang LIMIT ?2
```

**Le Brotli seul ne suffit pas.** `DecompressionStream('br')` n'existe ni sur
Safari ni sur Firefox, et un serveur de fichiers statiques ne pose pas
`Content-Encoding` sur un fichier pré-compressé. Le pipeline publie donc **aussi**
une variante gzip ; `services/catalogue.ts` renifle les octets magiques et
vérifie `sha256_sqlite` — l'empreinte du SQLite décompressé, la seule qui tienne
quoi que le serveur ait fait des octets en chemin.

---

## `src/domain/` — le cœur, et il est pur

Trois modules, aucune dépendance à la base, à l'UI, au réseau ni à `Date.now()`.
**L'instant est injecté**, toujours. C'est ce qui rend le domaine testable à
100 % de branches — état actuel : 100 % sur les trois.

### `cumul.ts`

Additionne les milligrammes par substance sur une fenêtre, en n'agrégeant que
les prises de fiabilité non nulle.

Une difficulté que la maquette n'avait pas anticipée : **une boîte peut contenir
plusieurs éléments pharmaceutiques.** 1 437 spécialités sont dans ce cas — HUMEX
RHUME est une boîte de comprimés *et* de gélules, une plaquette contraceptive
multiphasique porte un comprimé blanc et un rose à dosages différents.

Tant que l'utilisateur n'a pas dit **lequel** il a pris, `substancesPourPrise`
ne compte rien et retourne `elementsAChoisir`. Il n'y a pas de choix par
défaut : c'est le cas qui a fait échouer le jeu doré à 2 500 mg au lieu de
2 000 sur HUMEX RHUME.

### `regles.ts`

`validerBundle` puis `evaluer`. Cinq types de règles, neuf règles chargées
depuis `data/regles.json`, chacune avec sa `source` et sa date.

**Les traitements prescrits sont exemptés des signaux de fréquence.** Chaque
produit porte `mode: 'prescrit' | 'libre'` ; `duree_consecutive` et
`jours_de_prise` ne s'évaluent que sur `libre`. Un patient sous ordonnance ne
doit jamais lire que sa consommation est élevée — et le validateur **rejette**
tout bundle où une règle de ces deux types inclurait `prescrit` dans son `mode`.

Un bundle invalide n'est pas chargé du tout : mieux vaut aucun signal qu'un
signal faux.

Ce que le moteur ne produit jamais : score, taux d'observance, jauge de risque,
phrase qui relie deux faits. Il restitue deux constats juxtaposés et une source
datée. `src/ui/textes.ts` verrouille le vocabulaire, et quatorze tests échouent
si un mot interdit réapparaît.

### `occurrences.ts`

`analyserRrule` — sous-ensemble RFC 5545 plus `X-CYCLE=21/7` pour les plaquettes
contraceptives — puis `genererOccurrences`, `regenerer`, `expirer`.

Deux pièges traités par des tests dédiés :

- **la fenêtre de 24 h est glissante, pas calendaire.** Une prise à 23 h et une
  à 1 h sont dans la même fenêtre. Les comptages de *jours*, eux, utilisent le
  jour calendaire local ;
- **le changement d'heure** ne doit ni dupliquer ni perdre une occurrence.
  `prise.horodatage` est en ISO 8601 avec offset, `prise.fuseau` en IANA, et
  rien n'est normalisé en UTC pour compter des jours.

**Aucune logique d'oubli de pilule.** La conduite à tenir dépend du type de
pilule, de la fenêtre écoulée et de la semaine du cycle. L'application
enregistre l'oubli, affiche l'heure prévue et l'heure réelle, et renvoie à la
notice ou au pharmacien. Elle n'affiche aucune consigne, et ce vide est
intentionnel.

---

## `src/ui/` — les jetons avant les écrans

L'ordre imposé par `CLAUDE.md` a été suivi : extraction des jetons
(`tokens.css`, `tokens.ts`) par lecture directe de `docs/maquette/export/`,
inventaire des composants (`maquette/composants.md`), puis construction.

**Aucune valeur en dur dans un composant.** Ce qui manque à la maquette est
consigné dans `manques.md`, jamais comblé par une valeur plausible — le thème
sombre, absent de l'export, est le manque le plus visible : il bloque une
livraison complète de L2 et n'a pas été inventé.

Trois points de la spec §12 priment sur la maquette et sont respectés : la
couleur d'une substance vient de son groupe ATC, une jauge de cumul est
linéaire, et il n'existe ni streak, ni rouge, ni pourcentage d'observance. Une
variante de la maquette s'appelait `observance` ; elle est implémentée sous le
nom `validation`, et la contradiction est signalée dans `manques.md` §1.3.

`/kitchen-sink` rend tous les composants dans tous leurs états. La route est
accessible **sans installation**, avant même le garde-fou de `App.tsx` : c'est
la page à comparer à la maquette sur téléphone.

### Deux refus assumés avant tout écran

`App.tsx` bloque dans deux cas, et ce sont des fonctionnalités :

- **second onglet** — le VFS prend un verrou exclusif ;
- **application non installée** — sur iOS, une PWA non installée n'a pas la Push
  API et voit son stockage purgé au bout de sept jours. Un journal de pilule
  dans un onglet Safari est un piège, donc aucun profil n'est créé.

---

## `src/services/` — ce qui touche au monde extérieur

| Module | Rôle | À savoir |
|---|---|---|
| `catalogue.ts` | téléchargement, décompression, vérification | renifle brotli/gzip, vérifie `sha256_sqlite` |
| `ics.ts` | génération RFC 5545 | `vtimezone` dérivée, `RDATE` pour les cycles, `UID` + `SEQUENCE` stables |
| `gs1.ts` / `scan.ts` | Datamatrix des boîtes | `BarcodeDetector` si présent, sinon `@zxing/library` |
| `releve.ts` | relevé 90 jours à imprimer | des chiffres et une méthode, aucune conclusion |
| `sauvegarde.ts` | archive chiffrée | phrase de passe perdue = archive irrécupérable, sans recours |
| `pilulier.ts` | régénération des occurrences | appelée à chaque ouverture |

**ZBar ne décode pas le Datamatrix.** La spec le proposait comme repli sur
Safari ; ZBar couvre le linéaire et le QR, pas l'ECC 200 des boîtes françaises.
Le repli est `@zxing/library`, chargé à la demande pour rester hors du bundle
initial (`manques.md` §5.4).

---

## `worker/` — facultatif, et aveugle

Cloudflare Workers + KV + Cron Triggers. **L'application fonctionne sans lui**,
avec la seule couche calendrier, et le dit dans les réglages.

Ce partage n'est pas arbitraire. Le calendrier est la **garantie** : l'alarme
est gérée par le système d'exploitation, sans réseau, indépendante du Worker et
de l'application. Le push est la couche **actionnable** — valider une prise en
un appui — jamais la garantie. C'est pourquoi le calendrier est activé par
défaut pour une pilule et non désactivable sans confirmation explicite.

Le Worker s'exécute chez Cloudflare, à la demande : aucune machine à faire
tourner. Il vit sur son propre nom d'hôte, l'enregistrement DNS de GitHub Pages
devant rester non proxifié pour que GitHub émette son certificat — d'où les
en-têtes CORS et la réponse aux préflights `OPTIONS`.

---

## Ce qui est injecté, et pourquoi ça compte

| Injecté | Où | Pourquoi |
|---|---|---|
| l'instant | tout le domaine, `maintenant()` dans `App.tsx` | sans quoi rien n'est testable et le passage de minuit devient un bug intermittent |
| le fuseau | `prise.fuseau`, IANA | compter des jours en UTC est faux dès qu'on voyage |
| les règles | `data/regles.json`, embarqué | le moteur ne dépend jamais du réseau |
| le catalogue | bundle versionné, empreinte vérifiée | la date de source est affichée dans l'app et sur tout document exporté, comme la licence l'exige |

---

## Où regarder en premier

| Question | Fichier |
|---|---|
| Pourquoi ce cumul vaut-il cette valeur ? | `src/domain/cumul.ts`, puis `__tests__/golden.test.ts` |
| Pourquoi cette ligne de composition n'est-elle pas comptée ? | `pipeline/composition.py`, en-tête du module |
| Pourquoi ce signal ne s'affiche-t-il pas ? | `mode` du produit, puis `src/domain/regles.ts` |
| D'où vient cette couleur ? | `src/ui/tokens.css`, jamais du composant |
| Pourquoi l'app refuse-t-elle de démarrer ? | `src/ui/App.tsx`, les deux refus |
| Ce que la maquette ne tranche pas | `docs/maquette/manques.md` |
