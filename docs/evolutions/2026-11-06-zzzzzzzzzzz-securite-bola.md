# Sécurité : audit Broken Access Control (IDOR/BOLA)

Audit du 06/11/2026 : peut-on, en changeant un identifiant, lire ou modifier ce qui appartient à un autre club ou à une autre fédération ?

## Méthode

- **Relevé statique** des 77 domaines : chaque requête SQL qui prend un identifiant venu de la commande ou de l'adresse sans filtre d'organisation, et sans vérification préalable de ce même identifiant (environ 600 requêtes passées au crible, une vingtaine relues à la main) ; chaque fonction qui reçoit l'organisation attendue du client (`expected`) et la compare au contexte actif ; chaque route GET qui lit un identifiant dans son chemin ou sa requête (fichiers, PDF, exports, profils, pièces jointes, jetons publics).
- **Test dynamique** ajouté à l'audit des droits (`npm run audit:access`, `tests/audit/access.spec.ts`) : le président du club B et la fédération B appellent chaque route qui prend un identifiant, avec les vrais identifiants du club démo et de sa fédération (un par table qui porte leurs lignes, plus leurs fiches et identités). Aucun fichier ne doit s'ouvrir, aucun nom de personne du club démo ne doit apparaître, aucune erreur serveur.

## Faille trouvée et corrigée

**Auto-rattachement à une fédération.** Dans Réglages › Club, le président choisissait la fédération du club et l'application l'enregistrait directement (`organization.federation_id`). Or ce rattachement ouvre, côté club, ce qui est partagé entre les clubs d'une fédération : le **marché des transferts** (les joueurs de tous ses clubs, nommément), les **circulaires** adressées aux clubs, les **formations** des entraîneurs, les **prêts de fauteuils** entre clubs, les **matchs amicaux** (équipes des autres clubs), les salles partagées. Un club pouvait donc lire les données d'une fédération qui ne l'avait jamais accepté, et s'inviter dans ses listes.

Correctif :
- Choisir une fédération **envoie une demande** (`federation_request_id`, date, auteur) ; le club reste où il est. La fédération est prévenue et voit la carte **Demandes d'affiliation** dans Clubs ; elle **accepte** (le club est rattaché, l'ancienne fédération le voit partir dans son journal) ou **refuse**. Le club est prévenu des deux.
- Ne choisir aucune fédération **quitte** librement (et retire une demande en cours).
- Seule la fédération demandée décide ; tout le reste est consigné dans le journal du club et de la fédération.
- Réglages › Club affiche l'état : « Demande envoyée à … le …, en attente de sa réponse ».

## Ce qui a été vérifié sans faille

Les téléchargements (documents, pièces d'inscription, justificatifs de formation et de transfert, copies de permis, pièces de subsides, circulaires, factures UBL, attestations RGPD, rapports de la console), les exports (RGPD, événements ouverts), les profils et vues joueur, les feuilles de match et schémas tactiques, les clés d'API et le connecteur MCP de club, les tickets de support : tous filtrent par l'organisation active ou par la personne, et répondent 404 à un identifiant étranger. Les 65 fonctions qui reçoivent l'organisation attendue la comparent au contexte actif (`CONTEXT_CHANGED`). Le rattachement d'une fiche à un code d'identité (série D) exige le code que seule la personne et les responsables de son club connaissent : c'est le consentement prévu.

## Migrations

`0138_affiliation_request.sql` (additive, idempotente) : `organization.federation_request_id`, `federation_requested_at`, `federation_requested_by`.

## Vérification

- `tests/integration/secu-affiliation.integration.ts` : demande sans rattachement, fédération prévenue, seule la fédération demandée décide, refus, acceptation, passage d'une fédération à l'autre, départ libre, fédération inconnue refusée.
- `tests/audit/access.spec.ts` : la passe BOLA ci-dessus et un test de bout en bout de l'ancienne attaque (club B qui demande la fédération démo : rien n'est rattaché, son marché des transferts ne montre aucun joueur démo).
