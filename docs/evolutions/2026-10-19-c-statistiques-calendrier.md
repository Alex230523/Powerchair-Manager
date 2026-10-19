# Calendrier simplifié et statistiques de présences

## Livraison

Le calendrier ouvre désormais la vue mois. La grille affiche les événements directement dans les jours et propose un bouton d’ajout par jour. La vue semaine présente sept colonnes et la liste reste disponible. Les événements de plusieurs jours apparaissent sur chaque journée concernée. Les contrôles de navigation sont regroupés. Les formulaires de création, lieux et abonnement sont ouverts à la demande. Cliquer sur un événement ouvre son détail ; la modification est une action distincte.

Le champ de fuseau et la ligne de fuseau technique ont été supprimés. La saisie utilise l’heure de Bruxelles. Les événements existants sont affichés et édités dans cette heure à partir de leurs instants enregistrés, sans changer silencieusement leur horaire. Les horaires inexistants ou ambigus lors des changements d’heure restent refusés : choisir un autre horaire.

Une page `/fr/statistics` (également NL/EN), accessible dans la navigation, affiche : événements, registres clôturés, personnes convoquées, réponses, assiduité, évolution mensuelle, participations, absences, retards et départs anticipés. Filtres par période, équipe, type et raccourci saison. Export CSV du détail filtré avec protection contre les formules.

## Calculs et droits

Les statistiques réutilisent exclusivement les événements et invitations autorisés par le service de présences. Il n’existe pas de nouvelle permission contournant ce service. Un parent/joueur ne voit que ses données autorisées ; les responsables voient leur périmètre. Les chiffres sont donc ceux du périmètre consultable, pas nécessairement ceux de tout le club.

- Convocations : invitations non retirées, événements non annulés.
- Réponses : réponse différente de « sans réponse ».
- Assiduité : participations constatées divisées par les convocations actives des registres clôturés. Présent, retard et départ anticipé comptent comme participation.
- Une déclaration « présent » ne devient jamais automatiquement une présence constatée.
- Pas de dénominateur : « — », sans taux fictif.
- Mois : date locale de début de l’événement.
- Limite existante de 500 événements : avertissement explicite, export désactivé, réduction de période demandée.

Pas de migration de base nécessaire. Pas encore de statistiques de buts, résultats ou classement : elles dépendent des matchs officiels, non livrés. Aucun changement de mot de passe, email ou suspension MFA.

## Recette

`npm run check` : lint, TypeScript et 36 tests unitaires, dont calculs de taux, annulations, retraits, pointages indépendants, retards, filtres, mois de Bruxelles et CSV.

`npm run test:e2e:db -- calendar.spec.ts attendance.spec.ts` : tests sur base temporaire, navigation mois/semaine/liste, création/modification sans champ de fuseau, formulaires repliés, présences et statistiques réelles, filtre de type, téléchargement CSV, FR/NL/EN et contrôles axe/mobile.

Pour lancer : `npm run dev -- --hostname 127.0.0.1`, puis `/fr/calendar` ou `/fr/statistics`.

Résultat : 36 tests unitaires et les 2 parcours navigateur ciblés réussis, compilation de production réussie, captures mois/statistiques inspectées. Pages locales calendrier/statistiques vérifiées HTTP 200. Aucune migration requise.
