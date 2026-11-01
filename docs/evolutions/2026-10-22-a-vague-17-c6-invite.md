# Vague 17, C6 : « invité » à la place de « convoqué » (22 octobre 2026)

Revue du 21 octobre, observations de 23 h, point C6.

## Ce qui change
Le vocabulaire de la convocation disparaît des textes visibles, dans les trois langues : présences, calendrier et planificateur, matchs, fiche du joueur, accueil, notifications et e-mails, journal des actions, statistiques.
- Français : convoquer, convoqué, convocation deviennent inviter, invité, invitation (« Personnes à inviter », « Pas invité », « Invitations et présences »).
- Néerlandais : oproepen, opgeroepen, oproeping deviennent uitnodigen, uitgenodigd, uitnodiging. « Oproep » au sens d'un appel à projets (subsides) reste tel quel.
- Anglais : call-up, called up deviennent invitation, invited.

Aucune table ni colonne n'est renommée (`attendance_invitation` porte déjà le bon nom). Le guide local et l'index des domaines suivent ; les notes d'évolution et de recette déjà publiées restent des archives.

## Tests
- `tests/wave16-vocabulary.test.ts` : échoue si un texte visible (composants, pages, e-mails, traductions) contient encore « convoqu », « opgeroep », « summon » ou « call-up ».
- Bout en bout : `attendance.spec.ts` et `calendar-planner.spec.ts` suivent les nouveaux libellés.
