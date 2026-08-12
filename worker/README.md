# Worker de rappel

Cloudflare Workers + KV + Cron Triggers. Spec §10.3.

**Facultatif.** Sans lui, l'application propose la couche calendrier — celle
qui est la garantie (§10.2) — et le dit. Il ne demande aucune machine : c'est
Cloudflare qui l'exécute, à la demande, sur son propre nom d'hôte.

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
| `OPTIONS` | `*` | préflight CORS : l'application est sur un autre nom d'hôte |

## Déploiement

Procédure complète, clés VAPID comprises : [`../docs/deploiement.md`](../docs/deploiement.md).

Le Worker vit sur `rappels.exemple.fr`, distinct de `medco.exemple.fr`
qui sert l'application : un Worker n'intercepte que du trafic proxifié par
Cloudflare, or l'enregistrement de GitHub Pages doit rester non proxifié.

## Limite connue

Un abonnement qui ne reçoit plus (404 ou 410) est supprimé au premier envoi
raté. Un utilisateur qui réinstalle l'application doit se réabonner : c'est
l'ouverture de l'app qui s'en charge.

Le push ne se teste pas en simulateur. §16.2 impose un iPhone et un Android
physiques : réception sur PWA iOS installée, réception Android en doze mode.
