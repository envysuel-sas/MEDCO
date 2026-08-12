# Worker de rappel

Cloudflare Workers + KV + Cron Triggers. Spec §10.3.

## Ce qu'il sait, ce qu'il ne sait pas

Il sait qu'un endpoint veut un ping à 21 h. Il ne peut pas savoir que c'est une
pilule : le contenu utile est chiffré par l'application avant dépôt, la clé
n'est jamais transmise, le service worker déchiffre à réception.

Le `.ics` servi en `webcal://` est produit par l'application. Ses `SUMMARY`
sont neutres : l'entrée d'agenda est visible par toute personne à qui
l'utilisateur partage son calendrier.

## Routes

| Méthode | Chemin | Rôle |
|---|---|---|
| `GET` | `/cle-publique` | clé publique VAPID, pour l'abonnement côté navigateur |
| `PUT` | `/abonnement/:id` | dépose ou remplace un abonnement |
| `DELETE` | `/abonnement/:id` | retire un abonnement |
| `PUT` | `/calendrier/:id` | dépose le `.ics` produit par l'application |
| `GET` | `/calendrier/:id.ics` | sert le calendrier — cible du `webcal://` |

## Déploiement

```bash
cd worker
npx wrangler kv namespace create ABONNEMENTS   # reporter l'id dans wrangler.toml
npx wrangler secret put VAPID_CLE_PRIVEE       # JWK P-256 sérialisé
npx wrangler deploy
```

Les clés VAPID se génèrent avec WebCrypto :

```js
const paire = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
// publique : exportKey('raw') en base64url  →  VAPID_CLE_PUBLIQUE
// privée   : exportKey('jwk')               →  secret VAPID_CLE_PRIVEE
```

## Limite connue

Un abonnement qui ne reçoit plus (404 ou 410) est supprimé au premier envoi
raté. Un utilisateur qui réinstalle l'application doit se réabonner : c'est
l'ouverture de l'app qui s'en charge.

Le push ne se teste pas en simulateur. §16.2 impose un iPhone et un Android
physiques : réception sur PWA iOS installée, réception Android en doze mode.
