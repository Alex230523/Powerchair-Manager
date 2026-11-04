# 15. Accueil par rôle (02/11/2026)

L'accueil garde « À faire », les chiffres clés, l'agenda et les échéances. Il ajoute une partie propre au profil choisi dans la barre du haut, calculée avec les données existantes (`src/domains/dashboard/focus.ts`, champ `focus` du tableau de bord) :

- **Joueur et parent** : un bloc par personne (soi et chaque enfant, quatre au plus).
  - Le prochain rendez-vous où la personne est attendue : date, lieu, réponse donnée, boutons « Présent » et « Absent » tant que les réponses sont ouvertes.
  - Les trois derniers résultats de son équipe.
- **Coach** : une carte par équipe suivie (trois au plus).
  - Le prochain entraînement et le prochain match, avec « N réponses sur M, P présents ».
  - Le jour même : « Faire l'appel » et « Ouvrir le match ».
- **Fédération** : clubs en retard d'affiliation, ce qui attend sa validation (lieux proposés au répertoire, modèles de fauteuil), prochaines journées de classification et de tournoi.
- **Président et trésorier** : inchangés (« À faire » en cases, argent, chiffres clés de même taille depuis le lot 1). « À faire » est limité à cinq lignes.

Chaque carte a un titre, une liste courte et son lien (« Voir tout », « Voir le calendrier »). Une carte vide dit « Rien de prévu » ou « Rien à faire, tout est en ordre ».

Limite : le montant « Disponible » (trésorerie moins fonds réservés) viendra avec les fonds réservés (point 9).

## Vérification

- `npx vitest run tests/t15-home.test.ts`
- `npm run test:integration` (`tests/integration/t15-home.integration.ts` : parent de deux enfants, coach sans match à venir et sans argent, fédération, deux clubs)
