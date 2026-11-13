# Les actions des tableaux en boutons

Demande du 12/11/2026, confirmée le 13/11/2026 : les petites actions des lignes (Modifier, Retirer, Monter, Descendre, Annuler, Détails…) deviennent des boutons, comme « Ouvrir les finances », au lieu de textes soulignés.

## Ce qui change

- Les 171 boutons d'action en texte souligné (`.text-button`, sur une soixantaine d'écrans) prennent l'allure d'un petit bouton secondaire : fond de carte, bordure, texte en gras, sans soulignement. Une action « danger » (Supprimer) garde sa couleur rouge.
- Un nom ou un titre qui ouvre sa fiche (un joueur, un partenaire, un subside, un déplacement, un formulaire, un club dans la console, le fil d'Ariane des documents, une adresse e-mail ou un téléphone) reste un nom : en couleur, sans cadre, souligné au survol (`.name-link`, 20 endroits).
- Les réponses Présent / Absent de l'espace famille : la réponse choisie est un bouton plein, au lieu d'un texte souligné.
- Sur écran tactile, chaque bouton garde sa cible de 44 px.

## Tests

- `tests/action-buttons.test.ts` : le style des actions (bordure, pas de soulignement), et un nom-lien ne porte jamais un mot d'action.
- Les audits d'affichage de la CI (tailles des cibles, hauteurs des rangées, chevauchements) passent sur toutes les pages.
