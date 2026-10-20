# Vague 10 : tableau de bord, présences en tableau, cotisations ligne par ligne, cagnottes avec les joueurs, accès par rôle (20 octobre 2026)

Vague de finition inspirée de PRÊT : mêmes briques d'écran partout (en-tête de page avec ses boutons à droite, cartes à titre, tuiles de chiffres, pastilles d'état, états vides, barre de filtres). Migration additive `0029_dashboard_dues_fundraising.sql`.

Cette vague corrige aussi le test de bout en bout de la vague 9 sur `main` (l'aperçu de la newsletter est vérifié sans entrer dans son cadre isolé).

## Accueil

- **À faire** : six blocs au plus, trois par ligne, tous de la même taille.
- **Chiffres clés** à gauche, deux par deux ; **Prochains événements** à droite. « Accès rapides » disparaît.
- Sous chaque événement : le nombre de **joueurs présents** et de **coachs présents** (ceux qui ont répondu présent), chacun avec une pastille verte (suffisant), jaune (tendu) ou rouge (pas assez). Les seuils se règlent dans **Réglages > Effectif attendu aux séances**, séparément pour les entraînements et pour les matchs et tournois. Par défaut : coachs, 2 suffisant, 1 tendu, 0 rouge ; joueurs, 5 suffisant, 4 tendu, 3 ou moins rouge.
- Un clic sur un événement ouvre sa fiche dans le calendrier.
- La liste des prochains événements contient aussi les **échéances administratives** : documents qui expirent, échéances de cotisation (le montant du jour), cagnottes qui se terminent, déplacements. Chacun ne voit que ce qui le concerne : le président et les gestionnaires voient tout, une famille voit ses propres échéances.
- « Registres à clôturer » devient **« Présences à remplir »**.
- Bouton **Statistiques** dans l'en-tête, et entrée Statistiques dans le menu Joueurs.

## Présences

Tableau une ligne par personne, une colonne par séance (comme PRÊT). Avant la séance : la réponse à la convocation (✓ ✗ ? ○). Dès le début : le pointage (P présent, A absent, R retard, D parti plus tôt). Un coach change un pointage d'un clic, le tableau passe d'un état au suivant ; après clôture, la correction est tracée avec un motif standard. Le pied du tableau donne le total par séance. Un clic sur l'en-tête d'une colonne ouvre la fiche de la séance en dessous (convocations, rappels, clôture). Les séances sans registre sont listées sous le tableau.

## Cotisations

- Quatre tuiles : dû de la saison, encaissé, en retard, joueurs en retard.
- **Une ligne par joueur** : barème, dû, encaissé, reste, prochaine échéance (en rouge si dépassée), état (payé, en retard, échéance proche, dans les temps, annulé, exonéré). Recherche, filtre par saison et par état.
- Bouton **✓** sur la ligne : encaisser la prochaine échéance (montant proposé, date, moyen, référence). L'encaissement s'écrit dans la comptabilité (entrée, catégorie cotisations) et se rattache à la créance ; impossible d'encaisser plus que le dû. Le lot 09 (import bancaire, QR, rapprochement) n'est pas touché.
- **Détails** : les échéances avec ce qui est payé sur chacune (les plus anciennes d'abord), les paiements reçus, le changement d'échéancier, l'annulation et l'historique.
- Barèmes et émission dans des fenêtres (« Nouveau barème », « Émettre »).
- **Rappel de cotisation** : la page des rappels coche d'office tous les joueurs en retard ; bouton « Cocher tous les retards » pour y revenir.
- **Formulaire d'inscription** : le montant de la cotisation n'est plus écrit dans le formulaire. Le texte porte `{cotisation}` et `{cotisation/n}` (prix par versement), remplis à l'affichage par le barème de la saison ; sans barème, le montant est omis. Le dossier d'un candidat garde le montant en vigueur au moment de sa demande.

## Finance

En-tête avec les boutons qui manquaient : Cotisations, Rapport annuel, Export CSV, **Ajouter une opération** (fenêtre). Les quatre tuiles tiennent sur une seule ligne.

## Levée de fonds

- À la création d'une cagnotte : case **« Les joueurs y participent »**.
- Si oui, la cagnotte apparaît dans l'espace des joueurs et des parents (menu « Levée de fonds », présent seulement quand une telle cagnotte est ouverte), avec **« Qui a rapporté quoi »** : le classement des joueurs et ce que chacun a récolté.
- Chaque joueur (ou un parent pour son enfant) **note lui-même ce qu'il a récolté** : don, sponsor ou vente, date, libellé, montant, donateur. Il voit ses propres notes et peut en retirer une ; un parent ne note que pour ses enfants. Le club voit tout, avec le nom du joueur sur chaque mouvement, et peut aussi attribuer un mouvement à un joueur.
- Les montants des autres mouvements du club restent réservés aux gestionnaires d'argent, comme avant.

## Accès par rôle

- **Joueurs et parents** : menu « Mon espace » seulement : Calendrier, Ma fiche (personnelle, médicale et joueur, pour les parents celles de leurs enfants), Documents, Cotisations, Levée de fonds (si une cagnotte est ouverte aux joueurs), Mes inscriptions. Puis Notifications, Réglages, Mon espace.
- **Coachs** : seulement les modules que le président a cochés dans leurs droits (joueurs, présences, calendrier, documents, argent, matériel, communication, journaux). Un coach sans droit voit le calendrier, sa fiche et les documents.
- **Réglages > Rôles et accès des coachs** : une ligne par coach avec ses droits en pastilles et le bouton **« Choisir ses droits »** (fenêtre : équipe suivie, préréglages, niveau par module, extras). Les joueurs et parents sont listés à part, sans rien à régler.
- **Messagerie** retirée du menu (les fils restent accessibles par leur adresse) ; seuls les mails restent en avant.
- Chaque page continue de vérifier ses propres droits côté serveur : le menu n'est qu'une façade.

## Inscriptions et statistiques

- Inscriptions : en-tête avec « Modèle Tigerstorm » et « Nouveau formulaire », formulaires en tableau compact (titre, ouvert ou fermé, version, Modifier, Dupliquer, Partager, lien public), dossiers en liste serrée avec l'état en pastille et le filtre dans une barre.
- Statistiques : en-tête avec Présences, Calendrier et Export CSV ; barre de filtres (saison, du, au, équipe, type) ; cinq tuiles ; évolution mensuelle et détail par personne côte à côte ; état vide explicite ; message d'erreur avec « Afficher » pour réessayer.

## Tests

- Unitaires (`tests/wave10.test.ts`) : seuils de présence (défauts, matchs et tournois, règles partielles ou invalides), règlement des échéances et état d'une ligne de cotisation, formulaire sans montant écrit et remplissage par le barème, textes identiques en FR/NL/EN et sans tiret long.
- Intégration (`tests/integration/wave10.integration.ts`) : pastilles de présence avec les seuils par défaut puis les seuils du club, vue parent, refus pour un coach ; échéances de cotisation et cagnotte dans la liste, filtrées par famille ; encaissement depuis le tableau, trop perçu refusé, écriture comptable ; cagnotte avec les joueurs (notes d'un parent et d'un joueur, refus pour l'enfant d'un autre, annulation de sa propre note, retrait des joueurs) ; pointage depuis le tableau et vue des statistiques ; formulaire public rempli avec le barème de la saison.
- Bout en bout : cotisations (barème et émission en fenêtre, tableau, détails, encaissement par ✓, menu « Mon espace » d'un joueur), accueil, présences, cotisations et inscriptions sous axe, menu sans Messagerie, seuils de présence enregistrés, en-têtes du tableau de bord.

## Limites

- Les présents comptés sur l'accueil sont ceux qui ont **répondu** présent ; le pointage réel reste dans Présences.
- Le formulaire d'inscription suit le barème le plus élevé de la saison ; un club avec plusieurs barèmes écrit les autres montants dans la description.
- Une cagnotte retirée aux joueurs garde leurs notes déjà faites ; elles restent visibles au club.
