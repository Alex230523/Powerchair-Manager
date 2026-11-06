# International, étape 4 : la compétition, objet de l'organisateur vu par les deux clubs

Suite de `2026-11-06-zzzz-identite-registre.md`, d'après la note `claude/architecture-multi-pays.md` (étape 4 du chemin). Le modèle des tournois (organisateur, clubs, journées, matchs à deux clubs, résultats validés, classements, trophées) existait ; cette étape le relie aux calendriers des clubs et lui donne sa couche.

## Ce qui change

- **Niveau** (`tournament.tier`, 0 à 9) : non classé, élite, deuxième division, troisième division, régional, jeunes. Choisi à la création ou à la modification, affiché en badge.
- **International** : calculé, pas stocké : des clubs de plus d'un pays jouent la compétition (badge et liste des pays). Les invitations acceptaient déjà n'importe quel club de la plateforme ; le pays vient de `organization.country_code`.
- **L'équipe qui joue** (`tournament_club.team_id`) : le club la nomme en acceptant l'invitation (sélecteur à côté du nom d'équipe) ou plus tard depuis la page du tournoi (« Équipe qui joue »).
- **Miroir dans les calendriers** (`match.tournament_match_id`) : pour chaque match du tournoi et chaque club ayant nommé son équipe, une ligne `match` dans le calendrier de cette équipe : adversaire (nom d'équipe ou de club), domicile ou déplacement, type (championnat si le format est une ligue, tournoi sinon), compétition, date et heure (journée + coup d'envoi, Europe/Brussels), lieu de la journée, statut. À la validation du résultat, le score arrive dans les deux calendriers, chacun de son côté. Un match retiré du tournoi passe « annulé » dans les calendriers (jamais supprimé : une composition ou une feuille peuvent y tenir) et se détache. Un club qui retire son équipe garde les matchs joués ; les autres passent annulés.
- Côté club, un match miroir garde sa date, son lieu et son résultat du tournoi : la modification de la rencontre et la saisie du résultat (page des matchs, parcours du match) répondent `TOURNAMENT_MATCH` et le parcours l'explique. Composition, convocation du jour, feuille, direct restent au club.
- Le miroir se recalcule à chaque action sur le tournoi (journée, match, résultat, validation, équipe nommée, réponse à l'invitation).

## Migrations

`0132_competition_tiers.sql` (additive, idempotente).

## Permissions

Inchangées : `team` suit `respond` (président du club invité) ; le reste suit l'organisateur.

## Limites

- Le match miroir est créé au nom du créateur du tournoi (ou, à défaut, d'un président du club) : la colonne `created_by` de `match` l'exige.
- Pas de désignation d'arbitre reportée sur le match miroir (elle reste sur le match du tournoi).

## Vérification

- `tests/integration/tournament-mirror.integration.ts` (niveau, international, équipe nommée, miroir à la création, au déplacement du coup d'envoi, au résultat validé, à la suppression, au retrait de l'équipe), `tests/integration/tournaments.integration.ts` et `wave16-club-tournaments` inchangés et verts.
