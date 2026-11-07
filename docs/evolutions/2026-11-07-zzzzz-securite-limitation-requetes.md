# Sécurité : absence de limitation des requêtes

Audit du 07/11/2026 : un script peut-il appeler le site sans fin, pour deviner, inonder des boîtes mail, remplir un événement de faux inscrits, épuiser la base ou faire grimper la facture de l'assistant ?

## Ce qui existait déjà

- Connexion, inscription et liens de réinitialisation : limites de Better Auth (en base), blocage d'une adresse après dix mots de passe faux.
- API publique et connecteurs Claude : 60 appels par minute et par clé.
- Signalements (10 par jour), tickets ouverts (20), brouillons d'inscription (20 par heure), envois groupés d'un club (2 000 par jour), liens d'inscription (3 par heure et par adresse e-mail).

## Failles trouvées et corrigées

- **Aucune limite générale.** Hors des cas ci-dessus, rien ne limitait un compte ni une adresse réseau. Un compteur commun est ajouté (`src/lib/rate-limit.ts`, table `rate_counter`, migration `0141`) : il vit dans PostgreSQL, parce que le site tourne en fonctions courtes et qu'un compteur en mémoire ne compterait rien. Au-delà de la limite, la réponse est `429` avec `Retry-After`, et l'écran dit « Trop de demandes en peu de temps. Attendez un moment, puis réessayez. »
- **Formulaires sans compte.** La demande de lien d'inscription créait un compte par adresse e-mail inventée et envoyait jusqu'à 200 e-mails par heure et par formulaire vers des adresses au choix : un relais de spam au nom du club. L'inscription à un événement ouvert pouvait remplir toutes les places de faux noms. La création de compte guidée, l'identité d'un donateur et la désinscription n'avaient aucune limite. Désormais : 10 par 10 minutes et 40 par jour par adresse réseau.
- **Pages et fichiers publics par lien.** Page du club, widgets, agenda public, match en direct, reçus fiscaux, captures de signalement, rapport de partenaire, aide publique, état du service : 300 par minute par adresse, ce qu'aucun visiteur n'atteint.
- **Avant la clé.** L'API publique et les deux connecteurs Claude comptaient les appels d'une clé valide seulement : une clé devinée ou révoquée pouvait être essayée sans fin. Désormais 120 par minute par adresse avant même de lire la clé ; le webhook de Mollie aussi (chaque appel nous fait interroger Mollie).
- **Comptes connectés.** Toute modification compte : 300 par minute par compte. Les invitations (et leur renvoi, et la passation de présidence), qui envoient un e-mail à une adresse tapée : 30 par heure. Les exports et archives construits à la demande : 20 par 10 minutes. Le support (ouverture et messages) : 30 par heure.
- **Assistant de la console.** Chaque tour appelle le modèle et coûte : 40 tours par 10 minutes, et un plafond de jetons par opérateur et par jour (1 000 000 par défaut, `PFM_ASSISTANT_DAILY_TOKENS`), vérifié avant l'appel.

## Choix

- L'adresse réseau n'est jamais gardée : seulement son empreinte (SHA-256 salée), et une adresse IPv6 compte par son bloc /64 (celui d'un abonné). Sur Vercel, l'adresse vient de `x-real-ip`, posé par Vercel lui-même.
- Les limites sont bien au-dessus de ce qu'une personne fait à la main : elles arrêtent un script, pas un club.
- `PFM_RATE_LIMIT_SCALE` multiplie les limites pour les robots de test (1000 en CI) ; une valeur absurde compte comme 1 : on peut les relever, jamais les supprimer.
- Les pages (hors API) ne sont pas comptées ici : un compteur en base sur chaque page ralentirait tout le site. Pour une attaque en volume, la règle de limitation du pare-feu de Vercel est le bon outil (voir `docs/PRODUCTION.md`).

## Garde-fous

- `tests/ratelimit-safety.test.ts` : chaque route de l'API est comptée (compte, adresse, clé), les actions coûteuses et les envois ont leur limite, aucune adresse en clair, l'échelle relève sans supprimer, textes dans les trois langues.
- `tests/integration/secu-ratelimit.integration.ts` (club A, club B) : le dixième formulaire d'une adresse passe, le onzième est refusé avec le délai, une autre adresse continue, la fenêtre suivante repart ; la trentième invitation d'une présidente passe, la suivante et un renvoi sont refusés, le président du club B continue ; un fil de support s'arrête au trentième message ; un opérateur au-delà de ses jetons est refusé avant l'appel au modèle.
- `tests/e2e/ratelimit.spec.ts` (390 px, axe) : le président dont le compte vient d'envoyer trop de changements voit le message et rien n'est enregistré, puis enregistre une fois la fenêtre passée ; une route publique répond `429` avec `Retry-After` à une adresse, pas à une autre.

## Vérification

```
npx vitest run tests/ratelimit-safety.test.ts
npm run test:integration -- secu-ratelimit
npx playwright test tests/e2e/ratelimit.spec.ts
```
