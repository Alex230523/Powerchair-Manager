# Documentation

## Pour commencer

| Document                                                                     | Pour qui               | Contenu                                                                      |
| ---------------------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------- |
| [ARCHITECTURE.md](ARCHITECTURE.md)                                           | Développeurs           | Couches, autorisations, données, ajout d'un module                           |
| [../CONTRIBUTING.md](../CONTRIBUTING.md)                                     | Développeurs           | Conventions, tests, définition de « terminé »                                |
| [GUIDE-LOCAL.md](GUIDE-LOCAL.md)                                             | Développeurs, testeurs | Installation locale complète, usage de chaque module, workers                |
| [PRODUCTION.md](PRODUCTION.md)                                               | Responsable technique  | Mise en ligne à coût zéro : services gratuits, quotas, tâches de fond, sauvegardes, incident |
| [cahier-des-charges/](cahier-des-charges/Powerchair_Football_Manager_v2.pdf) | Tous                   | Cahier des charges v2.0 : 20 modules, 7 profils, feuille de route en 21 lots |

## Notes de lots (`lots/`)

Périmètre, décisions, modèle de données et limites de chaque lot livré.

| Lot                  | Sujet                                   | Recette                               |
| -------------------- | --------------------------------------- | ------------------------------------- |
| [00](lots/LOT-00.md) | Audit, architecture et socle            | [rapport](recette/VERIFICATION-00.md) |
| [01](lots/LOT-01.md) | Comptes, organisations et permissions   | [rapport](recette/VERIFICATION-01.md) |
| [02](lots/LOT-02.md) | Personnes, familles, équipes et saisons | [rapport](recette/VERIFICATION-02.md) |
| [03](lots/LOT-03.md) | Notifications                           | [rapport](recette/VERIFICATION-03.md) |
| [04](lots/LOT-04.md) | Inscriptions                            | [rapport](recette/VERIFICATION-04.md) |
| [05](lots/LOT-05.md) | Documents                               | [rapport](recette/VERIFICATION-05.md) |
| [06](lots/LOT-06.md) | Calendrier                              | [rapport](recette/VERIFICATION-06.md) |
| [07](lots/LOT-07.md) | Présences                               | [rapport](recette/VERIFICATION-07.md) |
| [08](lots/LOT-08.md) | Cotisations, profils et langues         | [rapport](recette/VERIFICATION-08.md) |

Les rapports de recette (`recette/`) décrivent ce qui a été testé et comment, au moment de la livraison.

## Évolutions (`evolutions/`)

Changements livrés hors du découpage en lots, par ordre chronologique.

| Date       | Sujet                                                                                                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 19/10/2026 | [Annuaire des joueurs et des coachs](evolutions/2026-10-19-a-annuaire-joueurs-coachs.md)                                                                                                    |
| 19/10/2026 | [Calendrier, documents et messagerie](evolutions/2026-10-19-b-calendrier-messagerie.md)                                                                                                     |
| 19/10/2026 | [Calendrier simplifié et statistiques de présences](evolutions/2026-10-19-c-statistiques-calendrier.md)                                                                                     |
| 19/10/2026 | [Charte orange, navigation, tableau de bord et PWA](evolutions/2026-10-19-d-charte-orange-tableau-de-bord.md)                                                                               |
| 19/10/2026 | [Menu par thèmes, matériel (fauteuils) et fiche joueur](evolutions/2026-10-19-e-menu-materiel-fiche-joueur.md)                                                                              |
| 19/10/2026 | [Inscriptions, coachs et formations, réglages, finances du club, import Excel](evolutions/2026-10-19-f-inscriptions-coachs-finances.md)                                                     |
| 19/10/2026 | [Vague 1 : design plus fin, formulaire Tigerstorm, BPCF, relances](evolutions/2026-10-19-g-vague-1-design-inscriptions-rappels.md)                                                          |
| 19/10/2026 | [Vague 2 : finances (budget, justificatifs, rapport annuel), import enrichi, doublons et RGPD](evolutions/2026-10-19-h-vague-2-finances-import-rgpd.md)                                     |
| 19/10/2026 | [Vague 3 : compétitions (matchs, compositions, statistiques) et arbitres](evolutions/2026-10-19-i-vague-3-competitions-arbitres.md)                                                         |
| 19/10/2026 | [Vague 4 : licences, classifications, transferts, calendrier fédéral, inscription sans compte, signature électronique](evolutions/2026-10-19-j-vague-4-federation-inscription-signature.md) |
| 19/10/2026 | [Vague 5 : hors ligne et qualité](evolutions/2026-10-19-k-vague-5-hors-ligne-qualite.md) |
| 20/10/2026 | [Vague 6 : logo PCM, modules activables, droits par module, journaux, recherche](evolutions/2026-10-20-l-vague-6-modules-droits-logo.md) |
| 20/10/2026 | [Vague 7 : déplacements, annuaire des salles, consignes de soin, carnet hors ligne](evolutions/2026-10-20-m-vague-7-deplacements-salles-soins.md) |
| 20/10/2026 | [Vague 8 : attestations mutuelle, fratrie, levée de fonds, absences, passage de saison, fidélisation](evolutions/2026-10-20-n-vague-8-familles-argent.md) |
| 20/10/2026 | [Vague 9 : communication du club, fils protégés, matériel, export, copie de semaine](evolutions/2026-10-20-o-vague-9-communication-materiel.md) |
| 20/10/2026 | [Vague 10 : tableau de bord, présences en tableau, cotisations ligne par ligne, cagnottes avec les joueurs, accès par rôle](evolutions/2026-10-20-p-vague-10-tableau-de-bord-finitions.md) |
| 20/10/2026 | [Vague 11 : finance du club, subsides et partenaires, carnet de contacts, réglages regroupés, photo de profil](evolutions/2026-10-20-q-vague-11-finance-reglages-contacts.md) |
| 21/10/2026 | [Vague 12 : saison et équipe choisies une fois, page Mes équipes, couleurs d'équipe, finances par équipe](evolutions/2026-10-21-r-vague-12-equipes-contexte.md) |
| 21/10/2026 | [Vague 13, prompt 2.1 : fondations du design, polices, jetons, mode sombre factorisé](evolutions/2026-10-21-s-vague-13-design-fondations.md) |
| 21/10/2026 | [Vague 13, prompt 2.2 : composants partagés et migration des pages](evolutions/2026-10-21-t-vague-13-composants-migration.md) |
| 21/10/2026 | [Vague 14, prompts 2.3 et 2.4 : barre latérale claire, menu réorganisé, barre du haut](evolutions/2026-10-21-u-vague-14-barre-laterale-barre-du-haut.md) |
| 21/10/2026 | [Vague 14, prompt 2.5 : accueil du président](evolutions/2026-10-21-v-vague-14-accueil-president.md) |
| 21/10/2026 | [Vague 15, C13 : réglages rangés en sous-pages](evolutions/2026-10-21-w-vague-15-reglages-sous-pages.md) |
| 21/10/2026 | [Vague 15, prompt 1.C : cotisations, déplacements et cagnottes par équipe](evolutions/2026-10-21-x-vague-15-equipe-cotisations-deplacements-cagnottes.md) |
| 21/10/2026 | [Vague 15, C1 : sponsors, formules du club, conditions et calendrier](evolutions/2026-10-21-y-vague-15-sponsors-formules.md) |
| 21/10/2026 | [Vague 15, C2 : subsides, dossier complet, check-list, organismes et année suivante](evolutions/2026-10-21-z-vague-15-subsides-dossier.md) |
| 21/10/2026 | [Vague 15, prompt 2.6 : statistiques et graphiques](evolutions/2026-10-21-za-vague-15-statistiques-graphiques.md) |
| 21/10/2026 | [Vague 15, prompt 2.7 et C9 : calendrier en grille horaire, couleurs par type, abonnement mis en avant](evolutions/2026-10-21-zb-vague-15-calendrier-abonnement.md) |
| 21/10/2026 | [Vague 15, prompt 2.8 : finances et cotisations](evolutions/2026-10-21-zc-vague-15-finances-cotisations.md) |
| 21/10/2026 | [Vague 15, C12 : comptes annuels générés depuis la plateforme](evolutions/2026-10-21-zd-vague-15-comptes-annuels.md) |
| 21/10/2026 | [Vague 15, C11 : rapport d’activité en PowerPoint pour Canva](evolutions/2026-10-21-ze-vague-15-rapport-activite.md) |
| 21/10/2026 | [Vague 15, C7 : résumé hebdomadaire par email](evolutions/2026-10-21-zf-vague-15-resume-hebdomadaire.md) |
| 21/10/2026 | [Vague 15, C8 : tableaux triables, sélection multiple et actions groupées](evolutions/2026-10-21-zg-vague-15-tableaux.md) |
| 21/10/2026 | [Vague 15, C10 : annulation après une action importante](evolutions/2026-10-21-zh-vague-15-annulation.md) |
| 21/10/2026 | [Vague 15, C4 : taille du texte et contraste renforcé](evolutions/2026-10-21-zi-vague-15-taille-texte-contraste.md) |
| 21/10/2026 | [Vague 15, C5 : barre de navigation mobile en bas d’écran](evolutions/2026-10-21-zj-vague-15-barre-mobile.md) |
| 21/10/2026 | [Vague 15, C6 : actions rapides dans la recherche Ctrl+K](evolutions/2026-10-21-zk-vague-15-actions-ctrlk.md) |
| 21/10/2026 | [Vague 15, C3 : démarrage guidé d’un nouveau club](evolutions/2026-10-21-zl-vague-15-demarrage-guide.md) |
| 21/10/2026 | [Vague 15, 2.9 : palette du club et nettoyage final](evolutions/2026-10-21-zm-vague-15-palette-club-nettoyage.md) |
| 21/10/2026 | [Aperçus en ligne sur Vercel](evolutions/2026-10-21-zn-apercus-vercel.md) |
| 21/10/2026 | [Connexion vers l’accueil, sans double authentification, président avec tous les droits](evolutions/2026-10-21-zo-accueil-sans-mfa-droits-president.md) |
| 21/10/2026 | [Tournois : le calendrier fédéral devient « Tournois »](evolutions/2026-10-21-zp-tournois.md) |
| 21/10/2026 | [Vague 16, B1 : plus de puce sous la barre du haut](evolutions/2026-10-21-zq-vague-16-b1-puce-barre-haut.md) |
| 21/10/2026 | [Vague 16, M1 : menu du compte compact](evolutions/2026-10-21-zr-vague-16-m1-menu-compte.md) |
| 21/10/2026 | [Vague 16, R1 : places disponibles par équipe](evolutions/2026-10-21-zs-vague-16-r1-places-equipe.md) |
| 21/10/2026 | [Vague 16, I1 : visiteur sans menu, inscription sur invitation](evolutions/2026-10-21-zt-vague-16-i1-visiteur-rejoindre.md) |
| 21/10/2026 | [Vague 16, I2 : invitations et création de compte guidée](evolutions/2026-10-21-zu-vague-16-i2-invitations-creation-guidee.md) |
| 21/10/2026 | [Vague 16, I3 : espace fédération](evolutions/2026-10-21-zv-vague-16-i3-espace-federation.md) |
| 21/10/2026 | [Vague 16, A : accueil du président](evolutions/2026-10-21-zw-vague-16-a-accueil-president.md) |
| 21/10/2026 | [Vague 16, E1 : créer et gérer un événement](evolutions/2026-10-21-zx-vague-16-e1-evenements.md) |
| 21/10/2026 | [Vague 16, E2 : bibliothèque de fiches exercices](evolutions/2026-10-21-zy-vague-16-e2-fiches-exercices.md) |
| 21/10/2026 | [Vague 16, E3 : tournois du club sur la page Tournois](evolutions/2026-10-21-zz-vague-16-e3-tournois-club.md) |
| 21/10/2026 | [Vague 16, S1 : statistiques du club](evolutions/2026-10-21-zza-vague-16-s1-statistiques-club.md) |
| 21/10/2026 | [Vague 16, S2 : statistiques de jeu](evolutions/2026-10-21-zzb-vague-16-s2-statistiques-jeu.md) |
| 22/10/2026 | [Vague 17, C6 : « invité » à la place de « convoqué »](evolutions/2026-10-22-a-vague-17-c6-invite.md) |
| 22/10/2026 | [Vague 17, G3 : menu et réglages](evolutions/2026-10-22-b-vague-17-g3-menu-reglages.md) |
| 22/10/2026 | [Vague 17, F1 : formulaires et décisions d'inscription](evolutions/2026-10-22-c-vague-17-f1-inscriptions.md) |
| 22/10/2026 | [Vague 17, J1 : anciens joueurs et fiche en fenêtre](evolutions/2026-10-22-d-vague-17-j1-anciens-joueurs.md) |
| 22/10/2026 | [Vague 17, N2 : affiliations et cotisations fédérales](evolutions/2026-10-22-e-vague-17-n2-affiliations.md) |
| 22/10/2026 | [Vague 17, N1 : finances restructurées](evolutions/2026-10-22-f-vague-17-n1-finances.md) |
| 22/10/2026 | [Vague 17, O1 : coachs, tâches, formation, permis et première connexion](evolutions/2026-10-22-g-vague-17-o1-coachs.md) |
| 22/10/2026 | [Vague 17, J2 : présences, une séance à la fois](evolutions/2026-10-22-h-vague-17-j2-presences.md) |
| 22/10/2026 | [Vague 17, C4 : lieux, catégories et partage validé](evolutions/2026-10-22-i-vague-17-c4-lieux.md) |
| 22/10/2026 | [Vague 17, C5 : matchs, amicaux entre clubs et ligne complète](evolutions/2026-10-22-j-vague-17-c5-matchs.md) |
| 22/10/2026 | [Vague 17, G1 : transmission de la présidence](evolutions/2026-10-22-k-vague-17-g1-presidence.md) |
| 22/10/2026 | [Vague 17, G2 : export Excel partout](evolutions/2026-10-22-l-vague-17-g2-exports.md) |
| 22/10/2026 | [Vague 17, J4 : journées de classification](evolutions/2026-10-22-m-vague-17-j4-classification.md) |
| 22/10/2026 | [Vague 17, Q1 : matériel, modèles, prêts, stockage](evolutions/2026-10-22-n-vague-17-q1-materiel.md) |
| 22/10/2026 | [Vague 17, J3 : bourse aux transferts](evolutions/2026-10-22-o-vague-17-j3-bourse.md) |
| 22/10/2026 | [A3 : émettre des cotisations](evolutions/2026-10-22-p-a3-emettre-cotisations.md) |
| 22/10/2026 | [A1 : to-do centrale du club et de la fédération](evolutions/2026-10-22-q-a1-todo-centrale.md) |
| 22/10/2026 | [A2 : Subsides & sponsors](evolutions/2026-10-22-r-a2-subsides-sponsors.md) |
| 22/10/2026 | [A4 : CRM simple relié à tout](evolutions/2026-10-22-s-a4-crm.md) |
| 22/10/2026 | [B2 : mise en production à coût zéro (prête, non activée)](evolutions/2026-10-22-t-b2-production.md) |
| 22/10/2026 | [B7 : automatisation des emails et des rappels](evolutions/2026-10-22-u-b7-automatisations.md) |
| 22/10/2026 | [B1 : paiements par QR de virement et rapprochement bancaire](evolutions/2026-10-22-v-b1-paiements.md) |
| 22/10/2026 | [B8 : attestations fiscales, activées par un réglage oui/non](evolutions/2026-10-22-w-b8-attestations-fiscales.md) |
| 22/10/2026 | [A6 : la page équipe comme tableau de bord](evolutions/2026-10-22-x-a6-equipe-tableau-de-bord.md) |
| 22/10/2026 | [A5 : un match, un parcours avant / jour J / après](evolutions/2026-10-22-y-a5-parcours-match.md) |
| 22/10/2026 | [B3 : l'atelier des fauteuils](evolutions/2026-10-22-z-b3-atelier-fauteuils.md) |
| 22/10/2026 | [B4 : les notifications sur téléphone](evolutions/2026-10-22-za-b4-notifications-push.md) |
| 22/10/2026 | [B5 : incidents, blessures et déclaration d'assurance](evolutions/2026-10-22-zb-b5-incidents.md) |
| 22/10/2026 | [B9 : événements ouverts au public](evolutions/2026-10-22-zc-b9-evenements-ouverts.md) |
| 22/10/2026 | [B6 : pages publiques, widgets, API et webhooks](evolutions/2026-10-22-zd-b6-pages-publiques-api.md) |
| 02/11/2026 | [Connexion : sans menu, langue discrète](evolutions/2026-11-02-ze-connexion-langues.md) |
| 02/11/2026 | [13 : corrections techniques (base par aperçu, table task, pagination)](evolutions/2026-11-02-zg-13-corrections-techniques.md) |
| 02/11/2026 | [23 et 26 : audits d'affichage et de droits, matrice remplie et constats corrigés](evolutions/2026-11-02-zh-23-26-audits.md) |
| 02/11/2026 | [22 et 24 : tâches dans tous les menus, fin de la messagerie](evolutions/2026-11-02-zi-22-24-taches-fin-messagerie.md) |
| 02/11/2026 | [24 (suite) : suppression des données de la messagerie](evolutions/2026-11-02-zj-24b-messagerie-donnees.md) |
| 02/11/2026 | [1 : lot de corrections d'interface et écran de connexion](evolutions/2026-11-02-zk-01-corrections-interface.md) |
| 02/11/2026 | [12 : navigation, « Gestion du club » et « Plus » rangés dans Réglages](evolutions/2026-11-02-zl-12-navigation-reglages.md) |
| 02/11/2026 | [15 : accueil par rôle](evolutions/2026-11-02-zm-15-accueil-par-role.md) |
| 02/11/2026 | [8 : joueurs et familles, représentant dès l'ajout, vérification de début de saison](evolutions/2026-11-02-zn-08-joueurs-familles.md) |
| 02/11/2026 | [27 à 29 : parents (vue famille, autorisations signées, deux foyers)](evolutions/2026-11-02-zo-27-29-parents.md) |
| 02/11/2026 | [16 : assistant de fin de saison](evolutions/2026-11-02-zp-16-fin-de-saison.md) |
| 02/11/2026 | [H9 et H10 : saison type en un clic, clés dans le profil du coach](evolutions/2026-11-02-zq-h9-h10-saison-type-cles.md) |
| 02/11/2026 | [2 : to-do à plusieurs responsables, modèles à la demande, vue de l'année](evolutions/2026-11-02-zr-02-todo-enrichie.md) |
| 02/11/2026 | [3 : déplacements repensés en logistique de transport](evolutions/2026-11-02-zs-03-deplacements-transport.md) |
| 02/11/2026 | [18 : réservations de salles et factures, calculées depuis l'agenda](evolutions/2026-11-02-zt-18-reservations-salles.md) |
| 02/11/2026 | [17 : registre des membres et assemblée générale, automatisés](evolutions/2026-11-02-zu-17-registre-ag.md) |
| 02/11/2026 | [Parcours d'accueil personnalisables (club et fédération)](evolutions/2026-11-02-zv-parcours-accueil.md) |
| 02/11/2026 | [Fin de coach : le parcours de départ](evolutions/2026-11-02-zw-fin-de-coach.md) |
| 02/11/2026 | [Guide du powerchair football : deux pages à lire](evolutions/2026-11-02-zx-guide-du-jeu.md) |
| 02/11/2026 | [Guide : un petit centre de connaissances (G1 à G12)](evolutions/2026-11-02-zy-centre-de-connaissances.md) |
| 02/11/2026 | [Rôles de staff](evolutions/2026-11-02-zz-roles-de-staff.md) |
| 02/11/2026 | [Fédération : rôles délégués, tableau de bord et circulaires](evolutions/2026-11-02-zza-federation-delegues-circulaires.md) |
| 02/11/2026 | [Arbitrage : un seul circuit, rapport sur téléphone, frais et formations](evolutions/2026-11-02-zzb-arbitrage.md) |
| 02/11/2026 | [Discipline et suspensions](evolutions/2026-11-02-zzc-discipline.md) |
| 02/11/2026 | [La fédération comme ASBL](evolutions/2026-11-02-zzd-federation-asbl.md) |
| 02/11/2026 | [Signaler un problème : application et fauteuil](evolutions/2026-11-02-zze-signalements.md) |
| 02/11/2026 | [Page « Nouveautés »](evolutions/2026-11-02-zzf-nouveautes.md) |
| 02/11/2026 | [Fiche de la personne : « Vue d'ensemble »](evolutions/2026-11-02-zzg-vue-ensemble.md) |
| 02/11/2026 | [Mini-sondages du club et de la fédération](evolutions/2026-11-02-zzh-sondages.md) |
| 02/11/2026 | [Argent : fonds réservés, attestations, levée de fonds, rappels annuels](evolutions/2026-11-02-zzi-argent.md) |
| 02/11/2026 | [Trésorerie prévisionnelle sur 12 mois](evolutions/2026-11-02-zzj-previsions.md) |
| 02/11/2026 | [Rapport d'impact pour les subsides](evolutions/2026-11-02-zzk-rapport-impact.md) |
| 02/11/2026 | [Recrutement de nouveaux joueurs](evolutions/2026-11-02-zzl-recrutement.md) |
| 02/11/2026 | [Matchs : une seule ligne, cartes d'équipe, statistiques par équipe](evolutions/2026-11-02-zzm-matchs.md) |
| 02/11/2026 | [Mode « bord de terrain » sur téléphone](evolutions/2026-11-02-zzn-bord-de-terrain.md) |
| 02/11/2026 | [Fiches exercice et tactique](evolutions/2026-11-02-zzo-fiches-exercice-tactique.md) |
| 02/11/2026 | [Joueur : « Mon suivi »](evolutions/2026-11-02-zzp-mon-suivi.md) |
| 02/11/2026 | [Documents en dossiers et modèles d'emails](evolutions/2026-11-02-zzq-documents-dossiers-modeles.md) |
| 02/11/2026 | [Matériel, amélioré](evolutions/2026-11-02-zzr-materiel.md) |
| 02/11/2026 | [Préparer l'ouverture à d'autres clubs](evolutions/2026-11-02-zzs-ouverture-autres-clubs.md) |
| 02/11/2026 | [Sélection nationale](evolutions/2026-11-02-zzt-selection-nationale.md) |

## Convention

Une nouvelle livraison ajoute une note dans `lots/` (si elle correspond à un lot du cahier des charges) ou dans `evolutions/` (`AAAA-MM-JJ-sujet.md`), avec : périmètre, migrations, permissions, limites connues et commandes de vérification.
