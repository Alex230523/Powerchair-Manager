# Connexion : sans menu, langue discrète (2 novembre 2026)

Retours après la mise en ligne de `main`.

## Décisions
- **Pas de menu à gauche avant d'être connecté** : une session qui n'est plus valable (le serveur de l'espace répond 401) affiche la barre du visiteur, comme un visiteur, au lieu d'un menu vide avec le seul « Accueil ».
- **Langue discrète** sur l'accueil du visiteur et la page de connexion : un « FR » qui ouvre une courte liste (NL, EN), à la place du long sélecteur. Une fois connecté, la langue reste dans le menu du compte et dans Réglages.
- **Connecté sans club** : l'accueil ne dit plus « tableau de bord momentanément indisponible » mais « votre compte n'est encore relié à aucun club », avec le lien pour choisir son club ou son profil.

## Tests
- `tests/wave16-join.test.ts` : la barre du visiteur aussi pour une session expirée.
- `tests/e2e/foundation.spec.ts` : le « FR » discret et le passage en anglais depuis la page de connexion.
