# Vague 16, I1 : visiteur sans menu, inscription sur invitation (21 octobre 2026)

Revue du 21 octobre au soir : « quand on n’est pas connecté, il ne doit pas y avoir de menu », et « Créer un compte » explique qu’il faut se faire inviter.

## Visiteur
- Le layout sait côté serveur si quelqu’un est connecté (`sessionShell` dans `src/lib/appearance.ts`). Sans session : ni barre latérale, ni tiroir, ni barre du bas, ni capsules Saison et Équipe, ni cloche. Une barre simple : logo et nom à gauche ; langue (liste compacte de M1) et « Se connecter » à droite. Le contenu prend toute la largeur, sans flash de menu au chargement.
- Après la connexion, la page se recharge entièrement (le layout affiche alors les menus) ; une page qui a envoyé le visiteur à la connexion (`?next=/fr/...`, adresses du site uniquement) le récupère.

## Connexion
- Une carte centrée de 420 px : email, mot de passe, « Se connecter », « Récupérer mon accès » ; dessous, le lien « Pas encore de compte ? » vers `/[locale]/join`. La création de compte libre disparaît.
- Avec un lien d’invitation (`#invitation=…`), la carte propose aussi « Créer mon compte », avec l’adresse invitée.

## « Rejoindre la plateforme » (`/[locale]/join`)
Quatre cartes, sans formulaire : joueur, parent ou coach (le président du club invite ; nouveau joueur : le formulaire d’inscription du club) ; président de club ou arbitre (le président de la fédération invite) ; fédération (adresse de l’équipe, variable `PFM_CONTACT_EMAIL` ajoutée à `.env.example`) ; « J’ai reçu une invitation » (lien valable 7 jours, à faire renvoyer s’il a expiré).

## Côté serveur
- La route publique `/api/auth/sign-up/email` n’accepte une création de compte qu’avec l’en-tête `x-pfm-invitation` portant une invitation valable (ni expirée, ni révoquée, ni utilisée) pour la même adresse email (`src/domains/access/signup.ts`). Sinon : 403 `INVITATION_REQUIRED`, avec un message clair. Les comptes existants ne changent pas.
- Les créations faites par le serveur (scripts d’exploitation, données de démo, et bientôt la fédération qui crée un club, I3) ne passent pas par cette route.

## Tests
- Unitaires : `tests/wave16-join.test.ts`. Intégration : `tests/integration/wave16-signup.integration.ts` (deux clubs : adresse invitée seulement, insensible à la casse ; invitation expirée, révoquée ou utilisée refusée).
- Bout en bout : nouveau parcours visiteur dans `tests/e2e/access.spec.ts` (sans menu à 1440 et 390 px, lien vers `/join`, ses quatre cartes, axe, création refusée par l’API). Les parcours existants créent désormais leurs comptes côté serveur puis se connectent (`tests/support/session.ts`), comme le ferait la plateforme pour un club créé par sa fédération.

## Limite connue
Une famille sans invitation passe par le lien « invité » du formulaire d’inscription du club ; I2 généralise ce parcours (formulaire sans compte, puis invitation automatique à l’acceptation).
