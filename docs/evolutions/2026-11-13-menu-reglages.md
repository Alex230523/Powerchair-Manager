# Un menu et des réglages mieux rangés

Retour du 13/11/2026 : « retrie le menu à gauche pour qu'il soit mieux organisé, il y a beaucoup et ça part dans tous les sens, et même chose pour les réglages ».

## Le menu

Un seul ordre pour tous les profils d'un club (président, coach, trésorier…), chaque entrée suivant toujours les droits du profil. L'ordre suit la journée :

| Groupe | Entrées |
| --- | --- |
| Agenda | Calendrier, Tâches, Déplacements, Événements ouverts, Lieux |
| Sport | Mes équipes, Présences, Matchs, Tournois, Fiches exercices, Statistiques |
| Personnes | Joueurs, Coachs, Inscriptions, Carnet de contacts |
| Communication | Communication, Documents, Page publique |
| Finances | Finances, Cotisations, Subsides & sponsors, Levée de fonds |
| Club | Vie de l'ASBL, Matériel |
| Fédération | Fédération, Classification, Bourse aux transferts |

Avant, le président avait neuf entrées sous « Équipes » (dont la classification et les transferts), le coach trois groupes aux noms différents, les tâches et le carnet de contacts sous « Club ». Un coach voit désormais « Présences » même sans droit particulier : il prend l'appel des équipes qu'il entraîne.

- **Joueur, parent** : Mon espace (Ma famille, Ma fiche, Calendrier, Tâches), Au club (Documents, Cotisations, Inscriptions, Levée de fonds), Compétitions (Tournois, Bourse aux transferts, Fédération). Avant : dix entrées dans un seul groupe.
- **Fédération** : Agenda (Calendrier, Tâches, Circulaires, Documents, Lieux), Clubs et licences, Compétitions, Formation, Administration (Équipe fédérale, Finances, Subsides & sponsors, Vie de l'ASBL). Avant : vingt et une entrées dans un seul groupe.
- **Arbitre** : inchangé, son espace d'abord.

## Les réglages

L'accueil des réglages tient en quatre parties, reprises dans la colonne de gauche des sous-pages :

- **Vous** : Mon compte, Notifications et résumé, Mes données personnelles.
- **Le club** : Identité et apparence, Fonctionnement, Membres et droits, Saisons et équipes, Abonnement à la plateforme.
- **Activités et argent** : Activités, Documents, Finances.
- **Contrôle** : Sécurité et confidentialité.

« Club » était une longue page de onze cartes. Elle est coupée en deux : **Identité et apparence** (nom, logo, contact, couleurs, palmarès) et **Fonctionnement** (premiers pas, modules, obligations de l'année, règles des statuts, transmission de la présidence). L'agrément fiscal et la signature des attestations rejoignent **Finances** ; « Sécurité et données » (contrat, export, fermeture, conservation, doublons) et les données personnelles du club rejoignent les journaux sous **Sécurité et confidentialité**. « Mes données personnelles » ne garde que ce qui vous concerne.

Les anciens liens (une notification déjà reçue, un favori) vers une section déplacée mènent à sa nouvelle place.

## Tests

- `tests/wave14.test.ts`, `tests/wave15-settings.test.ts`, `tests/wave16-federation.test.ts`, `tests/wave15-bottom-nav.test.ts` : le nouvel ordre, chaque page une seule fois, les droits.
- `tests/e2e/settings.spec.ts` : douze catégories en quatre parties, un ancien lien redirigé ; les parcours qui passaient par « Club » vont à la nouvelle place.
