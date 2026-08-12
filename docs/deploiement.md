# Mettre Medco en ligne

**Aucune machine à faire tourner.** Ni chez vous, ni ailleurs. GitHub héberge
l'application, gratuitement, et se charge du certificat HTTPS. Vous n'installez
aucun logiciel.

Comptez dix minutes, dont huit d'attente.

Le guide est écrit pour quelqu'un qui n'a jamais déployé de site. Chaque étape
dit ce que vous cliquez, ce que vous devez voir, et quoi faire si ce n'est pas
ce que vous voyez.

---

## Étape 1 — Activer l'hébergement GitHub (3 minutes)

1. Ouvrez le dépôt sur github.com.
2. Onglet **Settings**, en haut, tout à droite de la barre d'onglets.
3. Dans la colonne de gauche, cliquez sur **Pages**.
4. Sous « Build and deployment », ligne **Source**, ouvrez le menu déroulant et
   choisissez **GitHub Actions**. Il est probablement sur « Deploy from a
   branch ».

Il n'y a rien à valider : le choix est enregistré aussitôt.

**Ce que vous devez voir :** la mention « GitHub Actions » dans le menu.

---

## Étape 2 — Lancer la publication (5 minutes, dont 4 d'attente)

1. Onglet **Actions** du dépôt.
2. Colonne de gauche, cliquez sur le workflow **deploy**.
3. Bouton **Run workflow** à droite, puis **Run workflow** dans le petit
   panneau qui s'ouvre.
4. Rafraîchissez la page au bout de quelques secondes : une ligne apparaît avec
   un rond orange qui tourne.

Attendez qu'il devienne une coche verte. Comptez trois à quatre minutes : le
workflow relit tout le code, lance les tests — dont le jeu doré, celui qui
vérifie que 2 Doliprane 1000 + 2 sachets de Fervex font bien 3 000 mg de
paracétamol — et ne publie que si tout passe.

**Ce que vous devez voir :** une coche verte à gauche de la ligne.

**Si c'est une croix rouge :** cliquez sur la ligne, puis sur l'étape en rouge.
Le message d'erreur est en clair. Une erreur à l'étape `deploy` mentionnant
« Pages » signifie presque toujours que l'étape 1 n'a pas été faite.

---

## Étape 3 — Récupérer l'adresse

Retournez dans **Settings → Pages**. Un bandeau en haut affiche :

> **Your site is live at** https://envysuel-sas.github.io/medco/

C'est l'adresse de votre application. Ouvrez-la : vous devez voir l'écran
d'accueil de Medco.

Le premier chargement télécharge le catalogue des médicaments, environ 3 Mo. Un
message vous en informe. Les suivants sont instantanés.

C'est fini. L'application est en ligne.

---

## Étape 4 — L'installer sur le téléphone (2 minutes)

L'installation n'est pas un confort. Sur iPhone, une application non installée
n'a **pas** droit aux notifications, et Safari efface ses données au bout de
sept jours. Medco refuse d'ailleurs de créer un profil tant qu'elle n'est pas
installée.

### iPhone, iPad

Il faut **Safari**. Ni Chrome, ni le navigateur intégré à Gmail ou WhatsApp :
le bouton d'installation n'y existe pas.

1. Ouvrez l'adresse de l'étape 3 dans Safari.
2. Appuyez sur le bouton **Partager** — le carré avec une flèche vers le haut,
   en bas au centre de l'écran.
3. Faites défiler la liste vers le bas.
4. **Sur l'écran d'accueil**.
5. **Ajouter**, en haut à droite.

L'icône Medco — le carré bleu foncé au damier clair — apparaît sur l'écran
d'accueil. Ouvrez-la depuis là, plus jamais depuis Safari.

### Android

1. Ouvrez l'adresse dans **Chrome**.
2. Chrome propose souvent tout seul « Installer l'application » en bas de
   l'écran. Si oui, acceptez : c'est fini.
3. Sinon : menu **⋮** en haut à droite → **Installer l'application**, ou
   « Ajouter à l'écran d'accueil » selon la version.

**Si la ligne « Installer » n'apparaît pas :** vous n'êtes pas dans Chrome, ou
vous avez ouvert le lien depuis une autre application. Copiez l'adresse et
collez-la dans Chrome.

---

## Facultatif — Un nom de domaine à vous

L'adresse `envysuel-sas.github.io/medco/` fonctionne parfaitement. Si vous
préférez `medco.boes-home.com`, il suffit de deux gestes.

### A. L'enregistrement DNS

Chez Cloudflare, sur le domaine `boes-home.com` :

1. Menu **DNS → Records**, bouton **Add record**.
2. Remplissez :

   | Champ | Valeur |
   |---|---|
   | Type | `CNAME` |
   | Name | `medco` |
   | Target | `envysuel-sas.github.io` |
   | Proxy status | **DNS only** — le nuage doit être **gris**, pas orange |

3. **Save**.

⚠ Le nuage gris n'est pas un détail. Proxifié — nuage orange — Cloudflare
intercepte le trafic et GitHub ne peut plus émettre son certificat : le site
s'ouvrirait sur une erreur de sécurité.

### B. La variable du dépôt

1. **Settings → Secrets and variables → Actions**, onglet **Variables**.
2. **New repository variable**.
3. Name : `DOMAINE`. Value : `medco.boes-home.com`. **Add variable**.
4. Relancez le workflow **deploy** comme à l'étape 2.

Retournez dans **Settings → Pages**. Sous « Custom domain », GitHub affiche
maintenant le domaine et commence à émettre le certificat : la case
« Enforce HTTPS » reste grisée dix à quinze minutes. Attendez qu'elle devienne
cochable, et cochez-la.

Si vous aviez déjà installé l'application depuis l'ancienne adresse,
désinstallez-la et réinstallez-la depuis la nouvelle : pour le téléphone, ce
sont deux applications différentes.

---

## Facultatif — Les notifications de rappel

**Sans rien faire, les rappels fonctionnent déjà** : Medco produit un fichier
de calendrier que vous importez dans l'agenda du téléphone. C'est la couche la
plus fiable — l'alarme est gérée par le système, sans réseau, même si tout le
reste tombe (spec §10.2). C'est pour cela qu'elle est activée par défaut pour
une pilule.

Les notifications poussées viennent en plus : elles permettent de valider une
prise en un appui, sans ouvrir l'application. Elles demandent un petit
programme hébergé chez Cloudflare — **pas chez vous** : Cloudflare l'exécute
sur ses propres serveurs, gratuitement, et il ne s'exécute que lorsqu'il est
appelé.

### A. Le déployer

Sur n'importe quel ordinateur, une seule fois :

```bash
npm install -g wrangler
wrangler login                     # ouvre le navigateur pour vous connecter
cd worker
wrangler kv namespace create ABONNEMENTS
```

La dernière commande affiche un identifiant. Recopiez-le dans `wrangler.toml`,
à la place de `à renseigner au premier déploiement`.

Générez ensuite la paire de clés VAPID — l'identité de l'émetteur des
notifications, exigée par la norme :

```bash
npx web-push generate-vapid-keys --json
```

- La **clé publique** va dans `wrangler.toml`, ligne `VAPID_CLE_PUBLIQUE`.
- La **clé privée** ne va jamais dans le dépôt :

  ```bash
  wrangler secret put VAPID_CLE_PRIVEE
  ```

  puis collez-la quand la commande la demande.

Enfin :

```bash
wrangler deploy
```

Wrangler crée lui-même l'enregistrement `rappels.boes-home.com` et son
certificat, dès lors que le domaine est chez Cloudflare.

### B. Le brancher à l'application

**Settings → Secrets and variables → Actions → Variables → New repository
variable** :

- Name : `VITE_URL_WORKER`
- Value : `https://rappels.boes-home.com`

Relancez le workflow **deploy**. Le bouton « Activer les notifications » des
réglages devient opérant.

Sans cette variable, l'application ne tente rien et affiche : « Le Worker de
rappel n'est pas déployé : seule la couche calendrier est disponible. »

---

## Ce qui ne se vérifie pas d'ici

La réception d'une notification ne se teste ni en simulateur ni sur ordinateur
(spec §16.2). Il faut un iPhone et un Android réels : réception sur PWA iOS
installée, réception Android en veille prolongée, import du `.ics` sur Apple
Calendar **et** sur Google Agenda, puis réimportation après modification d'un
plan — c'est là que se jouent les alarmes en double.

---

## En cas de problème

| Symptôme | Cause | Geste |
|---|---|---|
| « There isn't a GitHub Pages site here » | Étape 1 non faite, ou premier workflow pas encore terminé | Vérifiez la coche verte dans **Actions** |
| Page blanche | Le navigateur a gardé une ancienne version en cache | Rechargez en vidant le cache, ou fermez et rouvrez l'onglet |
| « Installer l'application » absent sur Android | Vous n'êtes pas dans Chrome | Collez l'adresse dans Chrome |
| Rien à partager sur iPhone | Vous n'êtes pas dans Safari | Ouvrez l'adresse dans Safari |
| Certificat invalide sur le domaine personnalisé | Nuage orange dans Cloudflare | Repassez l'enregistrement en **DNS only**, puis attendez le certificat |
| Un lien direct comme `…/pilulier` renvoie 404 | — | Ne devrait pas arriver : le build publie un `404.html` copie de la page d'accueil, qui relance l'application |
| « Le Worker de rappel n'est pas déployé » | Variable `VITE_URL_WORKER` absente | Normal si vous n'avez pas fait la partie facultative. Le calendrier, lui, fonctionne |
