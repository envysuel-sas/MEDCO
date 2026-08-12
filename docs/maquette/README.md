# Maquette

Direction visuelle de référence, produite avec Claude Design.

> **Pour Claude Code :** ce dossier fait foi sur l'esthétique. Tu en **extrais** les valeurs, tu ne les interprètes pas. Le protocole est dans `/CLAUDE.md`, section « Fidélité à la maquette ». Lis-le avant de toucher à l'UI.

---

## Contenu

```
/docs/maquette
  /export/          maquette HTML exportée depuis Claude Design — SOURCE DE VÉRITÉ
  /captures/        captures d'écran (optionnel, référence secondaire)
  inventaire.json   sortie du script d'extraction (§ Extraction)
  composants.md     inventaire élément → composant React (tâche 2)
  manques.md        ce que la maquette ne couvre pas (alimenté en continu)
```

## ⚠ L'export est une source de valeurs, pas de markup

L'export HTML d'un outil de design produit du **positionnement absolu en pixels fixes**, non sémantique et non responsive. Il porte les bonnes valeurs dans une mauvaise structure.

**Interdit :** reprendre le markup, copier des blocs entiers, réutiliser les noms de classes générés, conserver le positionnement absolu.

**Attendu :** extraire les valeurs (couleurs, tailles, espacements, rayons, graisses, interlignes), les figer en jetons, puis **reconstruire** des composants React propres — flux normal, unités relatives, `env(safe-area-inset-*)`, états de focus, sémantique correcte.

Ce que l'export ne contient pas et qu'il faut ajouter par-dessus :

| Absent de l'export | À traiter |
|---|---|
| Comportement responsive | Flux normal, `minmax`, pas de largeur fixe |
| Encoches et barres système | `env(safe-area-inset-*)` |
| États (survol, focus, actif, désactivé, chargement) | À dériver, puis **consigner dans `manques.md`** |
| Texte long, débordement, troncature | Tester avec des noms de médicaments réels — ils sont longs |
| Type dynamique jusqu'à 200 % | Aucune hauteur fixe sur un conteneur de texte |
| Accessibilité (rôles, étiquettes, ordre de lecture) | À écrire |
| Thème clair, s'il n'est pas exporté | Signaler avant de l'inventer |

---

## Écrans couverts

<!-- Cocher au fur et à mesure -->

- [x] Aujourd'hui
- [x] Pilulier — vue jour
- [x] Pilulier — vue semaine
- [x] Saisie rapide
- [x] Recherche / ajout de produit
- [ ] Fiche produit
- [ ] Fiche substance
- [x] Réglages
- [x] Onboarding + installation PWA
- [x] États vides
- [ ] Thème clair

Tout écran non coché est à recomposer à partir des composants existants, **sans introduire de motif visuel nouveau**, et à signaler dans `manques.md`.

---

## Extraction

### Étape 0 — Inventaire mécanique

```bash
node scripts/extraire-maquette.mjs docs/maquette/export > docs/maquette/inventaire.json
```

Produit la liste exhaustive des valeurs présentes dans l'export, triées par fréquence : couleurs, tailles de police, graisses, interlignes, espacements, rayons, durées.

**Lire cette sortie avant d'écrire le moindre jeton.** Elle sert à deux choses :

- garantir qu'aucune valeur n'est oubliée ;
- repérer les quasi-doublons. Un export de design contient souvent `#1A1613` et `#1A1614`, ou `13px` et `13.5px` — ce sont des accidents, pas des intentions. Les regrouper vers une valeur unique, et **lister les regroupements dans `manques.md`** pour validation.

Une valeur qui n'apparaît qu'une fois dans tout l'export mérite une question : jeton légitime, ou scorie ?

### Étape 1 — Jetons → `src/ui/tokens.css` et `src/ui/tokens.ts`

```
Surfaces        fond, surfaces empilées, creux, traits
Encre           primaire, secondaire, tertiaire
Accent          couleur d'action et d'état actif
Groupes ATC     N · M · A · R · J · C · G · D · B · S · _   (cf. spec §12.2)
Signal          information · vigilance · attention   (aucun rouge)
Typographie     familles, échelle complète (taille / interligne / graisse / interlettrage)
Espacement      échelle
Rayons          par type de surface
Mouvement       durées, courbes
```

Les deux thèmes dès l'extraction. Pas de « on fera le clair plus tard » : rétrofitter un thème coûte trois fois le prix.

Nommer par **rôle**, jamais par apparence : `--surface-1`, pas `--gris-fonce`. Un jeton nommé par sa couleur devient un mensonge en thème clair.

### Étape 2 — Inventaire → `composants.md`

Un tableau : élément de la maquette → nom de composant → props → états couverts. Produit **avant** toute implémentation.

### Étape 3 — Manques → `manques.md`

Tout ce que la maquette ne tranche pas : état d'erreur absent, composant à 12 éléments alors que la maquette en montre 3, écran non dessiné, regroupement de quasi-doublons, valeur ambiguë.

Format : `[écran/composant] — ce qui manque — ce qui a été fait en attendant`.

Ce fichier n'est pas un aveu d'échec, c'est le livrable qui permet de compléter la maquette. Un `manques.md` vide après trois écrans construits signifie que des valeurs ont été inventées silencieusement.

---

## Vérification

La route `/kitchen-sink` rend tous les composants, tous les états, les deux thèmes. Elle est déployée avec l'app pour être consultable sur téléphone.

Un composant absent de `/kitchen-sink` est considéré comme non livré.

---

## Contradictions

Trois points de `docs/spec-technique.md` §12 sont fonctionnels et priment sur l'esthétique :

1. la couleur d'une substance dérive de son **groupe ATC** ;
2. une jauge de cumul est **linéaire**, jamais circulaire ;
3. **ni streak, ni rouge, ni pourcentage d'observance**.

Si la maquette contredit l'un des trois : **arrête-toi, signale, n'arbitre pas.**
