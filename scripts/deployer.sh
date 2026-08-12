#!/usr/bin/env bash
# Déploiement sur le serveur de la maison, derrière le tunnel cloudflared.
#
#   ./scripts/deployer.sh [destination]
#
# Construit l'application et bascule le contenu servi. La bascule est atomique :
# un `rsync` en place laisserait, quelques secondes, un index.html neuf référençant
# des assets déjà supprimés — un rechargement pendant ce laps de temps casse.

set -euo pipefail

DESTINATION="${1:-/srv/medco}"
RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$RACINE"

echo "→ mise à jour du dépôt"
git pull --ff-only

echo "→ dépendances"
pnpm install --frozen-lockfile

echo "→ contrôles"
pnpm lint
# Le jeu doré est bloquant : si le cumul est faux, rien n'est déployé (§17.2).
pnpm test:golden
pnpm test

echo "→ build"
VITE_BASE=/ VITE_URL_WORKER="${VITE_URL_WORKER:-https://medco.boes-home.com/rappels}" pnpm build

echo "→ bascule vers $DESTINATION"
NOUVEAU="${DESTINATION}.nouveau"
ANCIEN="${DESTINATION}.ancien"
rm -rf "$NOUVEAU" "$ANCIEN"
cp -a dist "$NOUVEAU"

if [ -d "$DESTINATION" ]; then
  mv "$DESTINATION" "$ANCIEN"
fi
mv "$NOUVEAU" "$DESTINATION"
rm -rf "$ANCIEN"

echo "✓ déployé — $(find "$DESTINATION" -type f | wc -l) fichiers"
echo "  catalogue : $(ls "$DESTINATION/bundles/" 2>/dev/null | tr '\n' ' ')"
