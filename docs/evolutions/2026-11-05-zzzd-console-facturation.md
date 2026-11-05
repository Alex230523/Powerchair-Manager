# Console du gestionnaire, étapes 3 et 4 : suspension, facturation, rappels

Suite de `2026-11-05-zzzc-international-console.md`, d'après la note `claude/console-gestionnaire.md` du projet.

## Suspension d'une organisation (étape 3)

- `organization.suspended_at`, `suspended_reason`. Depuis la fiche d'une organisation, un opérateur Support ou Propriétaire suspend (raison obligatoire, lue par les membres) ou réactive.
- Effet : toute écriture de l'organisation est refusée à la porte (`principal()` dans `src/lib/http.ts`, code `ORG_SUSPENDED`, 403), sauf le changement de contexte, le compte, l'authentification, les signalements et la console. Les lectures restent. Un bandeau sous la barre donne la raison à chaque page.
- L'intervention est inscrite dans `platform_action` et dans le journal d'audit de l'organisation (`platform.suspend`, `platform.reinstate`), donc visible par son président.
- « À faire aujourd'hui » liste les organisations suspendues.

## Facturation des abonnements (étape 4)

- Tables `billing_plan` (code, nom, montant, période mensuelle ou annuelle, base par organisation ou par joueur actif, proposée ou retirée), `billing_subscription` (un abonnement en cours par organisation), `billing_invoice` (numéro `F-AAAA-0001`, période, quantité, montant, émise, échéance, état brouillon, envoyée, payée, annulée, rappels), `billing_reminder`.
- Onglet **Facturation** de la console (rôles Propriétaire et Finance écrivent ; Support et Lecture seule lisent) : chiffres (revenu mensuel récurrent, facturé et encaissé ce mois, à encaisser, en retard), formules, abonnements avec « Facturer une période » (par joueur : les joueurs actifs à la date de la facture, un au moins), factures avec envoyer, marquer payée (date), annuler, envoyer un rappel.
- L'abonnement s'ouvre et se termine depuis la fiche de l'organisation.
- Envoi d'une facture : notice (application, e-mail, téléphone) à la présidence de l'organisation avec le montant et l'échéance, lien vers sa page.
- Rappels : à la main (trois au plus) ou par la tâche quotidienne `reminders` (`billingTick`) par paliers J+3 courtois, J+10 ferme, J+20 préavis de lecture seule, un palier par jour au plus ; chaque rappel est journalisé avec son auteur (ou la tâche).
- Côté organisation : page **Abonnement à la plateforme** (`/club/billing`, menu du président de club et du président de fédération) : formule, reste à payer, factures et leur état, comment payer (virement avec le numéro en communication). Un brouillon n'y apparaît jamais.
- Aucun prestataire de paiement : les paiements sont enregistrés à la main par l'opérateur. Mollie ou Stripe viendront par webhooks quand une clé existera ; la page le dit.
- Tuile « Facturation » du tableau de bord ; « À faire aujourd'hui » liste les organisations avec une facture en retard.

## Migrations

`0127_console_billing.sql` (additive, idempotente).

## Permissions

- `console/billing` : opérateurs seulement (403 à tous les rôles de club et de fédération) ; écriture Propriétaire et Finance.
- `club/billing` : présidents de club et de fédération ; 403 aux autres.

## Limites connues

- Pas d'emprunt de contexte (ouvrir un club comme son président) : prochaine étape, avec raison, durée et e-mail au président.
- Pas d'export UBL ni de rapprochement bancaire des factures de la plateforme.

## Vérification

- `tests/international-console.test.ts` (paliers, numéros, équivalent mensuel, matrice), `tests/integration/billing.integration.ts`, `tests/e2e/international-console.spec.ts` (facture, page du président, suspension et 403, réactivation).
