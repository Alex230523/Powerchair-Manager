# Vague 15, observation C10 : annulation après une action importante (21 octobre 2026)

Migration `0039_undo.sql` (ajout) : table `undo_action` (club, auteur, type, cible, ce qui a changé, échéance, date d’utilisation).

## Messages courts (toasts)

- `Toast` dans `src/components/ui.tsx` : carte inversée (`--heading` en fond, texte `--on-primary`, donc sombre en thème clair et claire en thème sombre), texte 14 px, icône, bouton texte « Annuler », bouton de fermeture.
- `ToastHost` (`src/components/toast.tsx`), monté une fois dans la coque de l’application : en bas à droite (au-dessus de la future barre mobile grâce à `--bottom-nav-space`), dernier message seul, 8 secondes, minuterie en pause au survol et au focus, zone `role="status"` annoncée par les lecteurs d’écran, masqué à l’impression. Pleine largeur moins 16 px de marge sur téléphone, cibles de 44 px.
- `showToast()` et `undoToast()` utilisables par toute page.

## Annulation côté serveur

- L’action réversible enregistre, dans la même transaction, ce qu’elle a changé (`offerUndo`) et renvoie un identifiant `undo`.
- « Annuler » appelle `POST /api/undo` : seulement par l’auteur, dans le même club, une seule fois, dans les 2 minutes (le message reste 8 secondes à l’écran, plus s’il est survolé), avec les droits de l’action vérifiés à nouveau (et le module toujours actif), puis une ligne `undo.<type>` dans le journal d’audit. Après le délai : « Trop tard pour annuler ».
- Actions concernées :
  - archiver ou réactiver une équipe ou une saison (Gestion du club) : la double confirmation disparaît ;
  - terminer une affectation : l’affectation retrouve sa date de fin et son état ;
  - déplacer un joueur (« Déplacer vers… », page Équipe et fiche joueur) : la nouvelle affectation est annulée (gardée dans l’historique), l’ancienne rouverte telle qu’elle était ;
  - retirer un fauteuil : statut précédent et liens avec les joueurs rouverts, ligne dans l’historique du fauteuil ;
  - masquer un message signalé : message visible à nouveau et signalements rouverts ;
  - encaisser une cotisation avec le bouton ✓ : le paiement, qui est l’écriture du livre de caisse, est annulé (pas supprimé) et l’historique de la créance le note.
- Les suppressions définitives et les envois d’emails gardent leur confirmation.

## Tests

- Unitaires (`tests/wave15-undo.test.ts`) : types identiques à la migration, chaque action offre l’annulation, confirmations retirées, rôle status, 8 secondes, pause au survol et au focus, textes fr/nl/en sans tirets.
- Intégration (`tests/integration/wave15-undo.integration.ts`, deux clubs) : équipe archivée puis restaurée une seule fois avec la ligne d’audit, refus à une autre personne, dans un autre club et après le délai, droits revérifiés, affectation terminée, déplacement, fauteuil retiré avec ses liens, paiement et écriture comptable.
- Bout en bout (`tests/e2e/undo.spec.ts`) : archivage en un clic, « Annuler », trop tard, pause au survol puis disparition, 390 px, axe.

## Vérification

`npm run check`, `npm run test:integration`, `npm run test:e2e:db`.
