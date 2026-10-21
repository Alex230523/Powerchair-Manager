# Vague 14, prompts 2.3 et 2.4 : barre latérale claire, menu réorganisé, barre du haut discrète (21 octobre 2026)

Aucune migration de base de données. Les droits et la logique de `menuGroups()` (menu par rôle depuis la vague 10) sont conservés ; seuls l'apparence et le regroupement du menu du président changent.

## Barre latérale (prompt 2.3)

- 256 px, hauteur de l'écran, fixe, fond carte, bordure droite, padding 16 px 12 px, défilement interne. Les variables `--sidebar-*` pointent vers les couleurs claires.
- Marque : pictogramme rond 32 px (`BrandMark`, le P du logo sur la primaire ; le logo du club le remplace quand il existe), « Powerchair Manager » en serif 17 px 700, nom du club en 12 px secondaire dessous. Marge basse 24 px.
- Élément de menu : 40 px, padding 0 12 px, icône 18 px secondaire, texte 14 px 500, arrondi 14 px ; survol fond doux ; actif fond primaire, texte et icône dessus, 600, sans barre colorée.
- Groupe repliable (`<details>` natif) : titre 12 px 600 secondaire, chevron qui pivote en 180 ms, ouvert automatiquement s'il contient la page active, sous-éléments décalés de 8 px.
- Compteurs : Badge discret à droite d'Inscriptions (dossiers à examiner), Présences (registres à clôturer) et Cotisations (joueurs en retard), chiffres de `/api/dashboard`. Le compteur « cotisations en retard » est une nouvelle tâche `duesLate` du tableau de bord, calculée par `duesTotals()` (domaine des cotisations), la même fonction que la page Cotisations ; son lien ouvre `/dues?state=late`, que la page lit pour préfiltrer.
- Pied : trait, avatar 32 px (initiales sur l'accent doux), nom 14 px 600, rôle 12 px. Un clic ouvre un menu (ombre `--shadow-pop`, arrondi 14 px) : Changer de profil (le sélecteur quitte la barre du haut), Mon espace, Langue (FR, NL, EN vers la même page), Thème clair ou sombre, Se déconnecter.

## Regroupement du menu du président

Accueil ; Équipes (Mes équipes, Joueurs, Coachs, Inscriptions, Présences, Transferts, Statistiques) ; Activités (Calendrier, Matchs, Déplacements, Salles, Calendrier fédéral) ; Communication (Communication, Documents) ; Argent (Finances, Cotisations, Cagnottes) ; Club (Gestion du club, Matériel, Carnet de contacts) ; Plus, replié par défaut (Rappels, Confidentialité, Carnet hors ligne, Réglages). Les Notifications passent dans la cloche ; la Messagerie reste hors menu ; Mon espace est dans le menu du pied. Subsides et Sponsors restent accessibles depuis la page Finance du club ; le Carnet de contacts, absent de la liste demandée, est placé sous Club pour rester joignable. Les autres rôles gardent le menu de la vague 10 avec le nouveau style (sans l'entrée Mon espace, désormais dans le pied). Libellés fr/nl/en dans `shell-copy.ts` ; modules désactivés et droits respectés comme avant. La structure vit dans `src/components/menu.ts` (module pur, testé).

## Icônes

`lucide-react` 1.60.0 (ISC) remplace les tracés dessinés à la main : `src/components/icons.tsx` mappe chaque `IconName` vers une icône Lucide (18 px, trait 1,75, `aria-hidden`). Les anciens noms sont conservés, de nouveaux s'ajoutent (userPlus, badgeCheck, trophy, bus, pin, landmark, megaphone, piggyBank, bellRing, shield, bookLock, chevronDown, globe, logOut, close, plus). Le logo garde ses tracés. La dépendance a été inscrite dans `package.json` et `package-lock.json` avec l'empreinte publiée par le registre (la session n'avait pas d'accès au registre npm).

## Barre du haut (prompt 2.4)

- 60 px, fond carte, bordure basse, collante, padding horizontal `--content-padding`, sans ombre.
- Gauche : champ de recherche en capsule (100 % jusqu'à 420 px, 38 px, icône 16 px, invite « Rechercher un joueur, une équipe, un événement », touche `Ctrl K` ou `⌘K` sur Mac en 12 px sur fond doux). Un clic ou le raccourci ouvre la palette de commande existante (`variant="field"` de `CommandPalette`).
- Droite : capsules Saison et Équipe (vague 12), puis cloche ronde 38 px avec pastille danger 18 px du nombre de notifications non lues (« 9+ » au-delà) ; elle ouvre un panneau de 360 px (dialog non modal, Échap ou un clic ailleurs le ferme, focus rendu à la cloche) listant les 8 dernières notifications et un lien « Tout voir » vers `/notifications`. Données de `GET /api/notifications?brief=1` (`notificationBrief`, mêmes règles d'éligibilité que la boîte).
- Retirés de la barre : le sélecteur de profil, le nom de l'organisation (dans la marque de la barre latérale) et le bouton thème (dans le menu du pied).
- Le nom accessible de la cloche annonce le compteur (« Notifications · 3 notifications non lues »).

## Mobile (sous 1024 px)

La barre latérale devient un tiroir de 288 px (ombre `--shadow-pop`) au-dessus d'un voile `--backdrop`, ouvert par le bouton menu de la barre du haut. Fermeture par la croix, Échap, clic sur le voile et après navigation ; focus piégé dans le tiroir (Tab tourne), posé sur la croix à l'ouverture et rendu au bouton à la fermeture ; la page ne défile plus sous le voile. Barre du haut : bouton menu et pictogramme à gauche ; loupe et cloche à droite ; les capsules Saison et Équipe passent sur une ligne sous la barre, défilable horizontalement.

## Tests

- Unitaires (`tests/wave14.test.ts`) : groupes du président dans l'ordre, Plus replié, aucune entrée Mon espace ni Notifications, modules désactivés et droits, libellés fr/nl/en ; coach et joueur gardent le menu de la vague 10 ; `duesTotals` (dû, encaissé, retard, joueurs en retard, taux) ; tâche `duesLate` et ses textes ; textes sans tiret long.
- Intégration (`tests/integration/wave14.integration.ts`) : la cloche compte les non lues du seul club de la personne, le message test, la lecture ; le compteur de cotisations en retard apparaît après une émission échue, reste invisible pour l'autre club et disparaît une fois payé.
- Bout en bout (`tests/e2e/shell.spec.ts`) : marque et nom du club, six groupes, aucune entrée Mon espace dans le menu, un seul select dans la barre (Saison), champ de recherche avec sa touche, Ctrl+K et clic ouvrent la palette, cloche à zéro puis à un après le message test, panneau ouvert et fermé par Échap avec le focus rendu, menu du compte (profil, Mon espace, langues, thème sombre puis clair, déconnexion), tiroir à 390 px (ouverture, focus sur la croix, Échap, voile, navigation), capsules sous la barre, aucun débordement ; axe à chaque étape. Les parcours existants (menu Mon espace d'un joueur, menu sans Messagerie, clic sur Cotisations) restent verts, les quelques sélecteurs touchés par le regroupement sont adaptés.

## Vérification

`npm run check`, `npm run test:integration`, `npm run test:e2e:db`.
