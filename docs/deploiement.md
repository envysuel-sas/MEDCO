# Déploiement

**GitHub Pages héberge, `cloudflared` est l'entrée publique.**

```
   navigateur ──HTTPS──▶ Cloudflare ──┬── route Worker : /rappels/*
                                       │      (push + webcal, §10.3)
                                       │
                                       └── tunnel ──▶ GitHub Pages
                                                      envysuel-sas.github.io
```

Un seul nom, **`medco.boes-home.com`**. L'application et le Worker partagent la
même origine : pas de CORS, une seule entrée DNS, et un `webcal://` sous le
domaine de l'application.

## Pourquoi ce montage plutôt qu'un CNAME direct vers GitHub

Un CNAME direct vers `envysuel-sas.github.io` fonctionnerait, mais il doit
rester **non proxifié** le temps que GitHub émette son certificat — et un
enregistrement non proxifié ne peut pas porter de route de Worker.

Le tunnel renverse la contrainte : son enregistrement DNS est un CNAME vers
`<uuid>.cfargotunnel.com`, **nécessairement proxifié**. La route Worker
`/rappels/*` devient possible, et le TLS public est celui de Cloudflare — plus
de certificat à faire émettre ni à renouveler.

---

## 1. Le tunnel

`cloudflared` peut tourner n'importe où : une machine de la maison, un
conteneur, un Raspberry Pi. Il n'expose rien — c'est lui qui sort vers
Cloudflare.

```bash
cloudflared tunnel login                      # choisir la zone boes-home.com
cloudflared tunnel create medco
cloudflared tunnel route dns medco medco.boes-home.com
```

La dernière commande crée l'enregistrement toute seule :

```
Type    CNAME
Name    medco
Target  <uuid-du-tunnel>.cfargotunnel.com
Proxy   Proxied          ← nuage ORANGE, obligatoire et automatique
```

Puis copier [`deploiement/cloudflared-config.yml`](../deploiement/cloudflared-config.yml)
vers `/etc/cloudflared/config.yml` :

```bash
sudo cloudflared service install
sudo systemctl enable --now cloudflared
cloudflared tunnel info medco        # au moins une connexion active
```

### ⚠ Les deux lignes de `originRequest` qui font tout

```yaml
service: https://envysuel-sas.github.io
originRequest:
  httpHostHeader: medco.boes-home.com
  originServerName: envysuel-sas.github.io
```

Elles ne sont pas interchangeables :

- **`httpHostHeader`** — GitHub Pages route **par en-tête Host**. Sans lui, le
  tunnel recevrait la page d'accueil du compte, pas ce site.
- **`originServerName`** — le certificat présenté par GitHub couvre
  `*.github.io`. La validation TLS doit porter sur ce nom, pas sur le domaine
  personnalisé, sinon la connexion échoue.

---

## 2. Côté GitHub

Dépôt → **Settings** → **Pages** :

- **Source** : GitHub Actions ;
- **Custom domain** : `medco.boes-home.com` ;
- **Enforce HTTPS** : **laisser décoché**.

`public/CNAME` contient déjà le domaine ; il est copié dans `dist/` à chaque
build, ce qui évite que GitHub l'oublie à la publication suivante.

### ⚠ L'avertissement de GitHub est attendu

GitHub vérifie que le domaine résout vers ses serveurs. Ici il résout vers le
tunnel : le bandeau « Domain does not resolve to the GitHub Pages server »
apparaîtra, et GitHub n'émettra pas de certificat Let's Encrypt.

**Ce n'est pas un problème** : le TLS vu par l'utilisateur est celui de
Cloudflare, et `cloudflared` parle à GitHub en HTTPS avec le certificat
`*.github.io`. Le site est bien servi, parce que Pages route sur l'en-tête
`Host` que le tunnel lui transmet — pas sur le DNS.

C'est aussi pour cela qu'« Enforce HTTPS » doit rester décoché : GitHub ne peut
pas provisionner le certificat dont cette option dépend.

---

## 3. Le repli SPA

GitHub Pages ne sait pas faire de `try_files` : `/pilulier` rechargé
directement ne correspond à aucun fichier et renvoie 404.

La convention de Pages est de servir `404.html`. Le build en produit une copie
conforme d'`index.html` (plugin `repliSpa` dans `vite.config.ts`) : l'application
démarre et le routeur prend la main. Le service worker rend le cas rare une fois
l'app installée, mais un lien partagé ou une première visite passent bien par là.

---

## 4. Le Worker de rappel

Monté sur le même nom d'hôte, sous `/rappels/*`. Une route de Worker passe
**avant** l'origine du tunnel : tout ce qui n'est pas sous ce préfixe continue
vers GitHub Pages.

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

---

## 5. Vérifier

```bash
dig +short medco.boes-home.com                            # → les IP de Cloudflare
curl -sI https://medco.boes-home.com/ | head -3            # → 200, l'application
curl -s  https://medco.boes-home.com/bundles/manifest.json | head -3
curl -sI https://medco.boes-home.com/pilulier | head -1    # → l'app démarre (repli 404.html)
curl -s  https://medco.boes-home.com/rappels/cle-publique  # → la clé VAPID (Worker)
```

Les deux dernières réponses viennent de sources différentes tout en partageant
le nom : c'est la route de Worker qui fait la bascule.

`cloudflared tunnel info medco` et `npx wrangler tail` donnent les journaux des
deux côtés.

---

## 6. ⚠ Cloudflare Access devant l'application

Restreindre l'accès par Access est tentant à vingt utilisateurs connus. Deux
réserves sérieuses :

- **Le calendrier ne s'authentifie pas.** Apple Calendar récupère le `.ics` en
  `webcal://` sans cookie ni jeton. Une politique sur `/rappels/*` couperait la
  couche de rappel qui sert justement de garantie (§10.2). Si Access est
  activé, il faut en **exclure** `/rappels/calendrier/*`.
- **Les endpoints de push ne sont pas sur ce domaine** — ils sont chez Apple et
  Google. Access ne les protège pas et n'a pas à les voir.

Le carnet ne quitte de toute façon jamais l'appareil, et le `.ics` publié ne
nomme aucun médicament (§10.4).

---

## 7. Ce qui ne se change pas après coup

Le domaine des `UID` du calendrier est figé à `medco.boes-home.com` dans
`src/ui/ecrans/Reglages.tsx`. C'est le couple `UID` + `SEQUENCE` qui permet à un
agenda de **mettre à jour** un rappel plutôt que d'en créer un second (§10.4).

Le changer après une première diffusion ferait apparaître toutes les alarmes en
double chez ceux qui ont déjà importé le calendrier.

---

## 8. Le catalogue

Versionné dans le dépôt (`public/bundles/`), servi comme fichier statique,
régénéré chaque mercredi par `catalogue.yml` si les six contrôles bloquants
passent.

Deux compressions sont publiées : Brotli et gzip.
`DecompressionStream('br')` n'existe ni sur Safari ni sur Firefox :
l'application choisit le format qu'elle sait décompresser, puis vérifie
l'empreinte SHA-256 de la **base décompressée** — la seule vérifiable quoi que
le serveur ou le proxy aient fait des octets en chemin.

Environ 3 Mo par installation, une fois. GitHub Pages plafonne à ~100 Go par
mois : sans objet à cette échelle, et Cloudflare met de toute façon les
fichiers en cache.

---

## 9. Ce qui reste à valider sur matériel réel

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
