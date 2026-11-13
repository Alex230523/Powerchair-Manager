# « Mon équipe nationale » : l'écran du staff national

Relevé de la vérification générale du 13/11/2026 : la route des consignes de soin pour le staff national existait, mais aucun écran ne l'appelait, et le staff des sélections (coach, adjoint, kiné, mécanicien, accompagnant) n'avait pas de page à lui. Validé le jour même.

## Ce qui change

- **Menu** : « Sélection nationale », entrée « Mon équipe nationale », pour toute personne du staff d'une équipe nationale en cours, quel que soit le profil choisi (le coach d'un club comme un compte de la fédération).
- **Page `/national`**, lecture seule, une carte par équipe :
  - le rôle de la personne, les autres membres du staff ;
  - les joueurs : club, classification, statut, disponibilité (et sa précision), consignes de soin partagées ou non ;
  - les rassemblements (à venir et du dernier mois) avec qui vient, qui ne vient pas, qui n'a pas répondu.
- **Consignes de soin** : un bouton « Afficher les consignes de soin » les charge à la demande, seulement pour le coach, l'adjoint, le kiné et l'accompagnant (pas le mécanicien), seulement pour les joueurs qui ont donné leur accord et pendant la période choisie. Chaque lecture est notée dans le journal « Accès aux données sensibles » du club du joueur (nouveau type « Consignes de soin lues par le staff national »). Rien n'est gardé dans la page une fois masqué.
- Une équipe archivée disparaît de la page, et ses consignes ne sont plus lisibles.

La fédération compose toujours l'équipe depuis « Équipes nationales » ; la nouvelle page ne modifie rien.

## Au passage

Le journal des accès sensibles n'avait pas de libellé pour les consignes de soin d'un déplacement : ajouté.

## Technique

- Route `GET /api/national/staff` (`nationalStaffView`), `GET /api/national/care` désormais utilisée par l'écran et journalisée.
- Migration `0149_national_care_log.sql` : type `national_care` dans `sensitive_access_log`.
- `workspace.nationalStaff` pour le menu.

## Tests

- `tests/national-staff.test.ts` : l'entrée de menu pour le staff seul, les rôles qui lisent les soins, les textes dans les trois langues.
- `tests/integration/national-staff.integration.ts` (deux fédérations) : la page du coach, les réponses au rassemblement, les soins avec accord seulement et journalisés dans le club, refus au mécanicien, rien pour qui n'est pas du staff ni pour l'autre fédération, équipe archivée cachée.
- `tests/e2e/national-staff.spec.ts` : menu, page, rassemblement, soins à la demande, 390 px, axe.
