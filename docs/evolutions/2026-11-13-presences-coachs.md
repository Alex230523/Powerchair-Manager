# Présences : les coachs donnent aussi la leur

Demande du 12/11/2026 : « Les coachs doivent aussi mettre leurs présences aux entraînements ».

## Ce qui existait

Les coachs d'une équipe (coach, assistant) étaient déjà invités avec elle à chaque séance, mais leur ligne se perdait au milieu des joueurs : pour répondre, un coach devait ouvrir la séance dans « Saison » et chercher son nom. Leur accueil ne montrait que les réponses de l'équipe, sans bouton pour eux-mêmes. Et un coach « présent » comptait comme un joueur : dans le minimum de la séance, dans les réponses affichées sur l'accueil et dans les statistiques.

## Ce qui change

- **Accueil du coach** : sous le prochain entraînement et le prochain match de chaque équipe, « Ma présence » avec « Présent » et « Absent », comme pour les joueurs. Les réponses comptées sont celles des joueurs ; une ligne discrète donne « Coachs : 1 présent sur 2 ».
- **Page Présences** : en haut, « Mes prochaines séances » (trois semaines) avec Présent, Absent ou Incertain d'un clic, pour toute personne invitée elle-même (coach, joueur adulte, bénévole). Les lignes d'un enfant restent sur l'accueil du parent.
- **Appel** : les joueurs d'abord, puis un groupe « Coachs ». Le coach se pointe lui-même comme ses joueurs ; « Tout présent » vaut pour tout le monde.
- **Saison** : dans le détail d'une séance, les coachs viennent après les joueurs, sous « Coachs ».
- **Statistiques** : les cartes des joueurs ne comptent que les joueurs ; « Présences des coachs » donne celles de l'encadrement, à part.
- **Minimum de la séance** : il compte les joueurs présents. Un coach présent ne compense jamais un joueur manquant ; l'alerte part comme avant.

## Qui est « coach » pour une séance

Une personne invitée est comptée dans l'encadrement quand, le jour de la séance, elle est coach, assistante ou bénévole de l'équipe de la séance. Pour une séance sans équipe, quand l'annuaire la dit coach et pas joueuse. Un joueur qui entraîne aussi une autre équipe reste joueur dans la sienne. La même règle sert au calendrier (les réponses affichées sur une séance comptaient déjà les joueurs seuls, les assistants y étaient comptés comme joueurs : corrigé).

## Droits

Rien de nouveau : un coach répond pour lui-même, jamais pour un joueur (refusé, testé) ; il prend l'appel des équipes qu'il entraîne. Un autre club ne voit ni ne touche rien (testé).

## Tests

- `tests/coach-attendance.test.ts` : l'appel en deux groupes, les taux séparés, « Mes prochaines séances », les mots dans les trois langues.
- `tests/integration/coach-attendance.integration.ts` (deux clubs) : invitation avec l'équipe, réponse pour soi, refus pour un joueur et depuis un autre club, accueil du coach, minimum sans les coachs, statistiques séparées.
- `tests/e2e/coach-attendance.spec.ts` : accueil, « Mes prochaines séances », appel avec « Coachs », 390 px, axe.
