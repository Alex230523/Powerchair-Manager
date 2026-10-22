# Documentation

## Pour commencer

| Document                                                                     | Pour qui               | Contenu                                                                      |
| ---------------------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------- |
| [ARCHITECTURE.md](ARCHITECTURE.md)                                           | Développeurs           | Couches, autorisations, données, ajout d'un module                           |
| [../CONTRIBUTING.md](../CONTRIBUTING.md)                                     | Développeurs           | Conventions, tests, définition de « terminé »                                |
| [GUIDE-LOCAL.md](GUIDE-LOCAL.md)                                             | Développeurs, testeurs | Installation locale complète, usage de chaque module, workers                |
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

## Convention

Une nouvelle livraison ajoute une note dans `lots/` (si elle correspond à un lot du cahier des charges) ou dans `evolutions/` (`AAAA-MM-JJ-sujet.md`), avec : périmètre, migrations, permissions, limites connues et commandes de vérification.
