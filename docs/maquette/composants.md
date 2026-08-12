# Inventaire — élément de maquette → composant React

Produit **avant** toute implémentation (protocole `/CLAUDE.md`, étape 2).
Chaque composant ne consomme que des jetons de `src/ui/tokens.css`.

Tout composant listé ici est rendu par `/kitchen-sink`, dans tous ses états.
Un composant absent de cette route est considéré comme non livré.

## Primitives

| Élément de maquette | Composant | Props | États couverts |
|---|---|---|---|
| Bouton plein pétrole, 52 px (1e « Enregistrer ») | `Bouton` | `variante: 'primaire' \| 'secondaire' \| 'texte'`, `onClick`, `disabled`, `pleineLargeur` | repos · pressé · désactivé · focus |
| Bouton contour 44 px (1s « J'ai vu ») | `Bouton variante="secondaire"` | idem | idem |
| Carré 48 px − / + (1e) | `Pas` | `sens: 'moins' \| 'plus'`, `onClick`, `disabled` | repos · désactivé |
| Étiquette de section capitales (1b « AUJOURD'HUI ») | `Etiquette` | `children` | — |
| Pastille de couleur ATC (1b, 1e) | `PastilleAtc` | `groupe`, `codeSubstance`, `taille` | 11 groupes + sans ATC |
| Carte blanche à filet (1b) | `Carte` | `children`, `filet?: Niveau` | neutre · information · vigilance · attention |
| Ligne de séparation (1b liste) | intégré à `ListePrises` | — | — |
| Champ de recherche (1l) | `ChampRecherche` | `valeur`, `onChange`, `placeholder` | vide · saisi · sans résultat · focus |
| Chip de filtre (1l « Sans ordonnance ») | `Chip` | `actif`, `onClick`, `children` | actif · inactif |
| Feuille modale à coins 22 px (1e) | `Feuille` | `ouverte`, `onFermer`, `titre`, `children` | ouverte · fermée |
| Voile de fond (1e) | intégré à `Feuille` | — | — |

## Composants de données

| Élément de maquette | Composant | Props | États couverts |
|---|---|---|---|
| Chiffre-clé 56 px + jauge (1b) | `CumulJour` | `mg`, `repere`, `substance`, `groupe`, `prises`, `fiabiliteMin` | sous le repère · au repère · au-delà · fiabilité dégradée · sans donnée |
| Barre horizontale + graduation (1b) | `JaugeLineaire` | `valeur`, `repere`, `couleur`, `libelleRepere` | ⚠ **linéaire, jamais circulaire** (§12.1) |
| Grille 7 colonnes 30/90 j (1b, 1k) | `Plaquette` | `jours`, `cellules`, `legende`, `rayon` | 30 j · 90 j · vide · multi-ATC · aujourd'hui |
| Alvéole d'un jour | interne à `Plaquette` | `bandes`, `aujourdhui`, `horsPeriode` | 0 · 1 · 2 · 3+ prises · deux ATC |
| Carte de signal à filet latéral (1s, 1t) | `CarteSignal` | `signal: Signal`, `onAcquitter`, `onDetail` | information · vigilance · attention |
| Citation en sérif (1s) | `Citation` | `texte`, `source` | — |
| Ligne de prise (1b « 08:12 Doliprane ») | `LignePrise` | `prise`, `produit`, `substances` | normale · ajoutée après coup · exclue du cumul · annulée |
| Liste de prises d'un jour (1b, 2a) | `ListePrises` | `prises` | avec prises · aucune prise |
| Chip produit récent (1e) | `ChipProduit` | `produit`, `groupe`, `dosage`, `selectionne` | sélectionné · non sélectionné |
| Ligne de résultat de recherche (1l) | `LigneResultat` | `resultat`, `onChoisir` | commercialisée · non commercialisée · sur ordonnance |
| Sélecteur de dose (1e) | `SelecteurDose` | `dose`, `unite`, `equivalent`, `onChange` | — |
| Sélecteur d'instant (2c, 2d) | `SelecteurInstant` | `valeur`, `onChange`, `maximum` | maintenant · ce matin · hier · date libre · futur bloqué |

## Pilulier

| Élément de maquette | Composant | Props | États couverts |
|---|---|---|---|
| Vue jour, groupes par moment (1f) | `PilulierJour` | `moments`, `occurrences`, `onValider`, `onSauter` | attendue · validée · sautée · expirée |
| Bouton « Tout valider » d'un moment (1f) | `BlocMoment` | `moment`, `occurrences`, `onToutValider` | — |
| Grille moments × jours (1g) | `PilulierSemaine` | `moments`, `jours`, `occurrences` | prise · à venir · sautée · en retard |
| Point d'occurrence (1g) | interne à `PilulierSemaine` | `statut`, `groupe` | 4 statuts |

## Chrome d'application

| Élément de maquette | Composant | Props | États couverts |
|---|---|---|---|
| Barre d'onglets à 5 entrées (composant `MedcoTabBar`) | `BarreOnglets` | `actif` | 4 onglets + action centrale |
| Bouton central flottant 52 px | intégré à `BarreOnglets` | `onSaisie` | — |
| En-tête avec profil et réglages (1b) | `EnTete` | `profil`, `onProfil`, `onReglages` | — |
| État vide (1d) | `EtatVide` | `titre`, `texte`, `action` | aujourd'hui · pilulier · produits |

## Écrans

| Écran de maquette | Route | Composant |
|---|---|---|
| 1b Aujourd'hui | `/` | `EcranAujourdhui` |
| 1e Saisie rapide | `/saisie` | `EcranSaisie` |
| 1l Catalogue et recherche | `/produits/ajouter` | `EcranRecherche` |
| 1i Fiche produit | `/produits/:id` | `EcranProduit` |
| 1k Fiche substance | `/substances/:code` | `EcranSubstance` |
| 1f Pilulier vue jour | `/pilulier` | `EcranPilulierJour` |
| 1g Pilulier vue semaine | `/pilulier/semaine` | `EcranPilulierSemaine` |
| 1m Repères | `/reperes` | `EcranReperes` |
| 1n Réglages | `/reglages` | `EcranReglages` |
| 1o Onboarding | `/bienvenue` | `EcranOnboarding` |
| — (absent de la maquette) | `/kitchen-sink` | `KitchenSink` |
| — (absent de la maquette) | second onglet | `EcranSecondOnglet` |

## Écrans de la maquette non repris en V1

| Écran | Décision |
|---|---|
| 1h Préparer la semaine (§9.4) | Hors périmètre V1 : la spec §3.1 ne le liste pas. |
| 1j Notice / RCP | Spec §3.2 — reporté, un lien vers la page officielle suffit. |
| 1p Type dynamique 200 % | Pas un écran : une contrainte vérifiée sur tous les écrans. |
| 2a–2e Historique et saisie antérieure | Repris dans `EcranAujourdhui` et `SelecteurInstant`. |
