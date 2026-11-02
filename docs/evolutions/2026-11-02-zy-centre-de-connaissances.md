# Guide : un petit centre de connaissances (02/11/2026)

Le « Guide du jeu » devient un centre de connaissances : des chapitres courts pour chaque public, un lexique, une galerie, un catalogue des fauteuils, des quiz et un mode d'emploi de l'application. Contenu rédigé et validé par la fédération, lu par tous. Migration `0092_knowledge.sql` (additive). Reporté : les formations disponibles (G6). Écarté : l'accueil d'un joueur en fauteuil (G8).

## Chapitres

- Modèle (déjà en place depuis le guide en deux pages) : titre, résumé d'une phrase, publics (joueur, parent, coach, staff, arbitre, président, fédération), texte en fr, nl et en, sources, date de mise à jour, brouillon ou publié, historique des versions, note « Chez nous » du club.
- Nouveau : une image de la galerie se place dans un chapitre avec « [[image:…]] », avec son texte alternatif ; un chapitre long a son sommaire.
- Page « Guide » : chapitres du rôle du lecteur d'abord (« Tout voir »), recherche plein texte dans les chapitres publiés (toutes langues) et dans le lexique, liens vers le lexique, le catalogue, la galerie et le mode d'emploi, impression A4.
- Brouillons proposés, à valider par la fédération avant publication : G1 Qui fait quoi (pyramide FIPFA › EPFA › BPCF › clubs, et à côté Sportéa, ADEPS, Ligue Handisport Francophone, pouvoirs subsidiants ; partie flamande « à compléter »), G2 Compétitions, G3 Classification (relié à la page Classification), G9 Sécurité et urgences (relié aux consignes de soin et aux Incidents), G11 FAQ des parents. Seul ce qui a une source est présenté comme sûr ; le reste porte « à confirmer par la fédération ».
- Adresses réservées : lexicon, chairs, gallery, help, public.

## G12 Lexique

- Dix termes proposés (Guard, 2 contre 1, PF1, PF2, kick-in, ramming, rolling road, zone de but, coup franc indirect, contrôle de vitesse), modifiables par la fédération, en trois langues.
- Dans les pages du guide (chapitres, tableaux, notes), la première apparition d'un terme est soulignée en pointillé ; sa définition s'affiche au survol et au focus clavier (composant Tip), Échap la masque.
- Désactivable dans Réglages › Mon compte (affichage).

## G7 Quiz

- Cinq questions à choix multiple sous chaque chapitre de règles (le jeu, le fauteuil), explication après chaque réponse, recommençable, réussi à 4 sur 5.
- Aucune note publique : seul le fait d'avoir réussi est gardé, pour cocher l'étape « À lire » du parcours d'accueil qui pointe vers « quiz:<chapitre> ».
- La fédération modifie les questions, une langue à la fois.

## G5 Galerie

- Photos et schémas annotés téléversés par la fédération (PNG, JPEG ou WebP, 2 Mo au plus), avec sujet (terrain, buts, ballon, protection, contrôle de vitesse, fauteuil), conforme ou non.
- Texte alternatif obligatoire ; si des personnes sont reconnaissables, leur droit à l'image doit être confirmé, sinon l'image est refusée.
- Les images ne sont servies qu'aux lecteurs de la fédération, ou à tous quand un chapitre public les montre.

## G4 Catalogue des fauteuils

- Une fiche par modèle validé (modèles communs et modèles de la fédération) : photos (texte alternatif obligatoire), fabricant, fournisseurs choisis dans le carnet de contacts de la fédération, prix indicatif avec sa date, vitesse, poids, protections, points forts et limites.
- Depuis la fiche d'un fauteuil du club, lien « Fiche du modèle ».

## G10 Mode d'emploi

- Sept fiches courtes par action clé et par rôle : répondre à une invitation, payer par QR, déposer un document, signaler une panne, faire l'appel, émettre les cotisations, désigner un arbitre. Elles décrivent l'application : elles vivent dans le code, pas chez la fédération.
- Lien « Aide » en haut de chaque page : la fiche de la page pour le rôle du lecteur, sinon la liste des fiches.
- Captures : `npm run audit:help` (lancé par la CI après l'audit d'affichage) prend la capture de chaque fiche sur le club de démo ; une capture manquante est écrite dans `public/help/` (à relire puis committer), un écran qui a changé est signalé (avertissement et `audit-report/help-captures.json`, nouvelle image à côté) sans faire échouer la CI. Tant qu'aucune capture n'est committée, la fiche s'affiche sans image.

## Limites

- Le soulignement du lexique s'applique aux pages du guide, pas encore aux autres écrans de l'application.
- Les captures du mode d'emploi seront ajoutées après une première exécution de `npm run audit:help` en CI.
- Une mise à jour de chapitre est annoncée par notification (pas de page « Nouveautés » dans l'application).

## Vérification

- `npx vitest run tests/knowledge.test.ts tests/guide.test.ts tests/access-matrix.test.ts`
- `npm run test:integration` (`tests/integration/knowledge.integration.ts`, deux fédérations) :
  - filtre par rôle, recherche ;
  - quiz qui coche l'étape, sans note gardée ;
  - lexique propre à la fédération ;
  - photo sans texte alternatif ou sans droit à l'image refusée, image servie aux seuls lecteurs ;
  - fiche de modèle avec les fournisseurs de la fédération seulement.
- `tests/e2e/knowledge.spec.ts` à 390 px avec axe : terme au clavier, quiz, recherche, pages du centre, réglage du lexique.
