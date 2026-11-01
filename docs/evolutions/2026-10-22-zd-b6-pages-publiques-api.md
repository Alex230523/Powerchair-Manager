# B6 : pages publiques, widgets, API et webhooks (22 octobre 2026)

Document « fonctionnalités manquantes » du 22 octobre, point B6, module 18 du cahier des charges. Les résultats et les tournois sortent de derrière la connexion, quand le club le décide. Réglages dans **Club › Page publique** (présidence).

## Décisions
- **Rien n'est public par défaut** : la page s'active d'une case, avec son adresse `/[locale]/c/<adresse>` et ses blocs (présentation, équipes, prochains matchs, résultats validés, classements des tournois, sponsors).
- **Sponsors** : seulement ceux dont la formule le prévoit (nouvelle case « Nommer ces sponsors sur la page publique du club » dans Sponsors › Formules) et dont le partenariat est actif.
- **Résultats** : seulement validés. **Noms des joueurs** (buteurs) : un adulte, ou un **mineur avec le consentement explicite** enregistré par la présidence (onglet « Noms publiés ») ; sinon « un joueur ». Une date de naissance inconnue compte comme mineur. Aucune autre donnée personnelle.
- **Tournois** : une page publique par tournoi, cochée par le club organisateur : calendrier, résultats validés, classements, podium, buteurs (même règle) ; un résultat **corrigé** après validation porte la mention « Résultat corrigé le … ».
- **Widgets** (iframe avec extrait de code) : prochain match, derniers résultats, classement, et le widget d'inscription existant ; intégrables par tout site (`frame-ancestors *`), le reste de l'application ne l'est jamais.
- **Calendrier public (ICS)** : matchs et événements ouverts, sans donnée personnelle, distinct du flux privé, révocable (un nouveau lien remplace l'ancien).
- **Partage** : titre, description, langues et carte Open Graph (logo du club) ; logos et calendrier mis en cache quelques minutes, les pages sont rendues à la demande et montrent donc tout résultat dès sa validation.
- **API v1 en lecture** : clés par club avec droits (équipes, matchs, tournois, événements), empreinte seule conservée, 60 demandes par minute, révocation immédiate, documentation OpenAPI (`/api/v1/openapi.json`, voir `docs/api/README.md`).
- **Webhooks signés HMAC** : inscription validée (après le délai d'annulation ; une annulation retire l'envoi), résultat validé, document expiré, paiement rapproché ; écrits dans la même transaction que le fait, une seule fois par événement ; envoyés par la tâche de fond avec six tentatives ; journal et bouton « Rejouer » (même identifiant) ; adresses privées refusées, y compris après résolution DNS.

## Code
- Migration `0076` : réglages de la page sur `organization`, consentement sur `club_person`, `partner_package.public_visible`, `tournament.public_page`, `tournament_match.corrected_at`, tables `api_key`, `api_rate`, `webhook`, `webhook_delivery`.
- `src/domains/integrations/public.ts` (réglages, page, tournoi, ICS), `api.ts` (clés, limite, données, OpenAPI), `webhooks.ts` (émission, signature, envoi) ; `src/lib/api-v1.ts`.
- Routes `/api/integrations`, `/api/v1/*`, `/api/public/ics/[token]`, `/api/public/club/[slug]` ; pages `/[locale]/club/public`, `/[locale]/c/[slug]`, `/[locale]/c/[slug]/widget/[kind]`, `/[locale]/t/[id]`.
- Émission des webhooks : inscriptions, parcours de match (A5), tournois, documents, rapprochement bancaire (B1).

## Limites connues
- Pas d'image Open Graph générée : le logo du club sert d'image de partage.

## Tests
- Unitaires (`tests/b6-public-api.test.ts`) : nom publié ou non, adresse, signature et vérification, adresses refusées, empreinte de clé, OpenAPI, en-têtes des widgets, textes.
- Intégration (`tests/integration/b6-public-api.integration.ts`) : visiteur anonyme sans donnée privée, mineur sans consentement masqué, adresse déjà prise, tournoi validé puis corrigé, calendrier révoqué, clé avec droit manquant, limite de débit, clé révoquée, webhook signé, repris puis livré, rejoué deux fois avec le même identifiant, jamais en double, deux clubs.
- Bout en bout (`tests/e2e/public-page.spec.ts`), 390 px : publication, visiteur anonyme, widget intégrable sur un autre domaine, clé d'API ; axe.
