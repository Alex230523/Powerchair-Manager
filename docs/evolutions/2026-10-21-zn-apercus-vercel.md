# Aperçus en ligne sur Vercel (21 octobre 2026)

Pour voir les dernières modifications sans rien installer : chaque branche et chaque PR ont leur aperçu Vercel, avec une base Neon réservée aux aperçus. Mode d’emploi et réglages : [APERCUS-VERCEL.md](../APERCUS-VERCEL.md).

- `src/lib/preview.ts` et `next.config.ts` : sur un aperçu, l’adresse publique est celle de la branche (inscrite au build), l’adresse de chaque déploiement y renvoie. Rien ne change hors aperçu, aucun réglage de sécurité n’est modifié.
- `scripts/vercel-build.mjs` et `vercel.json` : aperçus uniquement (production ignorée), migrations puis club de démo une seule fois sous verrou, puis build.
- `scripts/demo-seed.ts` : en ligne, le mot de passe des comptes de démo vient du secret `PFM_DEMO_PASSWORD` (obligatoire, jamais affiché) ; en local et dans Codespaces, rien ne change. Le garde-fou contre la production reste tel quel.
- Aperçus protégés par l’authentification Vercel ; double authentification exigée comme en production, sauf choix explicite.
- Test : `tests/vercel-preview.test.ts`.
