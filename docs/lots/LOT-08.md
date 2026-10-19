# Lot 08 — Cotisations et évolution de l’espace personnel

## Audit et plan avant code

Lot 07 validé par « continue ». Dépôt existant audité : Next.js/TypeScript/PostgreSQL, sept rôles et mandats isolés, personnes/familles/saisons, admissions et intentions `dues`, calendrier/présences, file de notifications. Réutilisation sans nouvelle dépendance.

Demandes complémentaires : barre latérale inspirée de la forme de la capture, profil actif en haut à droite, profils personnels enregistrés et anglais. La palette du projet est conservée. Les langues de l’interface seront sélectionnées uniquement dans Mon espace. Les langues des modèles/document/formulaire restent des attributs de contenu.

Migration 0013 : profils nommés personnels liés à un mandat autorisé, profil par défaut, ajout de l’anglais aux préférences et contenus multilingues. Un profil n’accorde aucun droit nouveau ; un changement recharge les écrans avec le contexte choisi. Migration 0014 : barèmes par saison/catégorie, créances, échéances, corrections et historique. Les admissions deviennent des demandes de cotisation à examiner, sans montant inventé.

Matrice : président de club ou délégation `dues.manage` pour créer/corriger les barèmes et créances, joueur pour consulter ses créances, représentant avec lien courant autorisé pour les personnes représentées. Pas de droit fédéral automatique sur les comptes privés d’un club. Montants calculés en centimes, ventilation exacte en échéances, réductions et exemptions motivées. Les mouvements bancaires, affectations, QR et imports attendent le lot 09.

Recette : 250 EUR en quatre échéances de 62,50 EUR, arrondis exacts, isolation, droits familiaux révoqués, émission idempotente, annulation tracée, changement de saison ; profils enregistrés sans élévation de droits, changement de casquette réel, anglais sur les parcours, langue uniquement dans Mon espace, navigation responsive et accessible.

## Livraison et usage

La barre latérale regroupe la vie du club et l’administration. Elle se replie sur mobile. Le bandeau supérieur affiche l’organisation et un sélecteur de profil actif, sans sélecteur de langue. Mon espace contient les préférences Français / Nederlands / English et l’enregistrement d’un profil nommé, avec option de démarrage par défaut. Le sélecteur propose les accès actuellement valides, avec leurs noms enregistrés lorsqu’ils existent. Supprimer un raccourci ne révoque pas l’accès ; la révocation reste une action du responsable habilité.

Chaque profil correspond à une seule combinaison rôle/organisation autorisée. Aucun cumul de droits entre profils. Le serveur revalide session, appartenance, dates et révocation à chaque opération ; un profil enregistré devenu invalide n’est plus activable. Un rechargement complet au changement évite de garder des données de la casquette précédente. Les autres onglets du même navigateur rechargent également leur contexte quand le stockage local est disponible. Le profil par défaut s’applique seulement à une nouvelle session sans contexte, sans remplacer un choix explicite déjà fait.

Dans Cotisations : créer un barème pour une saison active, choisir une catégorie, un montant EUR, une limite de 1 à 12 échéances et une première date. Émettre ensuite une créance pour une personne active, éventuellement depuis une admission en attente. Une réduction fixe en euros, y compris une exemption totale, exige un motif. Le montant net est figé avec une copie du barème. Les échéances mensuelles préservent le jour initial autant que possible (31 janvier → fin février → 31 mars). Les centimes restants vont aux premières échéances.

Une seule créance ouverte par personne/saison/catégorie : une nouvelle tentative concurrente est refusée sans double dette. Modifier l’échéancier conserve le montant et exige un motif et une version à jour. Annuler conserve la créance et tout son historique. Archiver un barème interdit les nouvelles émissions ; pour corriger un tarif, archiver puis créer son remplaçant, sans modification rétroactive des créances existantes. Une saison archivée ne permet pas de nouvelles émissions.

Le traitement d’une admission valide son organisation, sa saison et sa personne. Seule l’intention `dues` passe à `processed` ; les documents restent indépendants. L’admission ne crée aucune dette automatiquement. Une annulation ultérieure de créance ne remet pas automatiquement l’admission en attente ; une nouvelle émission motivée reste possible depuis le choix manuel.

## Matrice d’accès

| Action | Président de club | Délégation dues.manage | Joueur | Représentant |
| --- | --- | --- | --- | --- |
| Barèmes, émission, échéancier, annulation | Oui | Oui | Non | Non |
| Toutes les créances du club | Oui | Oui | Non | Non |
| Créances personnelles | Oui | Oui | Oui | Oui |
| Créances des personnes représentées | Oui | Oui | Non | Lien vérifié courant avec lecture autorisée |

Les profils inactifs ne donnent pas d’accès personnel/familial. Les responsables conservent l’historique. Aucun accès automatique fédéral aux cotisations d’un club. MFA suit la politique temporaire existante ; en politique stricte, la gestion requiert MFA, la lecture personnelle reste accessible.

## Migrations et retour arrière

0013 et 0014 sont additives et ont été appliquées à la base locale. Le mécanisme existant enregistre chaque fichier et sa somme de contrôle. Ne pas réécrire les migrations appliquées. Avant un déploiement partagé : sauvegarde PostgreSQL, exécution de `npm run db:migrate`, vérification `npm run db:test`, puis démarrage du code et redémarrage des workers. Les tests appliquent toutes les migrations sur des bases/schémas vides isolés.

Un retour arrière doit privilégier une correction additive. Ne pas supprimer les tables financières ayant reçu des données. L’ancien code ignore la langue anglaise : ne pas revenir aveuglément à une version FR/NL après enregistrement de préférences EN. Si une restauration est nécessaire, restaurer ensemble code et sauvegarde cohérente, après traitement des écritures intervenues depuis celle-ci. Le lot 09 devra ajouter les mouvements/règlements et empêcher les changements incompatibles avec des échéances déjà réglées.

## Limites explicites

- Aucun paiement, encaissement, remboursement, référence bancaire structurée, QR, import, rapprochement ni relance de cotisation n’est implémenté dans ce lot. Les sommes en retard représentent les échéances ouvertes antérieures à aujourd’hui, sans assertion d’encaissement externe.
- Pas de frais supplémentaires automatiques, réduction en pourcentage, facture fiscale ou règles comptables légales. L’outil conserve des obligations et leurs échéances ; il ne remplace pas un logiciel comptable.
- Les libellés de l’interface et les modèles de notification par défaut existent en trois langues. Les textes saisis par les clubs ne sont pas traduits automatiquement. Une question de formulaire sans libellé anglais reprend son libellé français ; le créateur peut renseigner le champ anglais.
- Les listes de cotisations ne sont pas paginées à ce stade du pilote ; valider la volumétrie avant un déploiement multi-clubs.
- Pas de PWA installable ou d’application native livrée à ce stade ; pas d’homologation de résultats, de statistiques financières avancées ou de déploiement externe.

Attendre la validation explicite de ce lot avant de commencer le lot 09.
