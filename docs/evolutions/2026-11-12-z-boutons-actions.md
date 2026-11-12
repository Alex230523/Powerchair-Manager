# Des boutons plutôt que des textes soulignés

Demande du 12/11/2026 : les liens qui mènent quelque part (« Ouvrir le calendrier », les liens Effectif, Calendrier et Présences d'une carte d'équipe) doivent ressembler au bouton « Ouvrir les finances », pas à un texte souligné. Toutes les pages ont été passées en revue.

## Ce qui change

- **Le pied d'une carte** : « Ouvrir le calendrier » de l'accueil devient un bouton de toute la largeur de la carte.
- **Les cartes d'équipe** : Effectif, Calendrier et Présences sont trois boutons côte à côte, qui passent à la ligne sur un téléphone.
- **L'en-tête d'une carte** : « Voir tout », « Voir le calendrier », « Tout voir → » (accueil des joueurs, des parents, des coachs et de la fédération, dernières opérations des finances) sont des boutons.
- **Les liens seuls sur leur ligne** : « Retour… », « Voir les cotisations », « Tous les matchs », « Ouvrir Mon compte », « Lire le contrat de sous-traitance », « Bibliothèque d'exercices », « Rapport d'activité », « Passer à la saison suivante », les fiches en PDF, « Exporter en CSV », « Ouvrir la page de l'action », « Lien vers l'appel », l'attestation numérotée d'une demande RGPD, les tournois du club, les notifications, les nouveautés, le guide de démarrage, etc. : 57 liens au total, dans 36 composants.

Tous gardent leur rôle de lien (une adresse s'ouvre, dans un nouvel onglet au besoin) : seul l'aspect change, celui du bouton secondaire de l'application, 44 px de haut.

## Ce qui reste un lien

- Un lien dans une phrase.
- Un nom dans une liste ou un tableau (joueur, événement, document, club).
- Une adresse affichée telle quelle (site d'un fournisseur, vidéo d'un exercice).
- « Pas encore de compte ? » sous le formulaire de connexion.
- Les petits boutons d'action dans les lignes des tableaux (Modifier, Retirer…), qui restent compacts.

## Garde-fou

`tests/action-buttons.test.ts` : aucun lien seul dans un paragraphe sans l'aspect d'un bouton (hors la courte liste ci-dessus), aucun lien nu dans l'en-tête d'une carte, les trois boutons des cartes d'équipe, le bouton de pied de carte sur toute la largeur.
