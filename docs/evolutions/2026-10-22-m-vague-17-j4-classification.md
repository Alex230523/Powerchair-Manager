# Vague 17, J4 : journées de classification (22 octobre 2026)

Revue du 21 octobre, point J4.

## Libellés
- « Non définie » partout où la classification manque ou vaut `not_classified` (fiche joueur, licences, statistiques, listes de la fédération).
- « En attente » pour `pending`.

## Badge PF1 et PF2
`ClassificationBadge` (`src/components/classification-badge.tsx`) affiche la classification partout où elle apparaît. Sur PF1 et PF2, une info-bulle s'ouvre au survol ou au focus clavier et se ferme avec Échap (le composant `Tip`, sorti de `match-line.tsx` dans `tip.tsx`).

Le texte vient de la fédération du membre, en français, néerlandais et anglais (`organization.classification_texts`, lu par `/api/classification/texts`). Tant qu'elle n'a rien écrit :
- PF1 : « Joueur dont le handicap limite le plus la conduite du fauteuil et le jeu. »
- PF2 : « Joueur moins limité ; le règlement limite le nombre de PF2 en même temps sur le terrain. »

La fédération modifie ces textes sous Licences et classifications › Journées de classification › « Textes PF1 et PF2 ».

## Journées de classification
Migration `0060` (ajouts seulement) :
- `classification_session` : la journée (date, lieu partagé ou texte, date limite d'inscription, informations, statut ouverte, publiée ou annulée) ;
- `classification_session_club` : les clubs invités ;
- `classification_session_classifier` : les classificateurs ;
- `classification_session_player` : les inscrits (présence, décision PF1, PF2 ou À revoir, commentaire).

Domaine `src/domains/classification`, route `/api/classification`.

Déroulé :
1. La fédération (président ou permanent) crée la journée sous Licences et classifications : date, date limite (d'aujourd'hui au jour même), lieu, clubs invités, classificateurs choisis parmi ses arbitres et ses membres. Les présidents des clubs invités sont prévenus.
2. Chaque club invité inscrit ses joueurs depuis sa page Licences, jusqu'à la date limite incluse, et peut en désinscrire. Il ne voit que ses propres inscrits, et les décisions seulement une fois publiées. Un club non invité ne voit pas la journée.
3. Le jour venu, la fédération ou un classificateur nommé pour cette journée (depuis son espace arbitre) pointe chaque inscrit présent ou absent et décide PF1, PF2 ou À revoir, avec un commentaire.
4. La fédération publie quand tout est pointé et décidé. Pour chaque joueur décidé :
   - PF1 ou PF2 : profil sportif validé avec cette classification ;
   - À revoir : classification inchangée, statut refusé, note « À revoir » (ou le commentaire) ;
   - l'historique suit par le déclencheur de la migration 0050 ;
   - une ligne dans le journal (`classification.session.decision`) ;
   - le président du club, les coachs de ses équipes en cours et le joueur ou ses parents (avec un compte) sont prévenus.
   Un absent ne change pas.
5. Une journée ouverte peut être annulée ; les clubs invités sont prévenus.

## Joueurs des équipes pour la fédération
Fédération › Équipes : un filtre par club et, sur chaque équipe, « Voir les joueurs » avec le nom, la classification, la licence de la saison et la catégorie d'âge. Uniquement des informations sportives : ni coordonnées, ni santé, ni cotisations.

## Tests
- Unitaires (`tests/wave17-classification.test.ts`) : libellés, textes par défaut, dates et fenêtre d'inscription, conditions de publication, effet d'une décision, commandes, textes en trois langues.
- Intégration (`tests/integration/wave17-classification.integration.ts`, deux clubs invités, un club non invité, une autre fédération) :
  - seule la fédération crée, pour ses clubs ;
  - chaque club n'inscrit que ses joueurs, jusqu'à la date limite ;
  - seul le classificateur nommé pointe ;
  - la publication met à jour profils, historique et journal et prévient les bonnes personnes ;
  - les textes de la fédération ;
  - les joueurs des équipes, informations sportives seulement.
- Bout en bout (`tests/e2e/classification-days.spec.ts`) : textes, création, inscription, décision, publication, info-bulle au clavier, joueurs des équipes, axe et 390 px.
