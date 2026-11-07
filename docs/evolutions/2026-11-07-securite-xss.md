# Sécurité : Cross-Site Scripting (XSS)

Audit du 07/11/2026 : un texte tapé par quelqu'un (un nom de club, d'équipe ou de joueur, un message, une adresse de site, un fichier déposé) peut-il devenir du code exécuté dans le navigateur d'un autre ?

## Ce qui protégeait déjà

React affiche tout texte comme du texte : aucun composant n'écrit de HTML brut, hormis deux petits scripts fixes (thème, palette du club, construits sur une liste fermée). Les emails (modèles, lettres d'information, résumé) échappent chaque valeur, l'aperçu d'une lettre est dans une `iframe` sans droits, la liste imprimable des personnes échappe chaque cellule, l'adresse de retour après connexion (`?next=`) ne mène que dans le site.

## Failles trouvées et corrigées

- **Aucune barrière si un texte passait quand même.** La politique de sécurité du contenu (CSP) des pages ne disait rien des scripts : un script glissé dans une page (par une faille future, une dépendance, un contenu mal échappé) se serait exécuté avec la session de la personne. Désormais, chaque page reçoit un nonce tiré au hasard (128 bits) à chaque affichage (`src/proxy.ts`), et le navigateur n'exécute que les scripts du site lui-même ou ceux qui portent ce nonce : `script-src 'self' 'nonce-…'`, `script-src-attr 'none'` (aucun `onclick` écrit dans le HTML). Next pose le nonce sur ses propres scripts, les deux scripts du site le reçoivent. Ni `unsafe-inline` ni `unsafe-eval` en production. Cet en-tête remplace celui de `next.config.ts` : il reprend donc aussi les autres règles de la page (cadre interdit, formulaires vers le site seulement), ou le cadre ouvert à tout site pour un widget.
- **Adresse de site d'une salle partagée.** Le formulaire de l'annuaire des salles, lu par tous les clubs de la fédération, acceptait n'importe quelle adresse, dont `javascript:…` ou `data:…`. Il n'accepte plus que `http` ou `https`, la base refuse le reste (migration `0140`), et une ancienne ligne qui en contenait une la perd.
- **Liens construits sur une adresse enregistrée.** Chaque lien vers une adresse tapée par quelqu'un (site d'une salle, d'un contact, d'un financeur, preuve, appel à projets, cagnotte, tâche, vidéo d'exercice, paiement) passe par `externalHref` : une adresse web devient un lien, tout le reste n'est pas un lien, même dans une ligne ancienne ou importée.
- **Code d'intégration des widgets.** Le code `<iframe>` que le club copie sur son propre site reprenait le titre d'un formulaire d'inscription sans l'échapper : un titre contenant `"><script>` aurait exécuté un script sur le site du club. Le titre et l'adresse sont maintenant échappés, comme le code du bouton « S'inscrire ».
- **Fichiers déposés.** Le site renvoyait certains fichiers avec le type enregistré. Désormais, seul un format accepté par le site (PDF, PNG, JPEG, WebP, GIF, CSV, Excel, Word, PowerPoint, ZIP) part sous son type ; tout le reste (une page HTML, un SVG, un fichier XML) part en octets bruts, qu'aucun navigateur n'exécute, toujours avec `nosniff`. Le nom d'un fichier n'est plus écrit tel quel dans l'en-tête : un guillemet ou un retour à la ligne ne peut plus le réécrire.
- **Liste imprimable des personnes.** Elle autorisait tout script en ligne (`unsafe-inline`) pour son bouton d'impression ; seul ce bouton est maintenant autorisé, par son empreinte.

## Garde-fous

- `tests/xss-safety.test.ts` : politique des scripts (nonce, rien en ligne, `unsafe-eval` seulement en développement), nonces tous différents, aucun HTML écrit à la main dans un composant, les deux scripts en ligne avec leur nonce, tout lien vers une adresse enregistrée par `externalHref`, toute adresse de formulaire limitée au web, codes d'intégration échappés, liste imprimable échappée, fichiers envoyés sous un type sûr et avec un nom encodé.
- `tests/integration/secu-xss.integration.ts` : l'ancienne adresse dangereuse d'une salle effacée par la migration (rejouable), une adresse `javascript:`, `data:`, `vbscript:`, `file:` refusée par le formulaire et par la base, un nom plein de HTML enregistré tel quel et lu tel quel par deux clubs, les emails qui l'échappent, un bouton de lettre d'information qui ne peut pas lancer de script.
- `tests/e2e/xss.spec.ts` (390 px, axe) : club, équipe et joueur nommés avec du HTML ; rien ne s'exécute, aucune fenêtre ne s'ouvre, chaque script de la page porte le nonce, un nouveau à chaque affichage, aucun script du site refusé, et un script injecté dans la page est refusé par le navigateur.
- `tests/audit/access.spec.ts` : la politique des scripts sur une vraie page du serveur.

## À savoir

- Les aperçus de Vercel autorisent en plus `https://vercel.live` (la barre de commentaires) ; la production non.
- Un script ajouté un jour au site doit être un fichier du site, ou recevoir le nonce (`scriptNonce()` dans `src/lib/nonce.ts`).

## Vérification

```
npx vitest run tests/xss-safety.test.ts
npm run test:integration -- secu-xss
npx playwright test tests/e2e/xss.spec.ts
npm run audit:access
```
