# Vague 12 : saison et équipe choisies une fois, page Mes équipes, couleurs d'équipe, finances par équipe (21 octobre 2026)

Migration additive `0031_team_identity_scope.sql` : `team.color` (clé d'une palette fixe : blue, teal, green, amber, coral, plum, slate, sand), `team.staff_contact_id` (personne responsable, du même club), `finance_transaction.team_id`, `dues_plan.team_id` et `finance_budget.team_id` facultatifs (NULL = club entier), tous liés à `team(id, organization_id)`. La clé du budget devient (organisation, saison, sens, catégorie, équipe) grâce à une colonne générée `team_key`.

## Le contexte : saison et équipe

- **Barre du haut** : deux capsules « Saison » et « Équipe », à droite, avant les notifications, pour les profils de club (président, coach, personnes avec des droits ; pas les joueurs ni les parents). La saison en cours est choisie par défaut ; les saisons archivées sont en bas, sous « Archivées ». L'équipe propose « Toutes les équipes » puis les équipes de la saison choisie, chacune avec sa pastille de couleur (grise sans couleur). La capsule équipe n'apparaît pas si la saison n'a qu'une équipe.
- **Coach** : seules les équipes qu'il encadre (équipe du mandat `role_assignment.team_id`, ou équipes où son profil est coach ou assistant). Le serveur applique la même règle à chaque page.
- **Mémoire** : le choix vit dans l'adresse (`?season=ID&team=ID`, donc un lien partagé le garde) et dans le navigateur (`localStorage`, clé `pfm-scope-<organisation>`, lue et écrite dans un `try/catch`). Une valeur invalide (saison d'un autre club, équipe archivée, identifiant mal formé) revient en silence à « saison en cours, toutes les équipes », côté navigateur comme côté serveur (`src/domains/scope`).
- **Puce** sous la barre : « Équipe A · 2026-27 » avec une croix pour revenir à toutes les équipes.
- **Menu profil** : le sélecteur brut de profil quitte la barre du haut. Le coin en bas à gauche du menu (photo et nom) ouvre un petit menu avec le profil actif et le lien vers Mon espace.

## Pages qui suivent le choix

- Joueurs, Gestion du club, Présences, Calendrier, Matchs, Statistiques : leur filtre équipe prend la valeur globale ; si on le change localement, un lien « Appliquer à toute la plateforme » pousse le choix partout.
- Accueil : tâches, chiffres et agenda de l'équipe choisie (documents et cotisations des membres de l'équipe, présences de ses séances, événements de l'équipe et du club entier). Les règles d'accès existantes sont conservées.
- Documents, Transferts, Matériel : filtre indirect par les membres actuels de l'équipe (les fauteuils sans emprunteur restent visibles).
- Cotisations, Déplacements, Levée de fonds : filtre par saison seulement, avec la note « Vue club entière : les montants ne sont pas découpés par équipe » quand une équipe est choisie.
- Finance du club et rapport financier : suivent l'équipe (voir plus bas), donc sans la note.

## Mes équipes

- Page `/teams` dans le groupe Joueurs. En-tête « Mes équipes », sous-titre « Saison 2026-27 · 3 équipes », boutons « Nouvelle équipe » (président et personnes qui gèrent les équipes) et « Préparer la saison suivante » (vers le passage de saison).
- Une carte par équipe (3 colonnes, 2 sous 1200 px, 1 sous 760 px) : pastille et nom, catégorie et niveau, joueurs actifs, présence des 30 derniers jours (registres clôturés), documents manquants ou expirés, prochain événement, coachs (initiales), liens Effectif, Calendrier, Présences ouvrant la page déjà filtrée sur l'équipe.
- Fiche `/teams/[id]` : onglets Effectif (numéro, nom, poste, fauteuil, documents, présence sur 90 jours), Staff, Réglages (nom, catégorie, niveau, lieu, couleur par pastilles, responsable, archiver). Les chiffres réutilisent les calculs des modules présences, documents et matériel ; rien n'est stocké en double.
- Un coach ne voit que ses équipes ; la fiche d'une autre équipe répond « introuvable ».

## Déplacer un joueur

Dans l'effectif et dans la fiche du joueur : « Déplacer vers… » ouvre une fenêtre (équipe de destination, date d'effet, « Garder aussi dans l'équipe actuelle »). Le serveur fait tout dans une transaction : l'affectation actuelle est close la veille de la date d'effet (ou annulée si elle commençait ce jour-là), la nouvelle est créée, une ligne `team.move` est écrite dans `audit_log`. Équipe d'un autre club, d'une autre saison ou identique : refus.

## Couleurs d'équipe

Palette dans `globals.css` (`--team-<couleur>-bg`, `-border`, `-ink`, versions claire et sombre, contraste AA pour le texte). Les événements d'équipe du calendrier prennent le fond et la bordure de leur équipe, les événements du club entier restent neutres ; une légende liste les équipes sous le calendrier. Des puces d'équipe apparaissent dans la liste des joueurs, dans l'agenda de l'accueil et dans le grand livre.

## Finances par équipe

- Opération, ligne de budget et barème de cotisation : champ « Équipe » facultatif, « Club entier » par défaut. Le serveur vérifie que l'équipe appartient au club (et à la saison, pour un barème).
- Finance du club : le grand livre, les chiffres et le budget suivent l'équipe choisie (en haut ou dans la page). Le rapport financier a un filtre équipe et un tableau « Par équipe » avec la ligne « Club entier » séparée.

## Tests

- Unitaires (`tests/wave12.test.ts`) : lecture tolérante de l'adresse, repli sur une valeur invalide, équipe hors de sa saison ou archivée, saison par défaut, club à une seule équipe, couleur hors palette refusée, commande de déplacement, textes FR/NL/EN sans tiret long.
- Intégration (`tests/integration/wave12.integration.ts`) : deux clubs ; un président ne peut ni choisir l'équipe de l'autre club (repli silencieux) ni ouvrir sa fiche ni y déplacer un joueur ; un coach ne voit que ses équipes ; les chiffres et l'agenda de l'accueil changent selon l'équipe ; cartes et fiche ; déplacement atomique (clôture la veille, nouvelle affectation, ligne d'audit, variante « garder ») ; responsable d'un autre club refusé ; opération, budget et barème par équipe, équipe d'un autre club refusée, rapport avec la ligne club entier.
- Bout en bout (`tests/e2e/teams.spec.ts`) : le président choisit « Équipe B » dans la barre, va sur Joueurs puis Calendrier avec le filtre conservé, applique un changement local à toute la plateforme, voit la note club entière sur Cotisations ; crée « Équipe C » en prune, ouvre la fiche d'Équipe A, déplace Emma vers Équipe B, change la couleur en ambre, retrouve la légende du calendrier ; chaque écran passe axe ; largeur 360 px sans débordement.

## Vérification

`npm run check`, `npm run test:integration`, `npm run test:e2e:db`.
