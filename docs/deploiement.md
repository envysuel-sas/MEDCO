# Déploiement

Deux hébergements, deux noms de domaine, une seule zone Cloudflare
(`boes-home.com`).

| Nom | Sert | Hébergeur | Proxy Cloudflare |
|---|---|---|---|
| `medco.boes-home.com` | l'application et les bundles | GitHub Pages | **non** (nuage gris) |
| `rappels.boes-home.com` | le Worker de rappel | Cloudflare Workers | oui, par nature |

---

## 1. `medco.boes-home.com` → GitHub Pages

### 1.1 L'enregistrement DNS

Dans Cloudflare, zone `boes-home.com` → **DNS** → **Add record** :

```
Type    CNAME
Name    medco
Target  envysuel-sas.github.io
Proxy   DNS only        ← nuage GRIS, pas orange
TTL     Auto
```

Le nom cible est `<compte>.github.io`, **sans** le nom du dépôt.

### 1.2 ⚠ Pourquoi le nuage doit rester gris

C'est le point qui coince le plus souvent.

GitHub émet un certificat Let's Encrypt pour le domaine personnalisé, et il le
fait par une validation HTTP qui doit atteindre **ses** serveurs. Derrière le
proxy Cloudflare, la requête n'arrive jamais : GitHub reste bloqué sur
« Certificate not yet created », et l'application répond en `525` ou en
`ERR_TOO_MANY_REDIRECTS`.

Marche à suivre :

1. créer l'enregistrement en **DNS only** ;
2. attendre que GitHub affiche le cadenas (§1.3), généralement quelques
   minutes, parfois une heure ;
3. **ensuite seulement**, si le proxy est souhaité, basculer en orange avec
   SSL/TLS en mode **Full (strict)**. Ce n'est pas nécessaire ici : vingt
   utilisateurs ne justifient ni cache ni pare-feu, et le nuage gris évite
   toute une classe de problèmes.

Si le proxy est activé un jour, vérifier aussi que la règle
« Always Use HTTPS » n'entre pas en conflit avec la redirection de GitHub.

### 1.3 Côté GitHub

Dépôt → **Settings** → **Pages** :

- **Source** : GitHub Actions (le workflow `deploy.yml` s'en charge) ;
- **Custom domain** : `medco.boes-home.com` ;
- cocher **Enforce HTTPS** une fois le certificat émis.

Le fichier `public/CNAME` contient déjà `medco.boes-home.com` : il est copié
dans `dist/` à chaque build, ce qui évite que GitHub oublie le domaine à la
publication suivante.

### 1.4 Vérifier

```bash
dig +short medco.boes-home.com CNAME          # → envysuel-sas.github.io.
curl -sI https://medco.boes-home.com | head -3
curl -s https://medco.boes-home.com/bundles/manifest.json | head -5
```

Le manifest doit répondre : c'est lui que l'application lit au premier
lancement pour installer le catalogue.

---

## 2. `rappels.boes-home.com` → Worker

### 2.1 Pourquoi un sous-domaine séparé

Le Worker ne peut intercepter que du trafic **proxifié** par Cloudflare. Or
`medco.boes-home.com` doit rester non proxifié pour GitHub Pages (§1.2). Les
deux ne peuvent donc pas cohabiter sur le même nom sans complication.

Le Worker répond avec `Access-Control-Allow-Origin`, l'origine croisée ne pose
aucun problème. C'est le montage le plus simple, et le plus facile à défaire.

### 2.2 Déploiement

```bash
cd worker
npx wrangler login

# 1. Espace KV
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
#    → la publique va dans wrangler.toml, la privée dans un secret :
npx wrangler secret put VAPID_CLE_PRIVEE

# 3. Déploiement — le domaine personnalisé de wrangler.toml crée
#    l'enregistrement DNS tout seul.
npx wrangler deploy
```

`custom_domain = true` fait créer par Cloudflare l'enregistrement de
`rappels.boes-home.com` et son certificat. Aucun enregistrement à ajouter à la
main.

### 2.3 Brancher l'application dessus

Dépôt GitHub → **Settings** → **Secrets and variables** → **Actions** →
onglet **Variables** → **New repository variable** :

```
Name   VITE_URL_WORKER
Value  https://rappels.boes-home.com
```

Tant que cette variable est vide, l'application fonctionne : elle exporte le
`.ics` manuellement et **le dit**. Le Worker n'est qu'une commodité, la couche
calendrier reste la garantie (§10.2).

En développement, copier `.env.example` en `.env.local`.

### 2.4 Vérifier

```bash
curl -s https://rappels.boes-home.com/cle-publique          # → la clé VAPID
npx wrangler tail                                            # journal en direct
```

---

## 3. ⚠ Le domaine des `UID` de calendrier ne se change pas

`src/ui/ecrans/Reglages.tsx` fige `medco.boes-home.com` comme domaine des
`UID` du fichier `.ics`. Ce n'est pas une négligence : c'est ce couple
`UID` + `SEQUENCE` qui permet à un agenda de **mettre à jour** un rappel plutôt
que d'en créer un second (§10.4).

Changer ce domaine après une première diffusion ferait apparaître toutes les
alarmes en double chez les utilisateurs qui ont déjà importé le calendrier. Si
le domaine devait changer un jour, il faudrait leur faire supprimer l'ancien
calendrier avant d'importer le nouveau.

---

## 4. Le catalogue

Le bundle est versionné dans le dépôt (`public/bundles/`) et servi comme un
fichier statique. Le workflow `catalogue.yml` le régénère chaque mercredi et le
commite si les six contrôles bloquants passent.

Deux compressions sont publiées : Brotli (le plus petit) et gzip. GitHub Pages
sert un fichier pré-compressé tel quel, sans en-tête `Content-Encoding`, et
`DecompressionStream('br')` n'existe ni sur Safari ni sur Firefox :
l'application choisit le format qu'elle sait décompresser, puis vérifie
l'empreinte SHA-256 de la **base décompressée**.

Volume : environ 3 Mo par installation, une fois. GitHub Pages plafonne à
~100 Go par mois — sans objet à cette échelle.

---

## 5. Ce qui reste à valider sur matériel réel

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
