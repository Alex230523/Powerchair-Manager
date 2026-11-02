# Guide d’installation locale et des modules

> Historique détaillé, module par module, des lots 00 à 08 et des évolutions du 19 octobre 2026. Pour démarrer vite, voir le [README](../README.md).

Lots 00 à 08 validés. Le lot 08 ajoute les cotisations (barèmes, créances et échéanciers), les profils enregistrés, la navigation latérale et l’anglais. Les paiements et le rapprochement bancaire du lot 09 attendent une nouvelle validation.

## Configuration et lancement

Node 22 et npm. Depuis ce dossier :

```sh
npm ci
cp .env.example .env.local
node --input-type=module -e "import fs from 'node:fs';import {randomBytes} from 'node:crypto';fs.appendFileSync('.env.local','\nBETTER_AUTH_SECRET='+randomBytes(48).toString('hex')+'\n');"
```

Conserver .env.local hors Git. Si le fichier existe déjà, ne pas l’écraser et
ne pas régénérer son secret : il sert aussi au chiffrement des secrets MFA et des emails en attente.

Démarrer PostgreSQL dans un premier terminal (données persistantes dans .local/) :

```sh
npm run db:local
```

Alternative : `docker compose up -d --wait` avec PostgreSQL 18. Ne pas lancer
les deux bases sur le même port. Le PostgreSQL embarqué est réservé au développement.

Dans un second terminal :

```sh
npm run db:migrate
npm run db:test
npm run dev -- --hostname 127.0.0.1
```

Ouvrir http://127.0.0.1:3000/fr/access (ou /nl/access, /en/access).
Utiliser la même adresse que BETTER_AUTH_URL, notamment 127.0.0.1 plutôt que localhost.
Le répertoire du club se trouve à http://127.0.0.1:3000/fr/club, après sélection du profil.
La vérification email a été retirée à votre demande. La double authentification a aussi été retirée (21/10/2026) : connexion par email et mot de passe uniquement.
L’accueil affiche le tableau de bord du profil actif (ou une présentation si l’on n’est pas connecté).

Dans un troisième terminal, démarrer le traitement local des emails :

```sh
npm run mail:worker
```

Laisser ce terminal ouvert. Les emails restent dans la boîte privée `.local/mail/`.
Les notifications se trouvent à http://127.0.0.1:3000/fr/notifications.
Le transport SMTP est fourni mais aucun envoi externe n’a été activé.
Voir [le fonctionnement et les limites](lots/LOT-03.md).

## Ouvrir les inscriptions

Après sélection du mandat Club pilote, ouvrir http://127.0.0.1:3000/fr/registrations.
Créer une saison dans Personnes et équipes si aucune n’existe, puis créer et publier
un formulaire. Son lien public est affiché dans la liste des formulaires. Les
candidats se connectent avec un compte actif et suivent leur dossier dans
http://127.0.0.1:3000/fr/registrations/mine. Les décisions du club restent soumises aux droits du mandat.

Les admissions sont désormais reliées au suivi documentaire. Les cotisations
restent au lot 08. Aucun email externe n’est envoyé en mode local.

## Documents et échéances

Ouvrir http://127.0.0.1:3000/fr/documents après sélection du profil.
Les responsables peuvent demander des pièces, configurer les règles, vérifier
les dépôts et partager explicitement une version validée avec une fédération.
Les pièces d’aptitude exigent une habilitation sensible explicite pour le personnel.

Dans un quatrième terminal, laisser le contrôle des échéances démarré :

```sh
npm run docs:worker
# Ou un seul passage :
npm run docs:worker -- --once
```

Garder aussi le worker email en mode local. Ne pas régénérer BETTER_AUTH_SECRET :
il protège désormais aussi les fichiers chiffrés.

## Calendrier

Ouvrir http://127.0.0.1:3000/fr/calendar après choix du mandat.
Créer un lieu, puis un événement ou une série. Un coach habilité peut planifier
pour son équipe autorisée. Les flux ICS privés se créent et se révoquent depuis
cette page ; ils sont testés localement, sans connexion à un calendrier cloud.
Les invitations et réponses sont disponibles dans le lot 07.

## Créer la première organisation

```sh
npm run admin:bootstrap
```

Saisir email, nom de la personne, organisation, contact et type club/federation.
Cette commande crée le président sans afficher de mot de passe et prépare un lien
privé de récupération pour définir son mot de passe. Le worker local écrit ce lien
dans .local/mail. Aucun email de vérification n’est demandé ni envoyé.
Ouvrir le lien de récupération, définir le mot de passe et se connecter.
Les liens expirent ; une nouvelle récupération est possible depuis l’écran d’accès.
Ne pas relancer la création pour obtenir un nouveau lien : cela créerait un autre club.

Dans l’espace : choisir un mandat et
conserver les codes de secours, puis inviter les membres. Le destinataire doit
avoir créé un compte avec la même adresse email et posséder le lien avant d’accepter.
Les invitations sont affichées comme liens à transmettre manuellement.

Activation/désactivation globale par opérateur :

```sh
npm run admin:account -- personne@example.org deactivate
npm run admin:account -- personne@example.org activate
```

Le dernier président permanent ne peut pas être désactivé. L’administrateur d’un
club dispose aussi de la désactivation limitée à son club dans l’interface.

## Vérifier

```sh
npm run check
npm run db:migrate
npm run db:migrate
npm run db:test
npm run test:integration
npx playwright install chromium
npm run test:e2e:db
# Parcours inscriptions seul, toujours sur une base isolée :
npm run test:e2e:db -- registrations.spec.ts
```

Les tests d’intégration utilisent un schéma aléatoire, supprimé ensuite. Les E2E
créent une base aléatoire dédiée, utilisent le port 3100 et la suppriment ensuite.
Ils ne modifient pas Club pilote ou les données de développement. Le compte de test
PostgreSQL doit pouvoir créer schémas et bases. `npm run test:e2e` sans base dédiée
ne lance que les contrôles de fondation/accessibilité et saute le parcours persistant.

La CI PostgreSQL 18 est dans [.github/workflows/ci.yml](../.github/workflows/ci.yml) et s’exécute à chaque pull request. Le serveur de production se lance par
`npm run build` puis `npm start` ; il faut d’abord configurer un fournisseur email
pour un usage de production. Aucun hébergement n’est provisionné.

## Documentation

- [Audit et recette du lot 00](lots/LOT-00.md)
- [Rapport historique du lot 00](recette/VERIFICATION-00.md)
- [Architecture, droits et limites du lot 01](lots/LOT-01.md)
- [Rapport de recette du lot 01](recette/VERIFICATION-01.md)
- [Architecture et droits du lot 02](lots/LOT-02.md)
- [Rapport de recette du lot 02](recette/VERIFICATION-02.md)

- [Architecture, exploitation et limites du lot 03](lots/LOT-03.md)
- [Rapport de recette du lot 03](recette/VERIFICATION-03.md)

- [Architecture, usage et limites du lot 04](lots/LOT-04.md)
- [Rapport de recette du lot 04](recette/VERIFICATION-04.md)

- [Architecture, droits et limites du lot 05](lots/LOT-05.md)
- [Rapport de recette du lot 05](recette/VERIFICATION-05.md)

Les rapports antérieurs conservent la politique historique de vérification email,
remplacée par le lot 05.

- [Architecture, droits et limites du lot 06](lots/LOT-06.md)
- [Rapport de recette du lot 06](recette/VERIFICATION-06.md)

Le lot 07 a été validé.

## Lot 07 — Invitations et présences

Ouvrir http://127.0.0.1:3000/fr/attendance. Choisir un événement futur, les participants à inviter, une échéance et éventuellement un seuil minimum. Les personnes répondent dans ce même espace ; le coach pointe à partir du début de l’événement puis clôture le registre. Réponse et présence constatée restent distinctes.

Démarrer les relances automatiques dans un terminal supplémentaire :

```bash
npm run attendance:worker
# Ou un seul passage :
npm run attendance:worker -- --once
```

Les notifications passent par le worker email existant. Garder le transport local pour la recette.

La double authentification a été retirée le 21/10/2026 : il n’y a plus de réglage à prévoir. Les droits d’organisation, de rôle, de famille et sur les documents restent contrôlés.

- [Périmètre, décisions et limites du lot 07](lots/LOT-07.md)
- [Rapport de recette du lot 07](recette/VERIFICATION-07.md)

## Lot 08 — Cotisations, profils et langues

Ouvrir http://127.0.0.1:3000/fr/dues. Créer d’abord une saison et les personnes du club si nécessaire. Créer un barème, puis une créance et son échéancier ; aucune donnée de démonstration n’est ajoutée à Club pilote.

Dans Mon espace, enregistrer un nom de profil et éventuellement le définir par défaut. Le menu en haut à droite change la casquette active. Le choix Français / Nederlands / English se trouve uniquement dans Mon espace ; les langues des modèles restent des paramètres de contenu.

```sh
npm run check
npm run test:integration
npm run test:e2e:db
```

- [Périmètre, droits et migrations du lot 08](lots/LOT-08.md)
- [Résultats de vérification du lot 08](recette/VERIFICATION-08.md)

Le lot 09 bancaire reste à implémenter.

## Répertoire Powerchair — 19 octobre 2026

- Joueurs : http://127.0.0.1:3000/fr/players ; anciens : `/fr/players/former`.
- Coachs : `/fr/coaches` ; gestion du club : `/fr/club/manage` ; financement : `/fr/funding`.
- Les fiches séparent les informations personnelles et sportives. Archiver la fonction joueur conserve les autres fonctions et les créances.
- Une fiche sportive ne crée pas de compte ni de permission. Ajouter les accès depuis Mon espace.
- Appliquer la migration 0015 avec `npm run db:migrate`. L’ancien répertoire général `/fr/club` reste accessible.

[Architecture, permissions, limites et recette](evolutions/2026-10-19-a-annuaire-joueurs-coachs.md).

### Calendrier, documents et messagerie (19 octobre 2026)

Vues liste/mois/semaine, lieux partagés ou ponctuels, fiches d’exercice et présences accessibles depuis le calendrier. La messagerie interne a été retirée le 2 novembre 2026 (point 24). Migrations additives 0016–0017. Périmètre, permissions, commandes et limites : [2026-10-19-b-calendrier-messagerie.md](evolutions/2026-10-19-b-calendrier-messagerie.md).

### Statistiques et calendrier simplifié

La page `/fr/statistics` présente l’assiduité, les réponses et le détail des présences, avec filtres et export CSV. Le calendrier donne la priorité à sa grille et masque les formulaires jusqu’à leur ouverture ; plus de champ de fuseau horaire. Voir [la recette et les limites](evolutions/2026-10-19-c-statistiques-calendrier.md).

### Charte orange, navigation et tableau de bord (19 octobre 2026)

Nouvelle charte orange avec mode sombre, navigation avec icônes et menu mobile, tableau de bord à l’accueil (`/fr`) : bloc « À faire », chiffres clés et prochains événements, calculés avec les droits de chaque module. Application installable (manifest et icônes dans `public/`). Aucune migration. Détails, permissions et limites : [2026-10-19-d-charte-orange-tableau-de-bord.md](evolutions/2026-10-19-d-charte-orange-tableau-de-bord.md).
