# MEDCO

Suivi de consommation médicamenteuse. PWA, usage personnel.

Le comptage se fait **par substance active, pas par boîte** : Doliprane 1000 + Fervex
+ Actifed Rhume = trois boîtes, une seule medco, 3 g de paracétamol.

## Documentation

| | |
|---|---|
| Instructions Claude Code | [`CLAUDE.md`](CLAUDE.md) |
| Spécification technique | [`docs/spec-technique.md`](docs/spec-technique.md) |
| Maquette et extraction | [`docs/maquette/README.md`](docs/maquette/README.md) |
| Ce que la maquette ne tranche pas | [`docs/maquette/manques.md`](docs/maquette/manques.md) |
| Pipeline BDPM | [`pipeline/README.md`](pipeline/README.md) |
| Worker de rappel | [`worker/README.md`](worker/README.md) |
| Mise en ligne, pas à pas | [`docs/deploiement.md`](docs/deploiement.md) |

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

**GitHub Pages héberge, `cloudflared` est l'entrée publique** sur
`medco.boes-home.com`. Le tunnel rend l'enregistrement DNS proxifié, ce qui
permet de monter le Worker de rappel sur la **même origine**, sous
`/rappels/*` : pas de CORS, un seul nom, et plus de certificat à faire émettre.

[`docs/deploiement.md`](docs/deploiement.md) est un guide pas à pas qui part de
zéro : chaque étape indique ce que vous tapez, ce que vous devez voir, et quoi
faire si ça ne marche pas. Comptez une heure.

## Vérification visuelle

`/kitchen-sink` rend tous les composants dans tous leurs états. C'est la page
à comparer à la maquette côte à côte, sur téléphone ; elle reste accessible
sans installer l'application.

## Ce qui reste à faire sur matériel réel

Les rappels ne se testent pas en simulateur (spec §16.2). Un iPhone et un
Android physiques sont indispensables pour valider la réception d'un push sur
PWA iOS installée, la réception Android en doze mode, l'import `.ics` sur Apple
Calendar **et** sur Google Agenda, et la réimportation après modification d'un
plan — c'est là que se jouent les doublons d'alarmes.

## Données

Référentiel : [Base de données publique des médicaments](https://base-donnees-publique.medicaments.gouv.fr)
(ANSM / HAS / UNCAM), licence ouverte. Codes ATC : [Open Medic](https://www.data.gouv.fr/fr/datasets/open-medic-base-complete-sur-les-depenses-de-medicaments-interregimes/)
(Assurance Maladie), licence ouverte — la BDPM n'en publie pas. Les données ne
sont pas altérées ; la date de mise à jour est affichée dans l'application et
sur tout document exporté.
