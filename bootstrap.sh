#!/usr/bin/env bash
# Crée le dépôt GitHub et pousse le squelette du projet.
#
#   ./bootstrap.sh medco            # dépôt privé nommé "medco"
#   ./bootstrap.sh medco --public
#
# Prérequis : git, et gh authentifié (`gh auth login`).
# Aucun identifiant n'est stocké par ce script : gh utilise ton trousseau système.

set -euo pipefail

NOM="${1:-medco}"
VISIBILITE="--private"
[[ "${2:-}" == "--public" ]] && VISIBILITE="--public"

command -v git >/dev/null || { echo "git introuvable."; exit 1; }
command -v gh  >/dev/null || { echo "gh introuvable — https://cli.github.com"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "Non authentifié. Lance : gh auth login"; exit 1; }

if [[ ! -f CLAUDE.md ]]; then
  echo "CLAUDE.md introuvable. Lance ce script depuis la racine du squelette."
  exit 1
fi

if [[ ! -s docs/maquette/export/index.html ]] && ! ls docs/maquette/export/*.html >/dev/null 2>&1; then
  echo
  echo "⚠  docs/maquette/export/ ne contient aucun fichier HTML."
  echo "   Claude Code ne pourra pas extraire les jetons de design."
  echo
  read -rp "   Continuer quand même ? [o/N] " reponse
  [[ "$reponse" =~ ^[oO]$ ]] || exit 1
fi

git init -q -b main
git add -A
git commit -q -m "chore: squelette du projet, spec technique et instructions Claude Code"

echo "Création du dépôt GitHub…"
gh repo create "$NOM" $VISIBILITE --source=. --remote=origin --push

echo
echo "✓ Dépôt poussé : $(gh repo view --json url -q .url)"
echo
echo "Étapes suivantes :"
echo "  1. claude.ai/code → connecter le compte GitHub → sélectionner le dépôt"
echo "  2. Première session, une seule tâche :"
echo
echo "     Lis CLAUDE.md et docs/spec-technique.md."
echo "     Implémente uniquement le lot L0 : le pipeline BDPM dans /pipeline,"
echo "     avec les contrôles bloquants de la spec §6.5. Ne touche pas à /src."
echo
