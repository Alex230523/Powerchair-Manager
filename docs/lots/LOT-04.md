# Lot 04 — Inscriptions

## Autorisation, audit et plan

L’utilisateur a validé le lot 03 puis demandé « continue ». Le lot 04 du cahier des charges couvre les formulaires, décisions et listes d’attente ; il dépend des personnes/équipes et du moteur de notifications.

Avant modification : lecture du périmètre détaillé et des consignes du PDF, inspection du dépôt et des règles AGENTS, des services comptes/personnes/notifications, des routes, migrations, tests et en-têtes de sécurité. Fondations existantes : Next.js 16.4.2, React, TypeScript strict, PostgreSQL 18, Better Auth, sept rôles et capacités déléguées, audit transactionnel, file persistante. Les migrations 0000 à 0008 sont conservées. Les références synchronisées sous sources/ restent inchangées. La copie Git locale est encore non commitée ; aucun déploiement ou PR n’est annoncé.

Stack conservée, sans dépendance supplémentaire. Plan annoncé avant codage : formulaires versionnés, candidatures et historique, validation humaine avec MFA, espace candidat, admission sans doublon, affectation facultative et étapes différées pour documents/cotisations. Services, interface puis tests et documentation.

## Modèle et migration

La migration additive 0009 crée :

- registration_form : organisation, saison immuable, champs FR/NL, publication, capacité d’admissions par formulaire et version ;
- registration_application : déposant, candidat, naissance, candidature pour soi ou pour une autre personne, langue, réponses, snapshot du formulaire, état, version, dates et auteur de décision, lien de réinscription et fiche membre admise ;
- registration_history : actions datées, auteur, réponses au candidat et notes internes ;
- registration_attachment : contenu privé PostgreSQL, champ, nom et type ;
- registration_followup : deux intentions uniques par admission, documents et cotisation, en attente de leur module ;
- registration_rate : limite persistante de création par compte.

Les clés étrangères composées bornent formulaire, saison, équipe et fiche au club. Une contrainte interdit deux admissions pour la même fiche et la même saison. Les anciens formulaires sont conservés dans chaque candidature par snapshot ; modifier un formulaire ne change pas les questions déjà proposées dans un dossier.

La capacité registrations.manage est ajoutée aux délégations existantes ; elle appartient au président de club, jamais au président fédéral par défaut. Le type de notification registration_update et la ressource registration étendent le moteur du lot 03.

Appliquer avec `npm run db:migrate`, réexécutable. Sauvegarder et tester une restauration avant une exploitation de production. Pas de migration destructrice ni de rollback supprimant les dossiers. Ne pas modifier 0009 après son application : toute évolution doit faire l’objet d’une migration suivante.

## Autorisations

| Opération | Autorité |
| --- | --- |
| Lire un formulaire publié et son widget | Public, sans données de candidat |
| Préparer, corriger, déposer, compléter ou retirer sa candidature | Compte actif et email vérifié ; aucun mandat de club nécessaire |
| Consulter un dossier candidat | Son déposant ; club uniquement après la première soumission |
| Lire ou remplacer une pièce | Déposant ; remplacement limité à brouillon/incomplet |
| Lire une pièce côté club | Mandat actif dans le club, registrations.manage, MFA ; dossier déjà soumis |
| Créer/publier un formulaire, examiner et décider, écrire une note interne | Mandat actif dans le club, registrations.manage, MFA |
| Administrer un autre club ou déduire des droits familiaux de la candidature | Refusé |

Chaque requête et téléchargement revérifie compte, mandat, périmètre et état. Le contexte d’administration doit correspondre à celui du formulaire. Une candidature pour un enfant n’accorde aucun droit sur son futur dossier privé : le club vérifie séparément les responsabilités et délégations du lot 02. L’admission ne crée pas automatiquement de mandat ou de licence.

Un brouillon, même retiré avant dépôt, reste invisible au club. Il ne produit pas d’alerte ou d’entrée d’audit organisationnelle révélant son auteur ; son historique reste dans l’espace du déposant. Les notes internes ne sont jamais renvoyées à celui-ci.

## Parcours livrés

### Responsable du club

Ouvrir `/fr/registrations` ou `/nl/registrations` après choix du mandat. Créer d’abord une saison dans Personnes et équipes si nécessaire. Le formulaire reçoit titre, présentation, capacité facultative et questions : texte, date, téléphone, choix, pièce, consentement, attestation par nom saisi. Chaque question possède un libellé FR et NL ; les conditions portent sur une réponse textuelle ou un choix précédent. Un aperçu mobile/desktop est disponible.

Le formulaire peut être publié, fermé et modifié avec contrôle de version. Le lien public se partage manuellement. L’intégration proposée est un widget public iframe ouvrant le formulaire sécurisé dans une nouvelle fenêtre ; seuls ce widget et ses informations publiques sont intégrables. Les pages privées et le formulaire de dépôt gardent leur protection contre l’encadrement. Cela évite de dépendre des cookies tiers et d’exposer une décision privée dans une iframe externe.

« Dupliquer pour une nouvelle saison » reprend les questions et leurs identifiants afin de permettre le préremplissage de réinscription ; sélectionner la nouvelle saison, vérifier le contenu puis publier.

Les vues En attente, Acceptées récemment (14 jours), Liste d’attente, Refusées et Historique filtrent les données persistantes. Le responsable peut examiner, demander un complément avec motif, placer en attente, refuser avec motif ou admettre. Les réponses sont conservées dans l’espace sécurisé et signalées au déposant par un email générique FR/NL. Les notes sont réservées aux responsables.

### Candidat ou représentant

Le lien public expose la présentation et un aperçu sans compte. Pour préparer et déposer : se connecter et vérifier son email, puis renseigner nom, naissance et le fait de candidater pour soi si applicable. Aucun MFA ni compte parent supplémentaire n’est exigé d’un joueur autonome.

Le dossier apparaît dans `/fr/registrations/mine` ou `/nl/registrations/mine`. Enregistrer les réponses avant de déposer une pièce ou de soumettre. L’identité du brouillon est corrigeable avant dépôt ; après demande de complément, les réponses et pièces peuvent être mises à jour. L’espace candidat conserve l’historique et la réponse du club. Le retrait est possible avant admission/refus ; il est terminal dans cette version.

La réinscription sélectionne une ancienne candidature acceptée du même déposant et club, d’une autre saison. Les coordonnées sont confirmées, les réponses ordinaires ayant les mêmes identifiants sont reprises ; consentements, attestations et pièces doivent être renouvelés. La candidature précédente et son admission ne sont pas effacées. Le rapprochement d’identité d’une réinscription ne peut pas être remplacé par une autre personne.

### Admission

Les admissions d’un même club sont sérialisées. Si la capacité du formulaire est atteinte, l’acceptation est refusée et la liste d’attente reste disponible. La capacité s’applique à la campagne du formulaire, pas à toutes les équipes du club.

Une correspondance nom/naissance exige la sélection explicite de la fiche ; les différences de nom nécessitent une confirmation humaine, une naissance différente est refusée. La fiche d’un joueur transféré doit suivre la procédure de transfert. Une réinscription reprend la fiche précédente. Une candidature pour soi réutilise l’identité permanente liée au compte ; pour un enfant sans identité reconnue, une identité sans connexion est créée. Aucun rapprochement global entre clubs ne divulgue d’anciennes informations privées.

La création/réactivation de la fiche, l’affectation facultative à une équipe de la même saison, la décision, l’audit, les intentions de suivi et la notification partagent une transaction. Une erreur d’équipe, d’identité, de capacité ou de doublon annule toute cette admission. Les répétitions de création d’un même brouillon renvoient le dossier existant ; les actions portant une ancienne version sont refusées.

Les étapes documents et cotisation sont des intentions persistantes en état awaiting_module : aucun document n’est déclaré validé, aucune créance n’est calculée et aucun paiement n’est demandé. Les lots 05 et 08 devront consommer ces intentions de manière idempotente.

## Fichiers, protection et exploitation

Les fichiers sont limités à PDF/PNG/JPEG, 2 Mo par champ. Type et signature binaire sont vérifiés. Ils restent en base, sans URL publique, et se téléchargent comme pièces jointes avec absence de cache et en-têtes de confinement. Les pièces des champs devenus invisibles sont retirées lors de la soumission pour éviter un partage involontaire.

Ce contrôle de format ne remplace pas une analyse antivirus ni une validation humaine. Ne pas demander de diagnostics médicaux dans ce formulaire généraliste. Le module documents devra distinguer dépôt, validation et accès sensibles. Stockage objet, quotas globaux, analyse de contenu, conservation et purge automatisée restent à préparer avant production. Sauvegarder aussi ces tables : les pièces ne sont pas des fichiers du répertoire de développement.

Contre les dépôts automatisés : compte vérifié, protection d’origine, champ leurre, corps de requête borné en lecture et maximum 20 préparations par compte/heure. Cela n’est pas une protection complète contre une attaque distribuée. Une soumission réellement anonyme n’est pas livrée : c’est un choix explicite du pilote pour identifier le déposant et sécuriser son suivi.

Les emails utilisent le moteur persistant du lot 03, sans information de naissance, pièce ou motif dans l’aperçu. Les mises à jour de candidature sont classées comme messages de sécurité du dossier et restent actives ; la pause explicite du club est respectée. Le destinataire est revérifié même s’il n’est pas encore membre du club. En local, conserver `npm run mail:worker` ouvert : les emails sont capturés dans `.local/mail/`, sans envoi externe.

## Limites et décisions ouvertes

Les listes sont bornées aux 200 derniers dossiers côté club, 100 côté candidat ; la limite est annoncée. Pas de recherche serveur paginée dans ce lot. Les titres et présentations sont rédigés par le club ; les libellés de questions et l’interface sont FR/NL. Une attestation par nom saisi ne constitue pas une signature électronique certifiée. Aucun fournisseur de signature ni contrôle automatique de responsabilité légale n’est annoncé.

La fermeture empêche les nouveaux brouillons et les soumissions ; les dossiers déjà soumis restent traitables. Les décisions finales ne s’annulent pas par un bouton : une correction administrative ultérieure doit être conçue et historisée. Le préremplissage porte uniquement sur les anciennes candidatures du même déposant ; il ne donne pas accès à des dossiers privés créés autrement.

Préproduction distante, délivrabilité réelle, tests manuels de lecteurs d’écran et politique de conservation ne sont pas validés. Le lot 05 attend la validation explicite de ce lot 04.
