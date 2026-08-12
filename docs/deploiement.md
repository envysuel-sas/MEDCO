# Déploiement

L'application est servie **depuis la maison**, derrière un tunnel
`cloudflared`. Aucun port n'est ouvert sur la box, aucune IP publique n'est
exposée, aucun certificat n'est à renouveler : le tunnel sort vers Cloudflare,
qui termine le TLS à la périphérie.

```
   navigateur ──HTTPS──▶ Cloudflare ──┬── route Worker : /rappels/*
                                       │      (push + webcal, §10.3)
                                       │
                                       └── tunnel ──▶ maison
                                                      Caddy :8080
                                                      /srv/medco
```

Un seul nom : **`medco.boes-home.com`**. L'application et le Worker partagent
la même origine — pas de CORS, une seule entrée DNS, et un `webcal://` sous le
domaine de l'application.

---

## 1. Le tunnel

### 1.1 Création

Sur le serveur de la maison :

```bash
cloudflared tunnel login                      # ouvre le navigateur, choisir boes-home.com
cloudflared tunnel create medco               # crée le tunnel et son fichier d'identifiants
cloudflared tunnel route dns medco medco.boes-home.com
```

La dernière commande crée l'enregistrement DNS toute seule :

```
Type    CNAME
Name    medco
Target  <uuid-du-tunnel>.cfargotunnel.com
Proxy   Proxied          ← nuage ORANGE, obligatoire et automatique
```

⚠ **Ce nuage doit rester orange.** Un tunnel n'est joignable qu'à travers le
réseau Cloudflare ; en « DNS only », le nom ne résout vers rien d'utilisable.
C'est l'inverse exact de ce qu'exigerait GitHub Pages — et c'est ce qui rend
possible la route de Worker du §3.

### 1.2 Configuration

Copier [`deploiement/cloudflared-config.yml`](../deploiement/cloudflared-config.yml)
vers `/etc/cloudflared/config.yml`, puis :

```bash
sudo cloudflared service install
sudo systemctl enable --now cloudflared
cloudflared tunnel info medco        # doit montrer au moins une connexion active
```

---

## 2. Le serveur statique

[`deploiement/Caddyfile`](../deploiement/Caddyfile) sert `/srv/medco` sur
`127.0.0.1:8080`. Quatre points ne sont pas décoratifs :

| Réglage | Pourquoi |
|---|---|
| `try_files {path} /index.html` | Le routeur gère `/pilulier`, `/reglages`, `/produits/<id>`. Sans ce repli, un rechargement sur une URL profonde renvoie 404. **C'est ce qui manquait à GitHub Pages** — le tunnel règle le problème au lieu de le contourner. |
| `Content-Type: application/wasm` | `WebAssembly.instantiateStreaming` refuse tout autre type : sans lui, SQLite ne démarre pas et l'application n'a plus de base. |
| Bundles servis bruts | Les fichiers `bundles/*.br` et `*.gz` sont **pré-compressés**. Poser `Content-Encoding` ferait décompresser le navigateur en chemin ; l'application décompresse elle-même et vérifie l'empreinte SHA-256 de la base. |
| `sw.js` en `no-cache` | Un service worker mis en cache ne se met jamais à jour : les appareils déjà installés resteraient sur l'ancienne version indéfiniment. |

Caddy est un exemple ; nginx convient tout autant, à condition de reproduire
ces quatre points.

---

## 3. Le Worker de rappel

Monté **sur le même nom d'hôte**, sous `/rappels/*`. C'est possible parce que
le tunnel rend le nom proxifié : une route de Worker n'intercepte que du trafic
qui traverse Cloudflare. Elle passe **avant** l'origine du tunnel ; tout ce qui
n'est pas sous `/rappels/` continue vers la maison.

```bash
cd worker
npx wrangler login

# 1. Espace KV — abonnements push et calendriers publiés
npx wrangler kv namespace create ABONNEMENTS
#    → reporter l'`id` renvoyé dans wrangler.toml

# 2. Clés VAPID (RFC 8292)
node -e "
const { subtle } = require('node:crypto').webcrypto;
subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']).then(async (paire) => {
  const publique = Buffer.from(await subtle.exportKey('raw', paire.publicKey));
  console.log('VAPID_CLE_PUBLIQUE =', publique.toString('base64url'));
  console.log('VAPID_CLE_PRIVEE  =', JSON.stringify(await subtle.exportKey('jwk', paire.privateKey)));
});"
#    → la publique dans wrangler.toml, la privée en secret :
npx wrangler secret put VAPID_CLE_PRIVEE

# 3. Déploiement
npx wrangler deploy
```

Vérifier :

```bash
curl -s https://medco.boes-home.com/rappels/cle-publique   # → la clé VAPID
curl -sI https://medco.boes-home.com/                       # → l'application
npx wrangler tail                                           # journal en direct
```

Les deux réponses doivent venir de sources différentes tout en partageant le
nom : c'est la route de Worker qui fait la bascule.

---

## 4. Le déploiement de l'application

[`scripts/deployer.sh`](../scripts/deployer.sh), lancé sur le serveur :

```bash
cd /opt/medco
VITE_URL_WORKER=https://medco.boes-home.com/rappels ./scripts/deployer.sh /srv/medco
```

Il met à jour le dépôt, installe, **passe les contrôles — dont le jeu doré, qui
est bloquant** — construit, puis bascule le contenu servi par un `mv`
atomique. Un `rsync` en place laisserait quelques secondes un `index.html` neuf
pointant vers des fichiers déjà supprimés : un rechargement pendant ce laps de
temps casse l'application.

Pour automatiser, les unités systemd sont fournies :

```bash
sudo cp deploiement/medco-deploiement.{service,timer} /etc/systemd/system/
sudo systemctl enable --now medco-deploiement.timer
```

Le catalogue BDPM est régénéré le mercredi par `catalogue.yml` et commité ; le
timer récupère le tout le jeudi matin.

Le serveur a donc besoin de Node et pnpm. Si vous préférez l'en dispenser, la
CI peut publier `dist/` en artefact et le serveur se contenter de le récupérer
— le workflow `deploy.yml` produit déjà cet artefact.

---

## 5. ⚠ Cloudflare Access devant l'application : attention

Restreindre l'accès par Cloudflare Access est tentant à vingt utilisateurs
connus. Deux réserves sérieuses :

- **Le calendrier ne s'authentifie pas.** Apple Calendar récupère le `.ics` en
  `webcal://` sans cookie ni jeton. Une politique Access sur `/rappels/*`
  couperait la couche de rappel qui sert justement de garantie (§10.2). Si
  Access est activé, il faut en **exclure** `/rappels/calendrier/*`.
- **Les endpoints de push ne sont pas sur ce domaine** — ils sont chez Apple et
  Google. Access ne les protège pas et n'a pas à les voir.

Le contenu n'est de toute façon jamais exposé : le carnet ne quitte pas
l'appareil, et le `.ics` publié ne nomme aucun médicament (§10.4).

---

## 6. Ce qui ne se change pas après coup

Le domaine des `UID` du calendrier est figé à `medco.boes-home.com` dans
`src/ui/ecrans/Reglages.tsx`. C'est le couple `UID` + `SEQUENCE` qui permet à un
agenda de **mettre à jour** un rappel plutôt que d'en créer un second (§10.4).

Changer ce domaine après une première diffusion ferait apparaître toutes les
alarmes en double chez ceux qui ont déjà importé le calendrier. Si cela devait
arriver, il faudrait leur faire supprimer l'ancien calendrier avant d'importer
le nouveau.

---

## 7. Le catalogue

Versionné dans le dépôt (`public/bundles/`), servi comme fichier statique,
régénéré chaque mercredi par `catalogue.yml` si les six contrôles bloquants
passent.

Deux compressions sont publiées : Brotli (le plus petit) et gzip.
`DecompressionStream('br')` n'existe ni sur Safari ni sur Firefox :
l'application choisit le format qu'elle sait décompresser, puis vérifie
l'empreinte SHA-256 de la **base décompressée** — la seule vérifiable quel que
soit ce que le serveur a fait des octets en chemin.

Environ 3 Mo par installation, une fois.

---

## 8. Ce qui reste à valider sur matériel réel

Le déploiement ne suffit pas à considérer les rappels comme livrés (§16.2) :

- [ ] installation depuis Safari (iOS) et depuis Chrome (Android) ;
- [ ] réception d'un push sur PWA iOS installée ;
- [ ] réception d'un push Android en doze mode ;
- [ ] abonnement `webcal://` sur Apple Calendar ;
- [ ] import `.ics` sur Google Agenda ;
- [ ] **réimportation après modification d'un plan** — c'est là que se jouent
      les doublons d'alarmes ;
- [ ] persistance du stockage après une semaine sans ouverture.

Les simulateurs mentent précisément sur ces points.
