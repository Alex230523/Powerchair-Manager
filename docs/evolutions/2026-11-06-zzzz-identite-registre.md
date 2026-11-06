# International, étape 3 : identité de la personne et registre des classifications

Suite de `2026-11-05-zzzc-international-console.md`, d'après la note `claude/architecture-multi-pays.md` (étape 3 du chemin).

## Identité de la personne

- Chaque personne (`person`) porte un **code d'identité** `PFM-XXXXXXXXXX`, attribué à la création (déclencheur) et rétroactivement à toutes les personnes existantes. Il figure sur la fiche du joueur (onglet Sport) et dans un dossier de transfert international. Il suit la personne de club en club et de pays en pays ; il ne dit rien d'elle.
- Un **dossier de transfert international** porte la personne et son code. Quand la fédération d'accueil l'accepte en nommant le club d'accueil, ce club voit **Arrivées de l'étranger** dans sa page Transferts et « Ouvrir la fiche » : la fiche est créée chez lui **rattachée à la même personne** (nom, naissance, contact et poste repris de la fiche d'origine, puisque le joueur rejoint ce club), ou réactivée si elle existait. Le dossier mémorise la fiche ouverte.

## Registre des classifications

- `classification_record` : une décision PF1 ou PF2 au nom de la **personne**, avec la fédération qui a classifié, la date, la fin de validité, le classificateur, l'origine (journée de classification, inscrite à la main, dossier de transfert) et la mention « internationale ».
- **Journées de classification** : à la publication, chaque décision PF1/PF2 validée s'inscrit au registre (fédération organisatrice, jour de la journée). Un « à revoir » ne s'inscrit pas.
- **Dossier de transfert accepté** : la classification du dossier entre au registre de la fédération d'accueil comme reconnue de l'étranger, sauf si la personne y a déjà une inscription valable.
- **Page Registre des classifications** (`/federation/registry`, compétence licences ; lecture pour les autres délégués) : joueurs des clubs de la fédération avec leur code, leur classification de fiche et l'inscription qui s'applique (expiration sous 90 jours signalée) ; inscriptions ; formulaire pour inscrire à la main une classification faite ailleurs (par joueur ou par code d'identité, classe, date, fin, classificateur, internationale, note) ; retrait d'une inscription manuelle de la fédération.
- **Les fiches suivent le registre** : à chaque inscription, les fiches actives de la personne dans les clubs de la fédération prennent la classification de l'inscription qui s'applique (statut validé, fin de validité). Une fiche d'un joueur transféré n'est pas touchée.
- La fiche du joueur montre le code d'identité et l'inscription au registre qui s'applique (classe, fédération, date, fin, reconnue de l'étranger).

## Migrations

`0131_person_registry.sql` (additive, idempotente ; rétroactivité des codes et des dossiers).

## Permissions

- `federation/registry` : fédération (présidence et délégués aux licences écrivent) ; 403 aux clubs.
- `transfers` : `internationalArrive` pour le club d'accueil avec le droit sur les joueurs, seulement sur un dossier accepté pour lui et pas encore ouvert.

## Limites

- Les fiches de la même personne dans deux clubs de deux fédérations suivent chacune le registre de leur fédération au moment d'une inscription ; une inscription par la fédération A ne touche pas une fiche dans un club de la fédération B tant que B n'inscrit rien (sa fiche prend l'inscription à l'arrivée).
- Pas de fusion d'identités (deux personnes pour un même joueur créées avant la plateforme) : prochaine étape.

## Vérification

- `tests/integration/international.integration.ts` (registre à la main par code, fiches suivies, dossier avec code et personne, arrivée dans le club d'accueil, cloisonnement entre fédérations), `tests/integration/wave17-classification.integration.ts` (journée publiée inscrite au registre), matrice des droits, e2e.
