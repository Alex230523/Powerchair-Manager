# Fin de coach : le parcours de départ (02/11/2026)

Le pendant du parcours d'accueil. Sur la fiche d'un coach, le bouton « Fin de coach » prépare son départ : l'application liste ce qui le concerne et coche chaque étape quand elle est faite. Migration `0090_offboarding.sql` (additive).

## Démarrer

- Qui : la présidence, ou une personne qui gère les mandats ou les membres du club.
- Formulaire : date de fin (aujourd'hui ou plus tard), raison (il arrête, il part dans un autre club, non précisée), note interne (visible seulement par les responsables), « Prévenir le coach ».
- Un seul départ en cours par personne.

## Étapes, générées seulement si elles le concernent

| Étape | Présente quand | Cochée quand |
| --- | --- | --- |
| Choisir un remplaçant (une par équipe) | Il est coach actif d'une équipe | Un autre coach est actif dans l'équipe |
| Réattribuer ses tâches | Il a des tâches ouvertes | Plus aucune ; bouton « Réattribuer toutes ses tâches » |
| Réattribuer ses responsabilités | Il est responsable de séances à venir ou conducteur d'un déplacement | Plus aucune ; bouton « Réattribuer séances et déplacements » |
| Récupérer les clés et badges (bloquante) | Une clé n'est pas rendue | Toutes rendues (« Clés et badges » sur la fiche) |
| Garder ses fiches exercices | Il a des fiches privées | Le coach seul choisit : les donner au club ou les garder |
| Fixer la fin de ses droits | Il a un mandat de coach | Ses mandats de coach finissent au plus tard à la date de fin |
| Prévenir l'équipe et les parents | Il a une équipe | Message « Départ d'un coach » envoyé |
| Remercier | Toujours | Remerciement envoyé (avec l'attestation sur sa fiche) |
| Questionnaire de départ | Il a un compte | Le coach répond à trois questions |
| Clôturer | Toujours | À la date de fin |

- Chaque étape gérée par le club a sa tâche dans la to-do (échéance avant la date de fin) ; la tâche ouvre la fiche du coach et se ferme avec l'étape.
- Une étape peut être passée, avec une raison.
- Réglages › Membres et droits › « Fin de coach » : le club retire les étapes facultatives (prévenir, remercier, questionnaire, fiches). Remplacement, tâches, clés, droits et clôture restent.

## À la date de fin (tâche quotidienne)

- Ses mandats de coach prennent fin et ses flux d'agenda sont révoqués.
- Ses places de coach dans les équipes se ferment.
- Il passe dans les anciens coachs, avec la raison du départ.
- Une clé encore dehors crée la tâche de suivi habituelle.
- Si une étape bloquante reste ouverte, la personne qui a lancé le départ est prévenue ; les droits sont retirés quand même.
- Un autre rôle (parent, par exemple) reste intact.

## Annuler

Avant la date de fin : le coach reste, les tâches du départ se ferment, rien d'autre ne change.

## Attestation de bénévolat

PDF pour le coach et pour le club : dates de la fonction, heures encadrées et nombre de séances de ses équipes sur les douze derniers mois. Lien sur la carte « Fin de coach ».

## Limites

- L'application ne connaît pas encore le matériel prêté à une personne ni ses notes de frais : ces étapes ne sont pas générées.
- Les heures de l'attestation comptent les séances planifiées de ses équipes pendant qu'il en était coach, pas sa présence réelle.

## Vérification

- `npx vitest run tests/offboarding.test.ts tests/access-matrix.test.ts tests/wave16-vocabulary.test.ts`
- `npm run test:integration` (`tests/integration/offboarding.integration.ts`) :
  - départ démarré par la présidence, refusé au coach et à un autre club ;
  - seules les étapes qui le concernent, avec leurs tâches ;
  - tâches et séances réattribuées d'un coup, remplaçant qui coche l'étape ;
  - questionnaire et fiches réservés au coach, étape passée avec raison ;
  - attestation PDF pour lui, refusée à un autre club et à un autre coach ;
  - date de fin : droits de coach finis, rôle de parent gardé, équipe fermée, ancien coach, présidence prévenue de la clé ;
  - annulation qui ferme les tâches et garde le coach.
- `tests/e2e/offboarding.spec.ts` à 390 px avec axe : bouton, départ préparé, étape passée, réglage.
