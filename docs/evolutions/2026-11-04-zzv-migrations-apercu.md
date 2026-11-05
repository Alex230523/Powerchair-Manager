# Aperçu : deux migrations déjà appliquées sous une version précédente (04/11/2026)

L'aperçu de `main` s'arrêtait sur « Migration modified: 0086_trip_transport.sql ». La base de démo des aperçus avait appliqué 0086 et 0087 avant une correction qui ne fait que nommer le schéma dans la vérification d'une colonne (sans effet sur une vraie base, qui n'a qu'un schéma).

`scripts/migrate.mjs` accepte désormais ces deux versions précédentes, nommées par leur empreinte, et met l'empreinte à jour. Toute autre modification d'une migration appliquée reste refusée.

Vérification : base vide, migrations, anciennes empreintes posées à la main, nouvelle exécution (« Checksum brought up to date »), troisième exécution silencieuse ; une autre empreinte modifiée est toujours refusée.
