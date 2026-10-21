# Vague 16, I3 : espace fédération (21 octobre 2026)

Revue du 21 octobre au soir : la fédération doit pouvoir accueillir un vrai club sans développeur ni ligne de commande.

## Menu de la fédération
Clubs et présidents ; Équipes ; Tournois ; Arbitres et désignations ; Licences et classifications ; Formations des coachs ; puis Calendrier, Salles et Documents. L'accueil et les réglages restent où ils sont. Un arbitre garde son espace arbitre.

## Clubs et présidents (`/[locale]/federation/clubs`)
- Tableau : club et ville, numéro d'affiliation, président (nom, email) et invitation en cours, équipes de la saison, joueurs licenciés de la saison, statut (actif, ou en attente du président).
- « Nouveau club » : nom, ville, numéro d'affiliation (unique dans la fédération), numéro d'entreprise et forme (ASBL, association de fait) facultatifs, email de contact ; puis le président (prénom, nom, email). Le serveur crée le club rattaché à la fédération et envoie l'invitation de président (parcours guidé de I2). Journalisé dans le journal de la fédération.
- « Changer de président » : une invitation de succession. Le président actuel reste en place jusqu'à ce que le nouveau accepte ; à ce moment, les autres mandats de président du club se terminent. Le club n'est jamais sans président, et le président sortant ne peut ni annuler ni renvoyer cette invitation.
- « Renvoyer » et « Annuler l'invitation » sur l'invitation en cours.
- La fédération ne lit que l'identité publique et des comptes : jamais de santé, de cotisations ni de finances.

## Équipes (`/[locale]/federation/teams`)
Lecture seule de toutes les équipes des clubs affiliés pour la saison en cours : club, équipe, catégorie, niveau, joueurs, licenciés, coach responsable ; filtres par catégorie et niveau ; export CSV de ce qui est affiché.

## Arbitres (`/[locale]/federation/referees`)
Au dessus des désignations : la liste des arbitres (nom, email, jours disponibles à venir), « Inviter un arbitre » (rôle arbitre de la fédération, parcours guidé de I2), les invitations en cours avec Renvoyer et Annuler.

## Côté serveur
- Migration additive `0046_federation_clubs.sql` : ville, numéro d'affiliation et forme du club ; sur l'invitation, la fédération émettrice (`issued_by_federation`) et la succession.
- `src/domains/federation/clubs.ts` : vues et commandes, réservées au président de la fédération pour l'écriture (lecture aussi pour les collaborateurs). Toute requête filtre par la fédération active.
- Une invitation envoyée par la fédération est vérifiée dans la fédération : son président, toujours en fonction, d'une fédération à laquelle le club appartient ; sinon le lien est refusé.
- Le script `scripts/bootstrap.ts` reste pour créer la toute première fédération.

## Tests
- Unitaires : `tests/wave16-federation.test.ts`.
- Intégration à deux fédérations : `tests/integration/wave16-federation.integration.ts` (création et arrivée du président dans son club, cloisonnement entre fédérations, collaborateur en lecture seule, équipes sans donnée de santé ni d'argent, changement de président sans club orphelin, émetteur révoqué, arbitres).
- Bout en bout : `tests/e2e/federation-space.spec.ts` avec axe.
- Données de démo : le club de démo reçoit le numéro d'affiliation BPCF-001.
