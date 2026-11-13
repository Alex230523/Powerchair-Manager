# Réglages : l'abonnement, et supprimer son compte

Demande du 12/11/2026 : l'abonnement à la plateforme se gère depuis les réglages, et on peut y supprimer son compte ou son club avec un délai pour changer d'avis.

## Abonnement à la plateforme

Une nouvelle catégorie des réglages, pour la présidence d'un club ou d'une fédération : la formule, l'essai gratuit, le code de réduction et les factures (payer en ligne, facture électronique). L'entrée « Abonnement à la plateforme » quitte le menu ; l'ancienne adresse `/club/billing`, celle des avis de facture déjà envoyés, mène désormais à `/settings/subscription`, comme le retour de Mollie et les nouveaux avis.

## Supprimer mon compte

Dans Réglages, Mon compte, pour tout le monde :

- la personne tape son adresse e-mail pour confirmer ;
- la suppression est prévue 30 jours plus tard (le même délai que la fermeture d'un club), un e-mail le confirme, et la personne peut l'annuler jusque-là ;
- le jour venu, la tâche horaire `reminders` anonymise le compte : nom « Compte supprimé », adresse remplacée, plus de mot de passe, de second facteur, de session, de photo ni de notifications sur téléphone, mandats révoqués. Les clubs gardent leurs propres fiches (inscriptions, paiements) dans leurs registres ; les journaux gardent l'identifiant du compte, jamais son nom ;
- personne ne laisse une présidence vide : la seule présidente ou le seul président d'un club ou d'une fédération transmet d'abord la présidence (ou ferme le club). Si quelqu'un le devient pendant les 30 jours, son compte est gardé.

Migration `0146_account_deletion.sql`.

## Supprimer son club

La fermeture du club existait déjà, avec ses 30 jours et son certificat : Réglages, Club, Sécurité et données, « Fermer le club ». La recherche des réglages la trouve aussi par « supprimer ».

## Garde-fous

- `tests/integration/account-deletion.integration.ts` : mauvaise adresse refusée, 30 jours et un e-mail, annulation, nouvelle demande, rien avant le jour, anonymisation complète le jour venu, les fiches du club gardées, le seul président refusé, un compte gardé si la personne devient seule présidente entre-temps.
- `tests/e2e/settings-account.spec.ts` (390 px, axe) : l'abonnement dans les réglages et l'ancienne adresse, le seul président renvoyé vers la transmission, la demande et son annulation.
- `tests/wave15-settings.test.ts` : la catégorie pour la présidence seulement.
