# API v1 et webhooks (B6)

L'API est en **lecture seule**. Chaque club crée ses clés dans **Club › Page publique › API** ; une clé n'est montrée qu'une fois (seule son empreinte est gardée), porte des droits limités et se révoque à tout moment.

## Authentification et limite

```
GET /api/v1/matches?from=2026-09-01&to=2027-06-30
Authorization: Bearer pfm_<préfixe>_<secret>
```

- 60 demandes par minute et par clé ; au-delà, réponse `429` avec `Retry-After`.
- `401` : clé absente, invalide ou révoquée ; `403` : droit manquant.
- Description complète : `GET /api/v1/openapi.json` (OpenAPI 3.1).

| Chemin | Droit | Contenu |
| --- | --- | --- |
| `/api/v1/teams` | `read:teams` | Équipes du club |
| `/api/v1/matches` | `read:matches` | Matchs ; un résultat seulement s'il est validé, avec les buteurs (nom d'un mineur seulement avec consentement) |
| `/api/v1/tournaments` | `read:tournaments` | Tournois organisés ou joués par le club |
| `/api/v1/events` | `read:events` | Événements ouverts au public (B9) avec leur lien d'inscription |

## Webhooks

Dans **Club › Page publique › Webhooks** : une adresse HTTPS publique et les événements écoutés.

| Événement | Quand | Données |
| --- | --- | --- |
| `registration.validated` | Une inscription est acceptée (après le délai d'annulation) | identifiants de l'inscription et du formulaire |
| `match.validated` | Un résultat de match ou de tournoi est validé | identifiants et score |
| `document.expired` | Un document arrive à expiration | identifiant, catégorie, date |
| `payment.reconciled` | Un virement entrant est rapproché | ligne bancaire, cible, montant |

Chaque envoi est un `POST` JSON `{ "id", "event", "organization", "occurred_at", "data" }` avec les en-têtes :

- `X-PFM-Event`, `X-PFM-Delivery` (l'identifiant, identique si l'envoi est rejoué), `X-PFM-Timestamp` (secondes) ;
- `X-PFM-Signature: sha256=<hex>`, HMAC SHA-256 de `<timestamp>.<corps brut>` avec le secret du webhook.

Vérification côté récepteur (Node) :

```js
import { createHmac, timingSafeEqual } from "node:crypto";
const expected = "sha256=" + createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
const ok = expected.length === signature.length && timingSafeEqual(Buffer.from(expected), Buffer.from(signature)) && Math.abs(Date.now() / 1000 - Number(timestamp)) < 300;
```

Une réponse `2xx` vaut réception. Sinon l'envoi est repris après 1, 2, 4, 8 puis 16 minutes (six tentatives) ; le journal garde chaque essai et permet de rejouer un envoi. Un même événement n'est écrit qu'une fois par webhook : le récepteur peut s'appuyer sur `X-PFM-Delivery` pour ignorer un doublon. Les adresses locales ou privées sont refusées, à l'enregistrement comme à l'envoi.
