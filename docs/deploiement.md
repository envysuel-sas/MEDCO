# Mettre MEDCO en ligne — guide pas à pas

Ce guide part de zéro. Chaque étape indique **ce que vous tapez**, **ce que
vous devez voir**, et **quoi faire si ça ne marche pas**.

Comptez une heure pour les étapes 1 à 8, qui suffisent à avoir l'application en
ligne. L'étape 9, les rappels, peut attendre un autre jour.

---

## Ce que vous allez construire

```
   Votre téléphone
         │  https://medco.boes-home.com
         ▼
   ┌───────────────┐
   │  Cloudflare   │  ── /rappels/*  ──▶  Worker (les rappels)
   └───────┬───────┘
           │  tunnel chiffré
           ▼
   ┌───────────────┐      ┌──────────────────┐
   │  cloudflared  │ ───▶ │  GitHub Pages    │
   │  (chez vous)  │      │  (les fichiers)  │
   └───────────────┘      └──────────────────┘
```

Trois pièces, trois rôles :

| Pièce | Rôle | Qui la gère |
|---|---|---|
| **GitHub** | garde le code, construit l'application, héberge les fichiers | automatique, à chaque `git push` |
| **cloudflared** | fait le pont entre Cloudflare et GitHub | un petit programme chez vous, à installer une fois |
| **Cloudflare** | reçoit les visiteurs, gère le HTTPS, héberge les rappels | tout se fait depuis leur site web ou en ligne de commande |

### ⚠ Une conséquence à connaître avant de commencer

La machine qui fait tourner `cloudflared` doit rester **allumée**. Si elle
s'éteint, le site devient injoignable — même si GitHub, lui, fonctionne
parfaitement.

C'est le prix du montage que vous avez choisi, et il achète quelque chose de
réel : les rappels et l'application partagent le même nom de domaine, ce qui
simplifie beaucoup la suite. Un Raspberry Pi, un NAS ou un vieux portable
suffisent — `cloudflared` consomme très peu.

---

## Vocabulaire minimal

Vous croiserez ces mots. Rien de plus n'est nécessaire.

| Mot | Ce que ça veut dire ici |
|---|---|
| **Zone** | un domaine géré par Cloudflare. La vôtre est `boes-home.com`. |
| **Enregistrement DNS** | la ligne qui dit « `medco.boes-home.com` mène à tel endroit ». |
| **CNAME** | un type d'enregistrement DNS : « ce nom pointe vers cet autre nom ». |
| **Proxifié** (nuage orange) | le trafic passe *à travers* Cloudflare. C'est ce qu'il nous faut. |
| **DNS only** (nuage gris) | Cloudflare ne fait qu'indiquer l'adresse, sans voir le trafic. |
| **Tunnel** | une connexion sortante permanente de chez vous vers Cloudflare. Aucun port à ouvrir sur votre box. |
| **Worker** | un petit programme qui tourne chez Cloudflare. Ici : envoyer les rappels. |
| **KV** | l'espace de stockage du Worker. Une sorte de carnet d'adresses. |
| **VAPID** | deux clés qui prouvent aux téléphones que les notifications viennent bien de vous. |

---

## Avant de commencer

Vérifiez ces cinq points. Chacun se règle en deux minutes.

**1. Le domaine `boes-home.com` est bien dans Cloudflare.**
Connectez-vous sur [dash.cloudflare.com](https://dash.cloudflare.com). Vous
devez voir `boes-home.com` dans la liste, avec la mention **Active**.

**2. Vous avez accès au dépôt GitHub `envysuel-sas/medco`.**

**3. Vous avez une machine qui reste allumée.**
Linux, macOS, Windows ou un NAS — peu importe. Vous devez pouvoir y ouvrir un
terminal.

**4. Vous savez ouvrir un terminal sur cette machine.**
Toutes les commandes de ce guide s'y tapent.

**5. Le domaine complet est bien `medco.boes-home.com`.**
Il est déjà écrit dans le projet, à trois endroits. **Ne le changez pas** sans
lire l'étape 11.

---

## Étape 1 — Installer `cloudflared`

Sur la machine qui restera allumée.

**Linux (Debian, Ubuntu, Raspberry Pi OS)**

```bash
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb
```

> Sur Raspberry Pi, remplacez `amd64` par `arm64`. Pour savoir : tapez
> `uname -m`. Si la réponse est `aarch64`, c'est `arm64`.

**macOS**

```bash
brew install cloudflared
```

**Vous devez voir**

```bash
cloudflared --version
# cloudflared version 2026.x.x
```

**Si ça ne marche pas** — `command not found` signifie que l'installation n'a
pas abouti. Relisez le message d'erreur de la commande d'installation : neuf
fois sur dix, c'est un `sudo` oublié.

---

## Étape 2 — Connecter `cloudflared` à votre compte

```bash
cloudflared tunnel login
```

**Ce qui se passe** — votre navigateur s'ouvre sur Cloudflare. Connectez-vous,
puis **choisissez `boes-home.com`** dans la liste et cliquez sur
**Authorize**.

**Vous devez voir**, dans le terminal :

```
You have successfully logged in.
… your credentials in /home/vous/.cloudflared/cert.pem
```

**Si ça ne marche pas** — sur une machine sans navigateur (un serveur en SSH),
`cloudflared` affiche une URL à copier. Ouvrez-la depuis votre ordinateur
habituel, autorisez, puis revenez : le terminal continue tout seul.

---

## Étape 3 — Créer le tunnel

```bash
cloudflared tunnel create medco
```

**Vous devez voir**

```
Created tunnel medco with id 8f3c2b1a-…
Tunnel credentials written to /home/vous/.cloudflared/8f3c2b1a-….json
```

📋 **Notez ce chemin de fichier.** Vous en aurez besoin à l'étape 5.

**Si ça ne marche pas** — `tunnel with name already exists` signifie que vous
l'avez déjà créé. Retrouvez-le avec `cloudflared tunnel list` et passez à
l'étape suivante.

---

## Étape 4 — Créer l'entrée DNS

```bash
cloudflared tunnel route dns medco medco.boes-home.com
```

**Vous devez voir**

```
Added CNAME medco.boes-home.com which will route to this tunnel
```

**Vérifiez dans le navigateur** — sur [dash.cloudflare.com](https://dash.cloudflare.com),
ouvrez `boes-home.com` puis **DNS** → **Records**. Une ligne est apparue :

| Type | Name | Content | Proxy |
|---|---|---|---|
| CNAME | medco | `8f3c2b1a-….cfargotunnel.com` | 🟠 **Proxied** |

⚠ **Le nuage doit être orange.** Il l'est automatiquement, et il doit le
rester : un tunnel n'est joignable qu'à travers Cloudflare. Si vous le passez
en gris, le site devient inaccessible.

---

## Étape 5 — Écrire la configuration du tunnel

Créez le dossier et le fichier de configuration :

```bash
sudo mkdir -p /etc/cloudflared
sudo cp /home/vous/.cloudflared/8f3c2b1a-….json /etc/cloudflared/medco.json
sudo nano /etc/cloudflared/config.yml
```

> Remplacez `8f3c2b1a-….json` par le chemin noté à l'étape 3.
> `nano` est un éditeur de texte : on tape, puis `Ctrl+O` `Entrée` pour
> enregistrer et `Ctrl+X` pour sortir.

Collez ceci — le contenu exact est aussi dans
[`deploiement/cloudflared-config.yml`](../deploiement/cloudflared-config.yml) :

```yaml
tunnel: medco
credentials-file: /etc/cloudflared/medco.json

ingress:
  - hostname: medco.boes-home.com
    service: https://envysuel-sas.github.io
    originRequest:
      httpHostHeader: medco.boes-home.com
      originServerName: envysuel-sas.github.io
      connectTimeout: 30s

  - service: http_status:404
```

### ⚠ Les deux lignes qu'il ne faut surtout pas confondre

Ce sont les seules lignes délicates de tout le guide.

- **`httpHostHeader: medco.boes-home.com`**
  GitHub Pages héberge des milliers de sites sur la même adresse. Il choisit
  lequel servir en regardant le nom que le visiteur a demandé. Cette ligne le
  lui dit. **Sans elle, vous verrez la page d'accueil du compte GitHub au lieu
  de l'application.**

- **`originServerName: envysuel-sas.github.io`**
  Le certificat de sécurité de GitHub est établi au nom de `*.github.io`. La
  vérification doit donc porter sur ce nom-là. **Sans elle, la connexion est
  refusée** avec une erreur de certificat.

L'une dit *quel site je veux*, l'autre dit *à qui je parle*. Les inverser ne
fonctionne pas.

---

## Étape 6 — Démarrer le tunnel en permanence

```bash
sudo cloudflared service install
sudo systemctl enable --now cloudflared
```

**Vous devez voir**

```bash
cloudflared tunnel info medco
# … CONNECTOR ID … avec au moins une ligne de connexion
```

et

```bash
systemctl status cloudflared
# Active: active (running)
```

Le tunnel redémarrera tout seul si la machine redémarre.

**Si ça ne marche pas**

| Message | Cause | Correction |
|---|---|---|
| `failed to read config` | mauvais chemin ou faute de frappe dans le YAML | `sudo cat /etc/cloudflared/config.yml` et comparez avec l'étape 5 |
| `credentials file not found` | le `.json` n'a pas été copié | refaites la commande `cp` de l'étape 5 |
| aucune connexion active | le pare-feu bloque la **sortie** | `cloudflared` a besoin de sortir en UDP 7844 ; certains routeurs le bloquent |

> Le YAML est sensible à l'indentation : deux espaces, jamais de tabulation.

---

## Étape 7 — Dire à GitHub quel domaine il sert

Sur GitHub : dépôt **envysuel-sas/medco** → **Settings** → **Pages**.

1. **Source** : choisissez **GitHub Actions**.
2. **Custom domain** : tapez `medco.boes-home.com`, puis **Save**.
3. **Enforce HTTPS** : **laissez la case décochée**.

### ⚠ GitHub va afficher un avertissement, et c'est normal

Vous verrez :

> ⚠ Domain does not resolve to the GitHub Pages server

**N'y touchez pas, tout va bien.** GitHub vérifie que le domaine pointe vers
*ses* serveurs ; ici il pointe vers votre tunnel. Mais GitHub sert quand même
la bonne page, parce que le tunnel lui transmet le nom demandé (c'est la ligne
`httpHostHeader` de l'étape 5).

C'est aussi pourquoi **« Enforce HTTPS » doit rester décochée** : cette option
dépend d'un certificat que GitHub ne peut pas créer dans cette configuration.
Le HTTPS que voient vos utilisateurs est celui de Cloudflare, et il fonctionne.

---

## Étape 8 — Première mise en ligne

Sur votre ordinateur de travail, fusionnez la branche dans `main` (ou poussez
directement dessus). Puis, sur GitHub, ouvrez l'onglet **Actions**.

**Vous devez voir** un job `deploy` qui se déroule en cinq minutes environ :

```
✓ pnpm install
✓ pnpm lint
✓ pnpm test:golden      ← le calcul des doses est vérifié ici
✓ pnpm test
✓ pnpm build
✓ deploy
```

**Si le job échoue sur `test:golden`, ne forcez rien.** C'est le contrôle qui
garantit que le cumul par substance est juste. Un échec veut dire qu'un calcul
de dose est faux : il vaut mieux ne rien mettre en ligne.

---

## Étape 9 — Vérifier

### Depuis un terminal

```bash
curl -sI https://medco.boes-home.com/ | head -1
# HTTP/2 200
```

```bash
curl -s https://medco.boes-home.com/bundles/manifest.json | head -4
# { "version": "2026-08-12", … }
```

```bash
curl -sI https://medco.boes-home.com/pilulier | head -1
# HTTP/2 404      ← oui, et c'est normal (voir plus bas)
```

Ce dernier 404 est attendu : GitHub Pages ne connaît pas de fichier
`/pilulier`, il renvoie donc `404.html` — qui est une copie de l'application.
Dans un navigateur, la page s'affiche normalement. Seul le code de statut est
un 404.

### Depuis votre téléphone

1. Ouvrez `https://medco.boes-home.com` — **dans Safari sur iPhone**, dans
   Chrome sur Android. Pas depuis WhatsApp ni Instagram : leur navigateur
   intégré ne sait pas installer d'application.
2. L'application vous demande de l'installer sur l'écran d'accueil. **C'est
   volontaire et non contournable** : sans installation, iOS efface les données
   au bout de sept jours et n'autorise aucune notification.
3. Installez-la, ouvrez-la depuis l'écran d'accueil.
4. Le catalogue se télécharge — environ 3 Mo, une seule fois.
5. Créez un profil, ajoutez un médicament, enregistrez une prise.

### En cas de problème

| Ce que vous voyez | Cause probable | Correction |
|---|---|---|
| Page d'accueil de GitHub | `httpHostHeader` absente ou mal écrite | étape 5 |
| Erreur 502 ou 1033 | le tunnel ne tourne pas | `systemctl status cloudflared` |
| Erreur de certificat | `originServerName` absente | étape 5 |
| 404 sur la page d'accueil | le déploiement n'a pas eu lieu | onglet **Actions** sur GitHub |
| « Catalogue indisponible » | le fichier n'est pas en ligne | `curl` du manifest ci-dessus |
| Site injoignable d'un coup | la machine du tunnel s'est éteinte | rallumez-la |

---

## Étape 10 — Les rappels (peut attendre)

L'application fonctionne sans cette étape : elle exporte un fichier de
calendrier que vous ajoutez à la main, et elle vous le dit. Les notifications
automatiques demandent un peu plus de travail.

### 10.1 Créer l'espace de stockage

```bash
cd worker
npx wrangler login
npx wrangler kv namespace create ABONNEMENTS
```

**Vous devez voir**

```
{ binding = "ABONNEMENTS", id = "a1b2c3d4e5f6…" }
```

Ouvrez `worker/wrangler.toml` et remplacez `à renseigner au premier déploiement`
par cet `id`.

### 10.2 Créer les clés de notification

```bash
node -e "
const { subtle } = require('node:crypto').webcrypto;
subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']).then(async (paire) => {
  const publique = Buffer.from(await subtle.exportKey('raw', paire.publicKey));
  console.log('PUBLIQUE :', publique.toString('base64url'));
  console.log('PRIVEE   :', JSON.stringify(await subtle.exportKey('jwk', paire.privateKey)));
});"
```

- La ligne **PUBLIQUE** va dans `wrangler.toml`, à la place de
  `VAPID_CLE_PUBLIQUE = "à renseigner…"`.
- La ligne **PRIVEE** ne va **jamais** dans le dépôt. Elle se dépose ainsi :

```bash
npx wrangler secret put VAPID_CLE_PRIVEE
# collez la ligne PRIVEE quand il la demande, puis Entrée
```

### 10.3 Déployer

```bash
npx wrangler deploy
```

**Vérifiez**

```bash
curl -s https://medco.boes-home.com/rappels/cle-publique
# → votre clé publique
```

Si cette commande répond, c'est que Cloudflare a bien compris que
`/rappels/…` va au Worker et que tout le reste va à GitHub. C'est le seul
point à vérifier.

---

## Étape 11 — Trois choses à ne jamais changer à la légère

**1. Le domaine `medco.boes-home.com`.**
Il est inscrit dans les rappels de calendrier déjà installés chez vos
utilisateurs. Le changer ferait apparaître **toutes leurs alarmes en double**.
Si vous devez vraiment le changer, il faudra leur demander de supprimer
l'ancien calendrier avant d'ajouter le nouveau.

**2. Le nuage orange sur l'enregistrement DNS.**
En gris, le tunnel n'est plus joignable et le site disparaît.

**3. Les seuils dans `data/regles.json`.**
Chaque valeur vient d'une source officielle citée et datée. Elles ne
s'ajustent pas au jugé.

---

## Aide-mémoire

```bash
# Le tunnel
systemctl status cloudflared          # est-il en marche ?
sudo systemctl restart cloudflared    # le redémarrer
cloudflared tunnel info medco         # ses connexions
journalctl -u cloudflared -f          # ses journaux en direct

# Le site
curl -sI https://medco.boes-home.com/ | head -1

# Les rappels
cd worker && npx wrangler tail        # journaux du Worker en direct
```

Mettre à jour l'application : poussez sur `main`, GitHub s'occupe du reste.
Rien à faire côté tunnel.

Le catalogue des médicaments se met à jour tout seul chaque mercredi. Vos
utilisateurs le récupèrent à leur prochaine ouverture.

---

## Ce qui ne peut pas être vérifié depuis ce guide

Les rappels ne se testent que sur de vrais téléphones (spec §16.2) :

- [ ] installation depuis Safari (iPhone) et depuis Chrome (Android) ;
- [ ] réception d'une notification sur iPhone, application installée ;
- [ ] réception d'une notification sur Android en veille prolongée ;
- [ ] abonnement au calendrier sur iPhone ;
- [ ] import du fichier `.ics` dans Google Agenda ;
- [ ] **modifier un plan puis réimporter** — c'est là que les alarmes se
      dupliquent, et c'est le risque le plus sérieux du projet ;
- [ ] rouvrir l'application après une semaine sans y toucher, et vérifier que
      les données sont toujours là.

Les simulateurs se comportent différemment des vrais appareils sur exactement
ces points.

---

## Pour aller plus loin

**Restreindre l'accès à vos vingt utilisateurs** avec Cloudflare Access est
possible, mais attention : Apple Calendar récupère le fichier de rappels sans
pouvoir s'authentifier. Si vous activez Access, **excluez-en**
`/rappels/calendrier/*`, sans quoi les rappels de calendrier cesseront de
fonctionner — c'est-à-dire la seule couche qui marche sans réseau.

**Se passer du tunnel** est possible : un CNAME directement vers
`envysuel-sas.github.io` héberge le site sans machine allumée. Il faut alors le
laisser en nuage gris le temps que GitHub crée son certificat, puis le passer
en orange avec le mode SSL « Full (strict) » pour retrouver la route des
rappels. C'est une autre organisation, ni meilleure ni pire ; ce guide décrit
celle que vous avez retenue.
