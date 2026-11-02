# Mot de passe des comptes de démo réaligné (02/11/2026)

## Problème

Vercel n'affiche jamais une variable « Sensitive » après son enregistrement. Une valeur de `PFM_DEMO_PASSWORD` oubliée ne pouvait donc plus être retrouvée, et en choisir une nouvelle ne servait à rien : le script de démo crée les comptes une seule fois et ne touchait plus jamais à leur mot de passe.

## Changement

`scripts/demo-seed.ts`, quand le club de démo existe déjà : pour chacun des six comptes de démo (`@demo.pfm`), si le mot de passe enregistré ne correspond pas à `PFM_DEMO_PASSWORD`, il est remplacé par celui-ci (haché par Better Auth) et les sessions de ce compte sont fermées.

- Seulement avec le mot de passe propre au projet (`PFM_DEMO_PASSWORD`), jamais avec le mot de passe public du dépôt.
- Seulement les comptes créés par ce script ; aucun autre compte n'est touché.
- Jamais en production : le script refuse déjà de tourner avec `VERCEL_ENV=production`.
- Le mot de passe n'apparaît pas dans les journaux (seul le nombre de comptes réalignés est affiché).

## Utilisation

Vercel, projet, Settings, Environment Variables : modifier `PFM_DEMO_PASSWORD` (12 caractères au moins) pour l'environnement Preview, puis relancer un déploiement de preview (Redeploy). Les comptes de démo se connectent ensuite avec la nouvelle valeur.

## Migrations

Aucune.

## Vérification

`npx vitest run tests/vercel-preview.test.ts`
