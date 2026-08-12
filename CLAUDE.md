# MEDCO

PWA de suivi de consommation médicamenteuse. Usage personnel, ~20 utilisateurs connus, 50 % iOS / 50 % Android. Aucun backend applicatif : GitHub Pages sert l'app et les données, un Cloudflare Worker envoie les rappels push.

**Ce qui distingue le produit :** le comptage se fait **par substance active, pas par boîte**. Doliprane 1000 + Fervex + Actifed Rhume = trois boîtes, une seule medco, 3 g de paracétamol. C'est le calcul qui évite un surdosage hépatique, et c'est la seule fonction dont dépend la valeur de l'app.

## Sources de vérité

| Sujet | Fichier |
|---|---|
| **Ce qui a été construit, et pourquoi** | `docs/architecture.md` |
| **Ce qui est livré, avec les chiffres** | `docs/livraison.md` |
| Spécification technique complète — l'intention | `docs/spec-technique.md` |
| Direction visuelle, composants | `docs/maquette/` — voir `docs/maquette/README.md` |
| Jetons de design extraits | `src/ui/tokens.css` + `src/ui/tokens.ts` |
| Règles de seuils | `data/regles.json` |

Si la spec et la maquette divergent sur un point visuel, la maquette gagne. Sur un point fonctionnel, la spec gagne. En cas de doute, demande — n'arbitre pas seul.

## Fidélité à la maquette

**Aucun écran ne se construit « dans l'esprit » de la maquette. On en extrait les valeurs, on ne les interprète pas.**

### Ordre imposé

1. **Extraire d'abord.** La première tâche UI produit `src/ui/tokens.css` et `src/ui/tokens.ts` par lecture directe de `docs/maquette/`. Rien d'autre. Aucun écran n'est construit tant que ce fichier n'existe pas et n'a pas été relu.
2. **Inventorier ensuite.** `docs/maquette/composants.md` mappe chaque élément de la maquette vers un nom de composant React. Ce mapping est produit avant toute implémentation.
3. **Construire enfin**, composant par composant, en consommant uniquement des jetons.

### Règles dures

- **Aucune valeur en dur dans un composant.** Pas de `#1A1613`, pas de `padding: 14px`, pas de `font-size: 34px`. Tout passe par un jeton. Une valeur en dur dans une PR est un motif de rejet.
- **Si une valeur n'est pas dans la maquette, ne l'invente pas.** Ajoute-la dans `docs/maquette/manques.md` avec le contexte et continue avec un `TODO` visible. Ne comble jamais un trou par une valeur plausible.
- **Si un écran n'est pas dans la maquette**, construis-le en recomposant des composants existants, sans introduire de nouveau motif visuel. Signale-le dans `manques.md`.
- **Ne « améliore » pas la maquette.** Un espacement qui te paraît faux, un contraste qui te paraît insuffisant : signale-le, ne le corrige pas.

### Vérification

Chaque PR touchant à l'UI met à jour la route `/kitchen-sink`, qui rend **tous** les composants dans tous leurs états, dans les deux thèmes. C'est la page que je compare à la maquette côte à côte, sur téléphone. Un composant absent de `/kitchen-sink` est considéré comme non livré.

### Ce qui prime sur la maquette

Trois points de la spec §12 sont fonctionnels et non négociables, même si la maquette dit autre chose — dans ce cas, **arrête-toi et signale la contradiction** :

- la couleur d'une substance vient de son groupe ATC (spec §12.2) ;
- une jauge de cumul est linéaire, jamais circulaire ;
- ni streak, ni rouge, ni pourcentage d'observance.

## Règles non négociables

### R1 — Le cumul par substance doit être juste

`CIS_COMPO_bdpm.txt` contient des lignes `SA` (substance active) et `ST` (substance thérapeutique) reliées par `num_liaison`. **Ne compter que les lignes `SA`.** Sommer les deux double le comptage du paracétamol et rend l'app plus dangereuse que son absence.

Aucune estimation de dosage par défaut. Un dosage non parsable donne `fiabilite = 0`, la prise est enregistrée mais **exclue du cumul**, et l'UI le dit explicitement. Ne jamais inventer une valeur pour faire tourner un calcul.

### R2 — Les traitements prescrits sont exemptés des signaux de fréquence

Chaque produit porte `mode: 'prescrit' | 'libre'`. Les règles `duree_consecutive` et `jours_de_prise` ne s'évaluent **que** sur `libre`. Un patient sous ordonnance ne doit jamais lire que sa consommation est élevée.

Le validateur de `regles.json` doit rejeter toute règle de ces deux types dont le `mode` inclut `prescrit`.

### R3 — Restituer, jamais conclure

Deux faits juxtaposés, aucune phrase qui les relie :

```
18 jours avec prise d'antalgique sur 30.
Les recommandations situent à 15 jours par mois le repère […]
Source ANSM · consultée le 27/07/2026
```

Interdits : score, taux d'observance en pourcentage, jauge de risque, « votre consommation est anormale », « vous présentez un risque de ». Toute règle porte une `source` non vide et datée.

### R4 — Aucune logique d'oubli de pilule

La conduite à tenir en cas d'oubli dépend du type de pilule, de la fenêtre écoulée et de la semaine du cycle. L'app enregistre l'oubli, affiche l'heure prévue et l'heure réelle, et renvoie à la notice ou au pharmacien. **Elle n'affiche aucune consigne.**

## Ordre de construction

`L0` pipeline BDPM → `L1` cumul + règles → `L2` UI → `L3` pilulier → `L4` rappels → `L5` scan, PDF, sauvegarde.

**L0 et L1 avant tout le reste.** Si le cumul est faux, le reste ne vaut rien.

## Tests

Le domaine (cumul, règles, occurrences) est **pur** : aucune dépendance à la base, à l'UI ou à `Date.now()`. L'instant est injecté. Couverture 100 % de branches sur ces trois modules.

Le jeu doré (`src/domain/__tests__/golden.test.ts`, cf. spec §15.2) est non négociable et doit passer avant tout commit touchant au domaine. Cas fondateur à ne jamais casser :

```
2 × Doliprane 1000 + 2 sachets Fervex (500 mg) = 3 000 mg de paracétamol
```

## Stack

```
Vite · React 19 · TypeScript strict
@sqlite.org/sqlite-wasm (VFS opfs-sahpool)
vite-plugin-pwa (Workbox)
Zustand · React Router
Cloudflare Workers (push + webcal)
Python 3.12 + polars (pipeline, dans GitHub Actions)
Vitest
```

## Commandes

```bash
pnpm dev            # serveur de dev
pnpm build          # build de production
pnpm test           # Vitest
pnpm test:golden    # jeu doré seul
pnpm lint           # ESLint + tsc --noEmit
pnpm pipeline       # ingestion BDPM en local (nécessite Python)
```

## Structure

```
/src
  /domain         cumul, règles, occurrences — PUR, testé à 100 %
  /db             SQLite WASM, schéma, migrations
  /ui             composants, écrans
  /pwa            service worker, installation, push
/worker           Cloudflare Worker (push + webcal)
/pipeline         ingestion BDPM (Python)
/public/bundles   catalogue-<date>.sqlite.br, regles.json, manifest.json
/docs             spec-technique.md, maquette/
```

## Pièges connus

- **Fenêtre 24 h glissante**, pas calendaire. Une prise à 23 h et une à 1 h sont dans la même fenêtre. Les comptages de *jours* utilisent en revanche le jour calendaire local.
- **Fuseaux** : `prise.horodatage` est en ISO 8601 avec offset, `prise.fuseau` en IANA. Ne jamais normaliser en UTC pour les comptages de jours.
- **Heure d'été** : la régénération d'occurrences ne doit ni dupliquer ni perdre de prise au changement d'heure. Test dédié.
- **VFS OPFS : `opfs-sahpool` obligatoire.** Le VFS `opfs` par défaut exige les en-têtes COOP/COEP, que GitHub Pages ne peut pas émettre. Conséquences (spec §5.5) : le bundle catalogue s'installe par `importDb()`, pas par écriture de fichier ; une seule connexion à la fois, donc un Web Worker propriétaire et un écran dédié si l'app est ouverte dans un second onglet.
- **`BarcodeDetector`** n'existe pas sur Safari. Détecter, et retomber sur `zbar-wasm` pour le Datamatrix.
- **Bouton retour Android** : en mode standalone, il éjecte de l'app si l'historique n'est pas géré explicitement.
- **`navigator.storage.persist()`** doit être rappelé à chaque ouverture — la permission n'est pas durable sur Safari.

## Conventions

- Français dans l'UI et les commentaires, anglais pour le code.
- Conventional commits.
- Aucun `console.log` sur un objet `prise`, `produit` ou `profil`, même en développement.
- Pas de dépendance ajoutée sans justification dans le message de commit.
