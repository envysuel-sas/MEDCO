# MEDCO

Suivi de consommation médicamenteuse. PWA, usage personnel.

Le comptage se fait **par substance active, pas par boîte** : Doliprane 1000 + Fervex
+ Actifed Rhume = trois boîtes, une seule medco, 3 g de paracétamol.

## Documentation

**Commencer par [`docs/architecture.md`](docs/architecture.md)** : ce qui a été
construit, comment les pièces s'emboîtent, et où une erreur rendrait
l'application dangereuse. La spécification décrit l'intention ; l'architecture
décrit le code tel qu'il est.

| | |
|---|---|
| **Ce qui a été construit** | [`docs/architecture.md`](docs/architecture.md) |
| **Ce qui est livré, et les chiffres** | [`docs/livraison.md`](docs/livraison.md) |
| Mise en ligne, pas à pas | [`docs/deploiement.md`](docs/deploiement.md) |
| Spécification technique — l'intention | [`docs/spec-technique.md`](docs/spec-technique.md) |
| Maquette et protocole d'extraction | [`docs/maquette/README.md`](docs/maquette/README.md) |
| Ce que la maquette ne tranche pas | [`docs/maquette/manques.md`](docs/maquette/manques.md) |
| Pipeline BDPM | [`pipeline/README.md`](pipeline/README.md) |
| Worker de rappel | [`worker/README.md`](worker/README.md) |
| Instructions Claude Code | [`CLAUDE.md`](CLAUDE.md) |

### Les quatre règles qui ne se négocient pas

Elles sont détaillées dans [`architecture.md`](docs/architecture.md) ; les
ignorer rend l'application plus dangereuse que son absence.

1. **Une seule ligne comptée par `num_liaison`.** Sommer `SA` et `FT` double le
   paracétamol.
2. **Aucune estimation de dosage.** Un dosage illisible donne `fiabilite = 0` :
   la prise est enregistrée, exclue du cumul, et l'écran le dit.
3. **Les traitements prescrits sont exemptés des signaux de fréquence.** Un
   patient sous ordonnance ne doit jamais lire que sa consommation est élevée.
4. **Restituer, jamais conclure.** Deux faits juxtaposés, une source datée. Ni
   score, ni taux d'observance, ni jauge de risque.

## Démarrage

```bash
pnpm install
pnpm dev
```

Le catalogue embarqué est déjà dans `public/bundles`. Pour le reconstruire :

```bash
python3.12 -m venv .venv && .venv/bin/pip install -r pipeline/requirements.txt
.venv/bin/python -m pipeline.build
```

## Commandes

```bash
pnpm dev              # serveur de dev
pnpm build            # tsc --noEmit puis build de production
pnpm test             # Vitest
pnpm test:golden      # jeu doré seul
pnpm test:couverture  # couverture — 100 % de branches exigées sur le domaine
pnpm lint             # ESLint + tsc --noEmit
pnpm pipeline         # ingestion BDPM (nécessite Python 3.12)
```

## Déploiement

**Tout tourne sur GitHub.** GitHub Pages héberge l'application et émet le
certificat ; aucune machine à faire tourner, aucun tunnel, aucun service tiers
obligatoire. Activer Pages sur « GitHub Actions » et lancer le workflow
`deploy` suffit : le site est en ligne et installable sur téléphone.

Deux variables de dépôt, **toutes deux facultatives**, complètent l'installation
par défaut :

| Variable | Vide | Renseignée |
|---|---|---|
| `DOMAINE` | l'app vit sur `<compte>.github.io/<dépôt>/` | domaine personnalisé, `CNAME` publié à la racine |
| `VITE_URL_WORKER` | seule la couche calendrier est proposée, et l'app le dit | notifications poussées actives |

Le Worker de rappel s'exécute chez Cloudflare, sur son propre nom d'hôte : lui
non plus n'a besoin d'aucune machine.

[`docs/deploiement.md`](docs/deploiement.md) déroule les quatre étapes, écrites
pour quelqu'un qui n'a jamais déployé de site. Comptez dix minutes.

## Vérification visuelle

`/kitchen-sink` rend tous les composants dans tous leurs états. C'est la page
à comparer à la maquette côte à côte, sur téléphone ; elle reste accessible
sans installer l'application.

## Pas de compte, un code

Rien n'est partagé, rien n'est synchronisé, il n'y a pas de serveur applicatif :
un compte n'aurait rien à authentifier. Un code de 4 à 8 chiffres est posé au
premier lancement sur l'appareil et redemandé à chaque ouverture. La preuve est
dérivée par Argon2id et salée ; le code n'est jamais stocké, et le contrôle vit
dans le Worker propriétaire de la base, pas dans l'interface.

Il barre l'accès au carnet. Il ne chiffre pas le stockage — voir la réserve dans
[`docs/livraison.md`](docs/livraison.md).

## État

15 857 spécialités, 98,89 % de fiabilité sur les formes orales sèches, 176 tests
dont 45 de jeu doré sur le vrai bundle, 100 % de branches sur le domaine.

Trois réserves ouvertes : le thème sombre est absent de la maquette et n'a pas
été inventé, la réception d'un rappel n'est vérifiable que sur téléphone réel
(§16.2), et les clés du Worker restent à générer au premier déploiement.

Le détail, lot par lot, avec les chiffres et la façon de les reproduire :
[`docs/livraison.md`](docs/livraison.md).

## Licence

**Propriétaire, tous droits réservés** — [`LICENSE`](LICENSE).
© 2026 Envysuel SAS, 78125 Saint-Hilarion, France.

Le code est consultable ; ça ne vaut aucune concession de droits. Ni
utilisation, ni copie, ni modification, ni distribution, ni hébergement d'une
instance sans autorisation écrite. Ce n'est pas un logiciel libre.

Trois ensembles échappent à cette licence et gardent la leur — les données
BDPM et Open Medic (Licence Ouverte Etalab 2.0), les polices Poppins,
Newsreader et DM Mono (SIL OFL 1.1), et les bibliothèques tierces (MIT,
Apache 2.0). Inventaire et obligations dans [`THIRD-PARTY.md`](THIRD-PARTY.md).

Medco est un outil de suivi personnel. Il ne pose aucun diagnostic, ne délivre
aucun conseil thérapeutique, n'est pas un dispositif médical marqué CE.

## Données

Référentiel : [Base de données publique des médicaments](https://base-donnees-publique.medicaments.gouv.fr)
(ANSM / HAS / UNCAM), licence ouverte. Codes ATC : [Open Medic](https://www.data.gouv.fr/fr/datasets/open-medic-base-complete-sur-les-depenses-de-medicaments-interregimes/)
(Assurance Maladie), licence ouverte — la BDPM n'en publie pas. Les données ne
sont pas altérées ; la date de mise à jour est affichée dans l'application et
sur tout document exporté.
