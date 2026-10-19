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

| Date       | Sujet                                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------- |
| 19/10/2026 | [Annuaire des joueurs et des coachs](evolutions/2026-10-19-a-annuaire-joueurs-coachs.md)                      |
| 19/10/2026 | [Calendrier, documents et messagerie](evolutions/2026-10-19-b-calendrier-messagerie.md)                       |
| 19/10/2026 | [Calendrier simplifié et statistiques de présences](evolutions/2026-10-19-c-statistiques-calendrier.md)       |
| 19/10/2026 | [Charte orange, navigation, tableau de bord et PWA](evolutions/2026-10-19-d-charte-orange-tableau-de-bord.md) |

## Convention

Une nouvelle livraison ajoute une note dans `lots/` (si elle correspond à un lot du cahier des charges) ou dans `evolutions/` (`AAAA-MM-JJ-sujet.md`), avec : périmètre, migrations, permissions, limites connues et commandes de vérification.
