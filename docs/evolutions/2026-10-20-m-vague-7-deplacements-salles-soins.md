# Vague 7 : déplacements, annuaire des salles, carnet hors ligne, consignes de soin (20 octobre 2026)

Reprises de PRÊT (camps, véhicules, carnet hors ligne, consignes de soin), adaptées au powerchair football.

## Déplacements

Menu Vie du club, **Déplacements** (module activable « Déplacements ») : tournois, matchs à l'extérieur, stages.

- **Résumé** : destination (une salle de l'annuaire, un de nos lieux ou un texte libre), rendez-vous et heure de départ, retour, hébergement et son accessibilité, urgences sur place, contact du club.
- **Participants** : joueurs, coachs, staff, accompagnants, parents ; statut (invité, confirmé, ne vient pas), fauteuil (électrique, manuel), besoins pour le voyage. Un joueur ou une famille répond « je viens / je ne viens pas » pour lui-même.
- **Transport** : véhicules du club ou d'un bénévole, aller, retour ou les deux, chauffeur et téléphone, passagers. Calcul des **places assises et des places fauteuil** (un fauteuil électrique prend une place fauteuil), alerte en cas de dépassement, liste de qui n'a pas encore de véhicule à l'aller et au retour.
- **Véhicules du club** : places, places fauteuil, rampe ou lift, permis requis, assurance et contrôle technique. **Chauffeurs** : catégories de permis et validité. Alertes avant le départ : assurance ou contrôle expirés, permis expiré, permis qui ne couvre pas le véhicule (un minibus de plus de 8 places demande le D1), permis non renseigné.
- **Planning** jour par jour, **préparation** (liste de départ pré-remplie : transport adapté, chargeurs et batteries, licences, documents, consignes relues, hébergement accessible, trousse de secours, carnet hors ligne), cochée par les responsables et le staff du déplacement, avec le nom de qui l'a fait.
- **Documents** des participants qui ne sont pas en ordre avant le retour ; à 14 jours du départ, l'écran invite à relancer.
- **Budget** : lignes prévues, et le réel tiré de la trésorerie (une dépense ou une recette peut désormais être rattachée à un déplacement). Un déplacement qui a des lignes en trésorerie s'annule, il ne se supprime pas.
- Ce que voit chacun : les responsables (président, gestion du calendrier ou des équipes) préparent tout ; le staff qui part voit tout et coche la préparation et les soins ; un joueur ou une famille voit les informations pratiques, sa place et son véhicule, jamais les autres participants.

## Consignes de soin

- Sur la fiche joueur, carte **Consignes de soin** : moment (matin, midi, avant ou après le jeu, au besoin…), heure, consigne et détails. Visibles des coachs du joueur, modifiables par ceux qui gèrent ses besoins d'accompagnement.
- Données de santé : **chiffrées** en base, et chaque lecture par le staff est tracée dans le journal des accès santé.
- Pendant un déplacement, onglet **Soins** : les consignes des participants, jour par jour, cochées avec le nom de l'accompagnant.

## Carnet hors ligne

- Sur la page du déplacement, le staff prépare le **carnet** sur son téléphone : participants, téléphones, contacts d'urgence, besoins, consignes de soin, véhicules et chauffeurs, planning, hébergement et urgences. Les données de santé confidentielles n'y figurent que pour qui a le droit « Voir les données médicales ».
- Le carnet est **chiffré dans le navigateur** avec un code choisi par la personne (au moins 6 chiffres) ; le serveur ne connaît jamais ce code.
- Il s'ouvre **sans réseau** (menu : Carnet hors ligne), s'efface deux jours après le retour, après 10 codes faux, et à la déconnexion. Chaque préparation laisse une ligne dans le journal des accès santé.

## Annuaire des salles

- Menu **Annuaire des salles**, partagé entre tous les clubs et la fédération : accès de plain-pied, toilettes adaptées, vestiaires et douches accessibles, ascenseur, lève-personne, parking, **recharge des fauteuils**, largeur de porte, sol, terrain, remarques, date de vérification.
- Chaque critère vaut oui, non ou **inconnu** (et « inconnu » n'est pas « non »). Filtres « doit avoir », recherche sans accents.
- Les responsables du calendrier et la fédération complètent l'annuaire ; chaque modification est historisée ; un lieu du club se partage en un clic.

## Tests

- Unitaires (`tests/wave7.test.ts`) : charge des véhicules, passagers sans véhicule, compte à rebours, alertes permis et véhicules, format des horaires, accessibilité inconnue.
- Intégration (`tests/integration/wave7.integration.ts`) : préparation complète d'un tournoi (participants, minibus, permis, consignes, soins cochés par le coach, ce que voit le joueur, carnet sans données confidentielles, journal santé), déplacement avec trésorerie, annuaire avec historique et protection contre les modifications concurrentes.
- Bout en bout : déplacements, page d'un déplacement, annuaire, carnet hors ligne, avec contrôle axe.
