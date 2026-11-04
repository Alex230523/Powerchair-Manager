# 18. Réservations de salles et factures (02/11/2026)

Le suivi des réservations de salles est calculé à partir de l'agenda, avec ses tâches et ses factures. Migration `0087_venue_bookings.sql` (additive, idempotente).

## 1. Réservation

- Une réservation par salle et par saison : lieu, créneaux (tirés des séances), statut (à demander, demandée, confirmée, refusée, annulée), référence, document de confirmation (PDF ou image), coût prévu, rythme de facturation (par séance, mensuel, trimestriel, annuel), tarif appliqué, remarques.
- Un lieu indique s'il faut le réserver (case « Réservation nécessaire » dans sa fiche). À la reprise, la salle domicile et les « autres lieux » n'en ont pas besoin ; les salles d'entraînement extérieures oui.

## 2. Calcul automatique

- Chaque séance planifiée (série ou événement seul) dans une salle à réserver rejoint la réservation de cette salle pour sa saison. Deux séries dans la même salle donnent une seule réservation.
- Les créneaux se lisent comme la salle les attend : « chaque mercredi de 18:00 à 20:00, du 2 septembre 2026 au 30 juin 2027 (38 séances) », et les dates isolées une par une.
- Coût prévu = séances × tarif du lieu en vigueur le jour de chaque séance (tarifs datés de C4). Un nouveau tarif recalcule le coût à partir de sa date.
- Le calcul tourne chaque jour (tâche « reminders ») et à l'ouverture de la page Lieux ; le bouton « Recalculer depuis l'agenda » le relance. Rien n'est créé deux fois.

## 3. To-do automatique

Tâches sans doublon, chacune fermée seule quand l'étape est franchie, au président :

- « Demander la réservation » (Administratif et légal), au plus tard un mois avant la première séance, avec l'email prêt à envoyer au contact du lieu (créneaux listés).
- « Relancer la salle » après 10 jours sans réponse à une demande.
- « Payer la facture » à chaque échéance prévue par le rythme de facturation (deux semaines avant), avec son montant ; elle se ferme quand la facture de la période est enregistrée en dépense.
- Dans la to-do, ces tâches ouvrent la section Réservations de la page Lieux.

## 4. Alertes

- Une séance planifiée dans une salle à réserver sans réservation confirmée porte le badge « Salle non confirmée » dans la liste de l'agenda et dans sa fiche (avec le lien vers la réservation), pour le staff.
- Une séance annulée ou déplacée alors que la salle était déjà demandée ou confirmée crée la tâche « Prévenir la salle » (Événements) avec l'email préparé.

## 5. Factures

- Ajouter une facture (période, montant, date) et déposer son fichier (PDF ou image).
- Le montant est comparé au coût prévu de la période : badge « Conforme au prévu » ou « Écart ».
- « Enregistrer la dépense » crée l'opération (catégorie Salle, liée à l'équipe quand toutes les séances sont les siennes), une seule fois ; le fichier de la facture devient son justificatif. Une facture enregistrée ne peut plus être retirée.
- Les coûts de salle apparaissent ainsi dans les finances et le budget ; la page Lieux montre aussi le coût prévu par équipe.

## 6. Page Lieux

- Section « Réservations de salles » : pour chaque salle et saison, le statut, les créneaux, le coût prévu, facturé et payé, l'email prêt (« Ouvrir dans la messagerie », « Copier l'email »), la facturation, la confirmation et les factures.

## Droits

- Préparer et suivre les réservations : président ou gestion de l'agenda. Lecture : lecture de l'agenda.
- Enregistrer la dépense : président ou gestion des cotisations, module Finances actif.
- Toutes les requêtes filtrent par organisation ; une réservation, une facture ou un fichier d'un autre club est refusé.

## Limites

- L'email se prépare ; il part de la messagerie de la personne (lien `mailto:`) pour que la salle réponde à quelqu'un du club.
- Les séances passées d'une saison restent comptées ; les réservations ne se créent que pour des séances à venir.

## Vérification

- `npx vitest run tests/t18-bookings.test.ts tests/access-matrix.test.ts`
- `npm run test:integration` (`tests/integration/t18-bookings.integration.ts`) :
  - série hebdomadaire qui crée une seule réservation de saison ;
  - coût recalculé après changement de tarif ;
  - tâche de demande puis de relance ;
  - alerte d'une séance sans réservation confirmée ;
  - annulation et déplacement qui créent « Prévenir la salle » ;
  - facture liée à une seule opération, avec son justificatif ;
  - salle domicile sans réservation nécessaire ;
  - deux clubs.
- `npm run test:e2e:db` (`tests/e2e/venue-bookings.spec.ts`) : 390 px, axe.
