# Arbitrage : un seul circuit, rapport sur téléphone, frais et formations (02/11/2026)

Points 25 et 36 à 39 de l'avis. Les matchs de club et les matchs de tournoi passent par le même circuit de désignation ; l'arbitre retrouve ses matchs dans son agenda, envoie son rapport depuis son téléphone (même sans réseau), déclare ses frais et ajoute ses formations. Migration `0095_refereeing.sql` (additive, rejouable).

## Partie 1 : un seul circuit

- Une désignation vise un match de club ou un match de tournoi (table `tournament_referee_assignment`, vue `designation` qui réunit les deux). Rôles : principal, assistant, table de marque. Statuts : proposée, acceptée, refusée, retirée.
- Le champ « arbitre » des matchs de tournoi est repris en désignations acceptées. Il reste en phase : le choix fait dans l'éditeur du tournoi devient la désignation principale acceptée, et le champ suit l'arbitre principal qui a accepté (refus ou retrait : le champ se vide).

## Partie 2 : désigner (fédération ou délégué « arbitrage »)

- Page « Arbitres et désignations », bloc « Couvrir les matchs » : chaque match à couvrir, ses désignations, « Sans arbitre » s'il n'y en a pas.
- Pour chaque arbitre proposé : nombre de désignations de la saison et alertes « indisponible », « de ce club », « déjà pris à cette heure » (moins de 90 minutes d'écart). L'alerte du choix s'affiche sous la liste.
- Niveau minimum des arbitres proposés (filtre de la liste).
- Désignation groupée d'une journée de tournoi entière.
- Niveaux nommés par la fédération (Débutant, Régional, National, International par défaut), niveau de chaque arbitre, forfait par match et indemnité kilométrique.

## Partie 3 : agenda et rappels

- Les désignations acceptées entrent dans le flux ICS privé de l'arbitre (lieu, heure, équipes) ; une désignation proposée ou refusée n'y entre pas.
- Tâche quotidienne : une proposition sans réponse après 3 jours est relancée une seule fois ; la veille du match, rappel avec le lieu et les liens d'itinéraire Google Maps et Waze (sans clé) ; un rapport non contesté depuis 48 heures est validé.

## Partie 4 : rapport sur téléphone

- Score, buts et cartons avec le joueur (choisi sur la feuille de match, ou saisi pour l'adversaire) et la minute, incidents, réserves.
- Sans réseau, le rapport attend sur l'appareil et part au retour de la connexion. Seuls les identifiants des joueurs sont gardés : le serveur écrit les noms depuis la feuille de match.
- Le coach de l'équipe (ou le président du club) confirme ou conteste dans les 48 heures, depuis l'onglet « Après » du match. Le rapport confirmé (ou non contesté après 48 heures) alimente les buts et cartons des joueurs ; validé, il ne change plus.

## Partie 5 : notes de frais

- Après un match arbitré : kilomètres, autres frais, détail, justificatif (PDF, PNG, JPEG). Le montant suit le barème de la fédération et s'affiche avant l'envoi.
- La fédération valide ou refuse (motif obligatoire), marque payé, exporte les notes validées en CSV pour le virement ; récapitulatif annuel par arbitre en PDF (l'arbitre a le sien).

## Partie 6 : niveau et formations

- L'arbitre ajoute une formation (justificatif facultatif), sans date d'expiration ; la fédération la valide ou la refuse avec une note.

## Partie 7 : espace arbitre

- Accueil : niveau, jours sans réponse dans les disponibilités des 30 prochains jours, propositions à accepter, prochains matchs avec itinéraires, rapports à envoyer, notes de frais à faire et leur suivi, formations, disponibilités.

## Droits

- Un arbitre ne voit que ses matchs et ce qu'il faut pour arbitrer : équipes, lieu, heure, noms et numéros de la feuille de match. Jamais de santé, de cotisations ni de coordonnées.
- Le bureau de la fédération demande la compétence « arbitrage » (`federation.referees`).
- Une autre fédération ne voit ni ne désigne rien sur ces matchs.

## Limites

- « Dépense dans ses finances » : les finances de la fédération (point 35) n'existent pas encore ; une note payée est marquée payée et sort dans l'export, sans écriture comptable.
- La discipline (point 34) n'existe pas encore : les cartons du rapport validé ne créent pas encore de sanction.
- Le niveau minimum est un filtre du bureau, pas un réglage enregistré par compétition.
- La route `/api/referee` sert toujours aux disponibilités. La route `/api/designations` n'est plus utilisée par l'écran ; elle reste pour les intégrations existantes.

## Vérification

- `npx vitest run tests/refereeing.test.ts` (alertes, montant, itinéraires, délai de 48 heures, commandes, textes dans les trois langues).
- `npm run test:integration` (`tests/integration/refereeing.integration.ts`, deux fédérations) :
  - reprise des arbitres de tournoi (migration rejouée deux fois) ;
  - jour indisponible et conflit de club signalés ;
  - ICS avec la désignation acceptée seulement ;
  - relance unique ;
  - rapport contesté puis confirmé, statistiques à jour, rapport validé figé ;
  - note de frais validée puis payée, export CSV ;
  - formation ajoutée puis validée, niveau ;
  - champ « arbitre » du tournoi en phase avec les désignations ;
  - autre fédération exclue.
- `tests/e2e/refereeing.spec.ts` à 390 px avec axe : désignation avec alerte, acceptation, itinéraire, rapport avec un but de la feuille de match, montant de la note de frais.
