# Signaler un problème : application et fauteuil (02/11/2026)

Point 19 de l'avis. Deux signalements pour deux publics : une remarque sur l'application part dans les issues GitHub du projet ; une panne de fauteuil part au club (et au club propriétaire d'un fauteuil prêté). Migration `0098_reports.sql` (additive).

## Partie 1 : « Signaler un problème » dans l'application

- Dans le menu du compte pour tous les profils, et dans Ctrl+K (qui ouvre « Mes signalements » avec la fenêtre). Fenêtre : type (bug, idée, texte à corriger), description, capture facultative.
- Capture faite dans le navigateur, sans bibliothèque ajoutée (le registre npm n'est pas joignable ici) : la page est copiée, puis tout ce qui est une donnée est masqué dans la copie avant l'aperçu (noms, chiffres, champs, photos ; seuls titres, libellés, boutons et menus restent lisibles). La personne voit l'aperçu, peut masquer une autre zone en glissant dessus, ou retirer la capture.
- Contexte joint : page (sans paramètres ni ancre), langue, taille d'écran, navigateur, version, rôle. Ni nom ni email, sauf si la personne coche « On peut me recontacter ».
- Envoi par le serveur vers l'API GitHub : une issue par signalement, étiquettes « signalement » et le type. Le jeton (droits limités aux issues du dépôt) et le dépôt viennent de `PFM_FEEDBACK_GITHUB_TOKEN` et `PFM_FEEDBACK_GITHUB_REPO`, jamais du navigateur. La capture n'est liée que si le dépôt est privé (vérifié à l'envoi) : un lien par jeton imprévisible vers l'image déjà masquée.
- Dix signalements par personne et par jour. Sans jeton configuré, le signalement est gardé et part dès que la configuration existe.
- Suivi : page « Mes signalements » (reçu, en cours, corrigé). La tâche planifiée lit l'état des issues (étiquette « en cours », issue fermée) et prévient la personne quand c'est corrigé.

## Partie 2 : « Signaler une panne » sur un fauteuil

- Complète le signalement de la B3 : type (batterie, moteur, roues ou pneus, joystick ou commande, ceinture ou sécurité, carrosserie, autre) et gravité (utilisable, à surveiller, inutilisable).
- Boutons : fiche fauteuil, fiche joueur (ses fauteuils), page Matériel (choix du fauteuil), accueil du joueur et du parent (leurs fauteuils), accueil du coach (vers le Matériel).
- QR code par fauteuil sur sa fiche, avec l'étiquette à télécharger et imprimer : le scanner ouvre directement la fenêtre de signalement (après connexion).
- Effets : intervention « panne » dans l'historique ; « inutilisable » met le fauteuil hors service et libère ses réservations ; tâche au responsable matériel (rôle avec le droit matériel, sinon la présidence) ; coachs prévenus si le fauteuil est attribué à un joueur attendu dans les 7 jours, avec un fauteuil libre du club proposé en remplacement ; la personne qui a signalé est prévenue à la réparation.
- Fauteuil prêté : le signalement reste chez le club propriétaire et les deux clubs sont prévenus.

## Limites

- La capture dessine la page avec ses styles mais sans ses images ; certains navigateurs (Safari) la refusent : le signalement part alors sans.
- Pour masquer une zone à la main, il faut un pointeur (souris ou doigt) ; au clavier, on peut retirer la capture.
- L'état « en cours » suit l'étiquette « en cours » posée sur l'issue.

## Vérification

- `npx vitest run tests/reports.test.ts`
- `npm run test:integration` (`tests/integration/reports.integration.ts`, deux clubs, GitHub simulé) :
  - issue créée avec son contexte, sans nom ni paramètre de page, jeton seulement dans l'en-tête côté serveur ;
  - nom joint seulement avec l'accord, limite de dix par jour ;
  - état suivi, personne prévenue une fois à la correction ;
  - fauteuil « à surveiller » gardé en service, intervention notée ;
  - fauteuil inutilisable retiré, tâche au responsable, coach prévenu avec remplacement, signaleur prévenu à la réparation ;
  - fauteuil prêté signalé au club propriétaire ; autre club refusé.
- `tests/e2e/reports.spec.ts` à 390 px avec axe.
