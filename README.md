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

## Démarrage

```bash
pnpm install
pnpm dev
```

## Données

Référentiel : [Base de données publique des médicaments](https://base-donnees-publique.medicaments.gouv.fr)
(ANSM / HAS / UNCAM), licence ouverte. La date de mise à jour est affichée dans
l'application et sur tout document exporté.
