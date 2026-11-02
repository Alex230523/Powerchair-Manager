# H9 et H10. Saison type en un clic, clés dans le profil du coach (02/11/2026)

Migration `0084_season_schedule.sql` (additive) : congés scolaires de référence, référence du club, fermetures, créneaux de saison, clés et badges.

## H9. Planifier la saison

### Calendriers de référence

- Les congés scolaires officiels de la Fédération Wallonie-Bruxelles et de la Communauté flamande sont fournis pour 2025-2026 et 2026-2027. Ils sont repris de leurs publications : calendrier scolaire de la FWB, vlaanderen.be.
- Ils ne sont pas écrits en dur dans le code : ce sont des lignes de données.
  - Une fédération peut saisir ou corriger les congés pour tous ses clubs.
  - Un club peut ajouter une ligne, en remplacer une ou en retirer une pour lui seul. La correction d'un club ne touche pas les autres.
- Les jours fériés belges sont calculés : les dates fixes, et les fêtes liées à Pâques (lundi de Pâques, Ascension, lundi de Pentecôte).
- Le club choisit sa référence : Wallonie-Bruxelles, Flandre, ou les deux pour un club mixte. Réglages › Activités renvoie vers « Planifier la saison ».

### Fermetures

- Chaque lieu peut avoir ses périodes de fermeture (été, travaux), et le club ses propres pauses.

### Assistant « Planifier la saison »

- Accessible depuis l'Agenda, bouton « Planifier la saison ».
- Pour chaque équipe, un créneau : jour, heures, lieu, type d'activité, responsable, titre, première et dernière date.
- « Voir les dates » donne toutes les dates. Les dates sautées sont listées avec leur raison (« Congé d'automne », « Armistice », « Fermé : Travaux ») et un bouton « Réactiver ».
- « Créer les séances » crée une série par créneau, par la création habituelle de l'Agenda : mêmes contrôles (saison de l'équipe, lieu occupé), mêmes avis, l'équipe comme groupe invité.
  - Le créneau est enregistré (`season_slot`) avec l'identifiant de sa série : replanifier ne recrée rien.
  - L'Agenda accepte maintenant une liste de dates exactes pour une série hebdomadaire (`dates`).

### Effets

- Les invitations à répondre partent d'elles-mêmes 14 jours avant chaque séance quand le type d'activité demande une réponse (`seasonSlotInviteTick`), au lieu d'une saison entière d'invitations le même jour.
- Email « Calendrier de la saison » (coché par défaut) aux joueurs et parents des équipes planifiées, avec le bouton vers l'abonnement à l'agenda.

### Changement en cours de saison

- Ouvrir une séance dans l'Agenda et choisir « Occurrences standard suivantes » modifie toutes les séances futures de la série, avec l'avis aux personnes concernées. Cette fonction existait déjà ; elle est maintenant testée sur une série planifiée.

## H10. Clés dans le profil du coach

- Section « Clés et badges » dans le profil d'un coach : libellé libre, date de remise, remarque, « Marquer comme rendu ».
  - Visible par la personne, le président et ceux qui gèrent le matériel ou les membres.
  - Écrite par ces derniers.
- Colonne facultative « Clés » dans la liste des coachs, pour ceux qui peuvent les voir. Comme les autres colonnes, elle peut être masquée.
- Au départ d'un coach (archivage ou motif de départ), une tâche « Récupérer les clés : nom », avec la liste des clés encore détenues, s'il en détient.

## Limites

- Les besoins de réservation de salle (point 18) ne sont pas encore créés : les réservations de salles arrivent avec le point 18.
- Les fiches exercices s'attachent ensuite séance par séance, comme avant.
- Les congés des années suivantes devront être ajoutés quand ils seront publiés (par la fédération ou dans une prochaine migration). Les vacances d'été 2027 de la FWB ne sont pas encore fixées officiellement : elles ne sont pas fournies.

## Vérification

- `npx vitest run tests/h9-h10-season-keys.test.ts tests/access-matrix.test.ts`
- `npm run test:integration` (`tests/integration/h9-h10-season-keys.integration.ts`) :
  - congés de la bonne communauté et jours fériés sautés ;
  - fermeture ;
  - date réactivée ;
  - correction propre à un club ;
  - relance sans doublon ;
  - email préparé ;
  - invitations deux semaines avant ;
  - série modifiée avec avis ;
  - clés vues du président et du coach mais pas d'un autre coach ;
  - rappel au départ ;
  - deux clubs.
- `tests/e2e/season-schedule.spec.ts` à 390 px avec axe.
