# Lot 02 — Personnes, familles, équipes et saisons

## Validation et audit préalables

Le 18 octobre 2026, l’utilisateur a validé le lot 01 (« Version validé continue »).
Le dépôt a été relu avant modification : comptes Better Auth, mandats multiples,
contexte par session, migrations 0000–0004 et tests du lot 01. Person était alors
uniquement une identité de compte ; aucune fiche de club, famille, équipe ou saison
n’existait. Aucun fichier sous sources/ ni instruction synchronisée n’a été modifié.
Les guides Next.js correspondant à la version installée ont été consultés.
Le lot 03 reste soumis à validation explicite après recette du lot 02.

## Périmètre et choix

Le lot technique 02 de la feuille de route couvre identités, familles, équipes et
saisons. Il ne termine pas d’un seul coup tous les modules fonctionnels 02 et 04
qui dépendent aussi des documents, notifications, planning et compétitions.
Le répertoire ne montre aucun document, cotisation, licence, match ou classification
factice. Photos et pièces justificatives attendent le stockage privé du lot 05.
Aucune donnée médicale, diagnostic ou classification officielle n’est collectée.

## Modèle et migrations

- Person : identité globale, liée facultativement à un compte unique. Le lot 01
  est conservé : préférences et sessions continuent à utiliser la même identité.
- ClubPerson : fiche privée d’un club, avec nom, naissance facultative, email et
  téléphone locaux, date d’entrée historique, statut et version d’édition.
- Season : nom, dates et archivage propres au club.
- Team : saison, nom, catégorie, niveau, lieu habituel et archivage.
- TeamMembership : affectation joueur/coach/assistant/bénévole, poste, période,
  clôture immédiate et historique. Une clôture ne supprime aucun enregistrement.
- GuardianRelationship : représentant, personne accompagnée, type du lien,
  consultation/modification, dates et référence de l’autorisation contrôlée.
- PersonTransfer : code aléatoire à usage unique, empreinte, durée de 7 jours,
  auteur, accord vérifié, club source et club destinataire après acceptation.
- RoleAssignment.team_id : périmètre d’un mandat de coach dans le même club.

0005 crée ces entités et les droits du lot 02 ; 0006 distingue la clôture immédiate
et les dates historiques ; 0007 ajoute une permission d’export distincte.
Les clés étrangères composites refusent les associations entre clubs différents.
Les anciennes migrations n’ont pas été réécrites. Le migrateur versionné reste
transactionnel avec empreintes et verrou d’exécution.

Le nom et la date de naissance déclenchent une détection de doublon dans le club,
sans recherche globale révélant les personnes d’autres clubs. Deux homonymes avec
naissance inconnue, ou mêmes nom/date, nécessitent une revue d’identité ; aucune
fusion automatique ni contournement implicite n’est proposé. Une personne déjà
liée à un compte reste unique dans chaque club. L’association tardive d’un compte
conserve l’identifiant de la fiche et son historique ; une identité hors connexion
déjà partagée entre clubs nécessite une vérification manuelle avant association.

## Autorisations effectives

| Contexte                  | Consultation                                         | Modification                                                 |
| ------------------------- | ---------------------------------------------------- | ------------------------------------------------------------ |
| Président de club         | Répertoire et historique de son club                 | Personnes, familles, équipes, saisons et transferts          |
| Délégataire people.read   | Fiches privées de son club                           | Aucune sans droit complémentaire                             |
| Délégataire people.manage | Fiches et relations de son club                      | Personnes et familles                                        |
| Délégataire teams.manage  | Équipes et identités minimales                       | Saisons, équipes, affectations et périmètre des coachs       |
| Coach                     | Ses équipes actuelles ; noms/postes des participants | Ses coordonnées s’il est adulte ; pas celles des coéquipiers |
| Joueur                    | Sa fiche active et son historique dans le club       | Ses coordonnées s’il est adulte                              |
| Parent/représentant       | Sa fiche et les personnes explicitement autorisées   | Coordonnées autorisées uniquement                            |
| Fédération                | Aucun accès à ce répertoire privé                    | Aucun                                                        |

Une consultation de répertoire, un accès coach et les opérations de gestion
exigent MFA ; tous les accès exigent une adresse vérifiée, une session valide et
un mandat courant. Les droits du parent/joueur ne nécessitent pas MFA dans ce lot.
Les délégations sont explicites ; aucun huitième rôle n’a été ajouté.
L’export exige people.export et people.read ou people.manage, avec MFA.

Le coach consulte les équipes indiquées par son mandat, ou, à défaut, celles où
il est affecté comme coach/assistant. Le périmètre explicite ne fusionne pas les
autres affectations. Les coordonnées et naissances des coéquipiers sont supprimées
de la réponse serveur, et les filtres d’âge/ancienneté leur sont interdits pour
éviter une déduction indirecte. Un coach peut être affecté à plusieurs équipes.

Le lien « déclaré » ne donne aucun droit. Un lien légal vérifié exige un adulte
représentant, une naissance connue et une référence de contrôle ; les droits sont
réévalués et s’arrêtent à 18 ans. L’accompagnement d’un adulte passe par un accès
délégué explicite et une date de fin. L’âge de 18 ans est le seuil de conception
retenu pour le pilote ; les situations de représentation particulières doivent
être qualifiées par le club avant d’accorder les droits. Aucun justificatif n’est
prétendu vérifié automatiquement : le responsable consigne la référence de son
contrôle, les pièces étant hors périmètre de ce lot.

Toutes les lectures et actions relisent les droits en base sous verrou du club.
Les formulaires et exports portent le club affiché : une action est refusée si
le contexte a changé dans un autre onglet. Les versions des fiches empêchent
l’écrasement d’une modification concurrente. Les actions sensibles sont journalisées.

## Parcours utilisables

Créer et modifier une fiche, l’associer à un compte actif vérifié du club,
rechercher et filtrer par nom, statut, équipe, saison, fonction, âge et date
historique d’entrée, ouvrir l’historique, archiver, réactiver et exporter le résultat.
L’ancienneté se réfère à la date d’entrée déclarée du club, pas à la création du compte.

Créer, modifier et archiver les saisons/équipes ; affecter les personnes avec
fonction et dates ; terminer une affectation ; définir les périmètres des coachs.
Les changements de saison sont refusés s’ils rendraient les affectations historiques
incohérentes. Disponibilités, remplacements événementiels, formations et rappels
attendent leurs modules sources ; aucun planning fictif n’est affiché.

Enregistrer plusieurs représentants par personne et plusieurs personnes par adulte,
distinguer consultation et édition, révoquer les droits et accompagner un adulte
avec une autorisation datée. Les coordonnées modifiées ne changent jamais l’adresse
de connexion Better Auth : identité d’accès et contact du club sont distincts.

Préparer un transfert après vérification de l’accord ; transmettre manuellement le
code au responsable du nouveau club. Son acceptation copie seulement identité et
coordonnées minimales, conserve l’identité globale, clôture l’ancien dossier et les
affectations, révoque les liens familiaux du club source et le mandat joueur source.
Un nouveau mandat joueur est créé dans le club destinataire pour un compte lié.
Les autres mandats légitimes de cette personne restent distincts. Un retour au club
réutilise sa fiche historique ; aucun ancien lien familial ou roster n’est réactivé.
L’autorité de l’émetteur est revérifiée au moment de l’acceptation.

Le code n’est pas un accès public au dossier : il faut un administrateur autorisé
dans un autre club, avec MFA. Les deux clubs sont verrouillés dans un ordre stable
et la consommation est transactionnelle. Les dossiers, notes d’autorisation,
relations et historiques privés du club source ne sont pas copiés.

L’export CSV utilise uniquement les filtres et données autorisés, cite les équipes
visibles et protège les cellules contre l’exécution de formules dans un tableur.
Il ne contient pas les références d’autorisation familiale ni les secrets de compte.

## Recette et exploitation

Les scénarios réalisés figurent dans VERIFICATION-02.md. Les commandes du README
sont inchangées : check, test:integration et test:e2e:db ; les migrations s’appliquent
par db:migrate. Les données du club pilote restent vides tant que des personnes
réelles n’ont pas été saisies. Aucun faux joueur ni équipe de démonstration n’a été
ajouté à Club pilote ; les données de recette sont confinées aux bases temporaires.

Avant production : fournisseur email transactionnel, préproduction, sauvegarde et
restauration, revue humaine d’accessibilité et des cas particuliers de représentation.
Les limites d’exploitation du lot 01 restent valables. Aucun lot suivant engagé.
