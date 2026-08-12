# État de livraison — lots L0 à L5

Ce qui est construit, ce qui ne l'est pas, et les chiffres pour le vérifier.

Mesures du **12 août 2026**, bundle BDPM du **3 août 2026**. Tout ce qui suit se
reproduit par `pnpm test`, `pnpm test:couverture` et
`.venv/bin/python -m pipeline.build`.

---

## Résumé

| Lot | Objet | État |
|---|---|---|
| L0 | Pipeline BDPM | livré |
| L1 | Base, domaine, jeu doré | livré |
| L2 | Jetons et écrans | livré **sauf thème sombre** — absent de la maquette |
| L3 | Pilulier, plans, occurrences | livré |
| L4 | Rappels, Worker, installation PWA | livré, **réception non vérifiable sans matériel réel** |
| — | Verrou par code, survie au site refermé | livré — hors lots, demandé après coup |
| L5 | Scan, relevé, sauvegarde | livré |

Trois réserves, détaillées plus bas : le thème sombre, la réception des rappels,
et les clés du Worker qui restent à générer au premier déploiement.

---

## Les chiffres demandés

### Spécialités

**15 857** spécialités, 20 901 présentations, 3 895 substances, 32 420 lignes de
composition dont **17 450 comptées** — une par `num_liaison`, jamais deux.

### Fiabilité sur les formes orales sèches

**98,89 %**, seuil de blocage à 95 %.

Le dénominateur mérite d'être lu :

| | Liaisons |
|---|---|
| Formes orales sèches | 16 604 |
| dont homéopathiques, exclues | 6 499 |
| **Dénominateur retenu** | **10 105** |
| Comptées | 9 993 |
| **Taux** | **98,89 %** |
| Taux si l'homéopathie était incluse | 60,18 % |

Les dilutions `4CH` à `30CH` n'ont pas d'équivalent massique. Les compter comme
des échecs de parsing ferait chuter la métrique de 39 points sans qu'une seule
ligne de code soit en cause — le contrôle sert à détecter une régression du
parseur, pas à être satisfait. L'exclusion est chiffrée à part dans le manifest,
jamais silencieuse.

Répartition des fiabilités sur l'ensemble des lignes :

| Fiabilité | Lignes | Sens |
|---|---|---|
| `2` | 9 859 | dosage lu, unité de masse explicite |
| `1` | 10 239 | valeur dérivée, mentionnée dans l'UI |
| `0` | 12 322 | non analysable — **exclu du cumul**, prise enregistrée |

Aucune valeur par défaut n'a été introduite pour faire monter ce chiffre.

### Jeu doré

**45 tests passent**, dont le cas fondateur :

```
2 × Doliprane 1000 + 2 sachets Fervex (500 mg) = 3 000 mg de paracétamol
```

Il s'exécute sur le **vrai bundle** — `catalogue-2026-08-12.sqlite.br`, lu par
`node:sqlite` — jamais sur des compositions fabriquées. Quatre familles :
catalogue réel, cumul par substance, invariants du moteur de règles,
occurrences.

Le pipeline rejoue par ailleurs 9 cas dorés sur le catalogue avant publication :
c'est le sixième contrôle bloquant.

### Suite complète

**176 tests, 7 fichiers.**

| Fichier | Tests |
|---|---|
| `domain/__tests__/domaine.test.ts` | 68 |
| `db/__tests__/verrou.test.ts` | 12 |
| `domain/__tests__/golden.test.ts` | 45 |
| `services/__tests__/ics.test.ts` | 15 |
| `services/__tests__/gs1.test.ts` | 14 |
| `ui/__tests__/textes.test.ts` | 14 |
| `services/__tests__/sauvegarde.test.ts` | 8 |

Couverture du domaine pur, exigée à 100 % de branches :

```
File            | % Stmts | % Branch | % Funcs | % Lines
cumul.ts        |     100 |      100 |     100 |     100
occurrences.ts  |     100 |      100 |     100 |     100
regles.ts       |     100 |      100 |     100 |     100
```

### Bundle

| | |
|---|---|
| Brotli | 1 923 671 o (1,8 Mo) |
| gzip | 3 041 235 o (3,0 Mo) |
| SQLite décompressé | 11 309 056 o |
| Date BDPM | 2026-08-03 |
| Version des règles | 2026.08.12 |

Les deux compressions sont publiées : `DecompressionStream('br')` n'existe ni
sur Safari ni sur Firefox. L'application vérifie `sha256_sqlite`, l'empreinte du
SQLite **décompressé** — la seule qui tienne quoi que le serveur ait fait des
octets en chemin.

---

## Lot par lot

### L0 — Pipeline BDPM

Téléchargement des cinq fichiers BDPM et d'Open Medic, détection d'encodage,
normalisation des dosages, enrichissement ATC, génération SQLite avec index et
FTS5, six contrôles bloquants, publication Brotli + gzip + SHA-256 + manifest.

Les six contrôles sont verts. Le détail est dans
[`architecture.md`](architecture.md#les-six-contrôles-bloquants).

Deux découvertes faites à l'exécution, contre le texte de la spec :

- les URL de téléchargement BDPM ont changé — `/download/file/<nom>` ;
  l'ancien `telechargement.php?fichier=` renvoie 404 ;
- la source publie `FT`, pas `ST`, et les lignes `SA` des sels ne portent
  souvent aucun dosage. D'où la politique `fraction_therapeutique` par défaut.

### L1 — Base et domaine

SQLite WASM en VFS `opfs-sahpool`, Web Worker propriétaire, schéma §5.2,
`cat.db` attachée en lecture seule. Trois modules purs, l'instant injecté,
couverture 100 %.

Le jeu doré a été **écrit avant** le domaine, comme demandé. Il a trouvé deux
défauts réels avant toute UI : le double comptage `SA`/`FT`, et le cas des
boîtes à plusieurs éléments pharmaceutiques (HUMEX RHUME, 2 500 mg au lieu de
2 000).

Trois erreurs du texte de la spec ont été corrigées et consignées dans
`manques.md` §5.3 : `PRAGMA cat.query_only`, la colonne `substances` de
`specialite_fts`, et le service du bundle Brotli.

### Reprise UI — marque, coquille, saisie, responsive

Quatre défauts structurels trouvés en relisant l'application écran par écran,
tous mesurés avant correction.

**Le logo était inventé.** L'export de la maquette référence une image absente
du dossier ; au lieu de s'arrêter, un damier 3×3 avait été dessiné et posé en
icône PWA, dans la couleur d'action alors que `--marque` existait. Le vrai
logo est désormais dans l'export : `scripts/extraire-marque.mjs` le détoure par
diffusion depuis les bords — l'intérieur de la croix est blanc, un seuil global
l'aurait perforé — et sépare le pictogramme du mot-symbole par composantes
connexes, les feuilles passant au-dessus du « M » sans gouttière entre les deux.

Le mot-symbole est placé où la maquette le veut, et nulle part ailleurs :
onboarding, bienvenue, verrou, relevé exporté. Pas dans l'en-tête courant, qui
porte le nom du profil.

**Neuf écrans n'avaient pas d'en-tête.** `EnTete` n'était rendu que par
`Aujourdhui` : Pilulier, Plan, Produit, Produits, Réglages, Repères, Scan,
Substance et Mentions légales n'avaient ni nom de profil, ni accès aux réglages,
ni retour. La coquille est montée dans `App.tsx`, avec une variante « retour »
pour les écrans de détail.

**La saisie était inutilisable.** Cinq défauts : liste bornée aux huit premiers
produits sans recherche, carnet vide sans issue, groupe ATC codé en dur — ce qui
viole §12.2 — unité affichée à la place du dosage, et nom du produit à la place
de l'équivalent en milligrammes, qui est la fonction même de l'application.

**Rien n'était adaptatif.** Aucune règle `@media` dans tout le CSS, et aucune
réinitialisation ne posait `box-sizing: border-box` : tout conteneur en
`width: 100%` additionnait sa marge intérieure à la largeur de l'écran, soit
32 px de débordement horizontal sur chaque écran à 390 px.

Vérifié par `pnpm verifier:ui` — parcours complet dans Chromium avec le vrai
bundle, à 320, 390, 768 et 1280 px :

```
✓ aucun débordement, aucune erreur JS
```

### L2 — Jetons et écrans

Extraction d'abord, inventaire ensuite, construction enfin. `tokens.css` et
`tokens.ts` viennent de la lecture directe de `docs/maquette/export/` ; aucune
valeur en dur dans un composant ; treize écrans, `/kitchen-sink` à jour.

> **Réserve — le thème sombre n'existe pas.**
>
> L'export ne livre que la direction claire, tout en faisant référence à une
> palette sombre antérieure dont les valeurs manquent. L'inventer, c'était
> inventer douze couleurs de chrome et **onze teintes ATC** — or les teintes ATC
> portent de l'information (§12.2), pas de la décoration.
>
> `tokens.css` déclare donc `color-scheme: light`, sans bloc
> `prefers-color-scheme: dark`. Le protocole demande les deux thèmes dès
> l'extraction : **ce point bloque une livraison complète de L2** et attend une
> décision. `manques.md` §1.1.

Trois écrans de la maquette ne sont pas implémentés, et c'est délibéré :
« Préparer la semaine » (hors périmètre V1 selon §3.1), « Notice / RCP »
(reporté, un lien vers la page officielle suffit), et « Type dynamique 200 % »
qui est une contrainte, pas un écran.

### L3 — Pilulier

Plans, occurrences matérialisées, vue jour et vue semaine, validation groupée.
Régénération à chaque ouverture, puis passage des non traitées à `expiree` —
sans notification, sans badge.

Le changement d'heure fait l'objet d'un test dédié : la régénération ne doit ni
dupliquer ni perdre une occurrence.

Aucune consigne d'oubli de pilule n'est affichée nulle part. L'application
enregistre l'oubli, montre l'heure prévue et l'heure réelle, et renvoie à la
notice ou au pharmacien. Ce vide est une décision, pas un manque.

### L4 — Rappels et installation

Worker Cloudflare (push chiffré RFC 8291, VAPID RFC 8292, KV, Cron à la minute),
génération `.ics` RFC 5545 avec `UID` + `SEQUENCE`, service worker Workbox en
`injectManifest`, icônes, `beforeinstallprompt`, `navigator.storage.persist()`
rappelé à chaque ouverture.

Installabilité vérifiée dans Chromium sur un build de sous-chemin :

```
erreurs de manifeste : []
icone 192x192 any       → 200 image/png
icone 512x512 any       → 200 image/png
icone 512x512 maskable  → 200 image/png
apple-touch-icon.png    → 200
service worker : scope actif
```

> **Réserve — la réception d'un rappel n'est pas vérifiable ici.**
>
> §16.2 l'exige sur matériel réel, et c'est justifié : un simulateur ne
> reproduit ni le doze mode d'Android, ni les restrictions de la Push API sur
> PWA iOS installée. Restent à valider sur un iPhone et un Android physiques :
> réception d'un push sur PWA iOS installée, réception Android en veille
> prolongée, import du `.ics` sur Apple Calendar **et** sur Google Agenda, et
> réimportation après modification d'un plan — c'est là que se jouent les
> alarmes en double.

> **Réserve — les clés du Worker restent à générer.**
>
> `worker/wrangler.toml` porte deux `à renseigner au premier déploiement` :
> l'identifiant du namespace KV et la clé publique VAPID. La clé privée est un
> secret `wrangler`, elle ne figurera jamais dans le dépôt. Procédure dans
> [`deploiement.md`](deploiement.md). Sans ces clés, l'application fonctionne
> avec la seule couche calendrier et l'annonce.

### Hors lots — Verrou par code et survie au site refermé

Demandés après la livraison des six lots.

**Verrou.** Pas de compte : rien n'est partagé ni synchronisé, il n'y aurait
rien à authentifier. Un code de 4 à 8 chiffres est posé au premier lancement sur
l'appareil, redemandé à chaque ouverture, et la session se referme au bout de
deux minutes en arrière-plan. La preuve est dérivée par **Argon2id** (paramètres
OWASP), salée, et le code n'est jamais stocké. Attente croissante après cinq
essais ratés, plafonnée à 30 s. 12 tests.

Le contrôle est **dans le Worker propriétaire de la base**, pas dans l'UI :
toute méthode touchant au carnet est refusée tant que le code n'a pas été donné.
Un écran qu'on contourne depuis la console ne protège rien.

> **Réserve — le verrou ne chiffre pas la base.**
>
> §15 prévoit à terme un AES-GCM applicatif sur les champs sensibles, adossé à
> WebAuthn PRF. Ce n'est **pas** livré. Le verrou couvre la menace que §15 nomme
> — « un téléphone perdu ou prêté, pas une attaque ciblée » — mais qui
> extrairait le stockage OPFS lirait le carnet. Le chiffrement du disque par iOS
> ou Android reste la couche qui répond à ce cas.
>
> L'interface ne dit nulle part que les données sont chiffrées, et ne doit
> jamais le dire.

**Survie au site refermé.** Le scénario visé : héberger le temps que tout le
monde installe, puis repasser le dépôt en privé. Deux constats, l'un vérifié,
l'autre construit.

Vérifié dans Chromium, tout répondant 404 : une PWA installée **n'est pas
désinscrite**, y compris après avoir forcé la revérification du script du
service worker — celle qui n'a normalement lieu qu'une fois par 24 h.

Construit : le catalogue est désormais mis en cache **dès l'installation du
service worker**, donc dès la première visite dans le navigateur, avant même
l'ajout à l'écran d'accueil. C'était le vrai point de fragilité — il était
auparavant téléchargé à la première ouverture de l'application, si bien que
poser l'icône sans lancer l'app laissait une coquille inutilisable.

```
visite, site ouvert → manifest.json + catalogue-2026-08-12.sqlite.gz (3 041 235 o)
robinet fermé       → 404 sur tout
app hors robinet    → manifest 200 (2 310 o), catalogue 200 (3 041 235 o)
```

Reste vrai malgré tout : aucune nouvelle installation n'est possible site fermé,
et le catalogue ne se met plus à jour.

### L5 — Scan, relevé, sauvegarde

Datamatrix GS1 (`BarcodeDetector`, repli `@zxing/library` chargé à la demande),
relevé 90 jours imprimable en PDF avec source et date BDPM, archive chiffrée par
phrase de passe.

La spec proposait `zbar-wasm` en repli Safari : ZBar couvre le linéaire et le
QR, **pas** l'ECC 200 du Datamatrix des boîtes françaises. Le repli est
`@zxing/library` (`manques.md` §5.4).

---

## Bout en bout, vérifié dans Chromium

Un parcours complet a été rejoué sur le vrai bundle :

création du profil → ajout de DOLIPRANE 1000 avec sa composition réelle issue du
catalogue → trois prises → **cumul 3 000 mg** → déclenchement de `PARA-24H` avec
sa citation ANSM datée → création d'un plan → occurrences visibles en vue
semaine.

---

## Ce qui attend une décision

| Sujet | Où | Nature |
|---|---|---|
| Thème sombre | `manques.md` §1.1 | bloque une livraison complète de L2 |
| Seuil aspirine, 3 000 ou 2 000 mg | `manques.md` §1.4 | le RCP varie selon la forme ; le plus bas serait plus prudent, ce n'est pas un arbitrage d'ingénierie |
| Trois niveaux d'encre alors que la note en annonce deux | `manques.md` §1.2 | note périmée, ou scorie de l'export ? |
| Rayon de l'alvéole | `manques.md` §1.5 | la maquette pose la question et livre les deux options |
| Dosages « pour 100 g de poudre » | `manques.md` §5.2 | conversion exacte, mais l'utilisateur ne pèse pas son sachet |
| Marge de l'icône `maskable` | `manques.md` §2.4 | 60 %, valeur de la zone sûre Android, pas de la maquette |

Aucun de ces points n'a été comblé par une valeur plausible.

---

## Reproduire ces chiffres

```bash
pnpm install
pnpm test              # 164 tests
pnpm test:golden       # 45, dont le cas fondateur
pnpm test:couverture   # 100 % de branches sur le domaine

python3.12 -m venv .venv && .venv/bin/pip install -r pipeline/requirements.txt
.venv/bin/python -m pipeline.build     # bundle + manifest + six contrôles
```

Les métriques du dernier build sont dans `public/bundles/manifest.json`, section
`metriques` : elles ne sont pas recopiées à la main.
