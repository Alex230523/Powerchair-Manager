# Console, étape 6 : serveur MCP pour brancher son assistant

Suite de `2026-11-05-zzzd-console-facturation.md`, d'après la note `claude/console-gestionnaire.md` (niveau 1 : « la console comme source pour Claude »).

## Ce que ça fait

- La console expose un serveur MCP à `/api/mcp` (transport Streamable HTTP, sans état, réponses JSON ; GET répond 405, aucun flux SSE). Un opérateur y branche son Claude (bureau, Claude Code) comme connecteur distant avec une clé en jeton Bearer.
- **Clés d'opérateur** (`operator_api_key`) : créées dans l'onglet Opérateurs, « Brancher votre assistant (MCP) ». Une clé appartient à un opérateur, porte un nom et des portées, et son secret `pfmop_<préfixe>_<secret>` n'est montré qu'une fois ; seul le hachage reste. Révocable à tout moment ; 60 appels par minute ; compteur d'appels et dernier appel visibles.
- **Portées** : `console:read` (chiffres, organisations, fiche, supervision), `billing:read` (facturation, factures), `billing:write` (rappel, paiement), `support:write` (note interne). Un opérateur ne peut donner à une clé que ce que son rôle lui permet (Lecture seule : lecture ; Finance : facturation ; Support : notes ; Propriétaire : tout).
- **Outils** : `platform_overview`, `list_organizations`, `organization`, `supervision`, `billing_overview`, `invoices` (filtre état, organisation, en retard), `send_reminder`, `mark_invoice_paid`, `add_note`. `tools/list` ne montre que les outils des portées de la clé ; les outils d'écriture sont annotés non lecture seule pour que le client demande confirmation.
- Les outils appellent les services de la console **au nom de l'opérateur** : ils voient ce qu'il voit, jamais plus ; aucune donnée personnelle de joueur n'en sort (comme la console). Chaque écriture est inscrite dans `platform_action` (`mcp.<outil>`, avec la clé).
- Le serveur ne lit jamais les cookies de session : seul le jeton Bearer compte.

## Brancher

Dans Claude, ajouter un connecteur distant avec l'adresse `https://<votre domaine>/api/mcp` et la clé en jeton Bearer. Exemple de demande : « Quelles factures sont en retard de plus de dix jours ? Prépare les rappels. » Claude lit avec `invoices`, propose, et chaque `send_reminder` passe par votre confirmation.

## Migrations

`0128_operator_api_keys.sql` (additive, idempotente).

## Permissions

- `console/mcp-keys` : opérateurs seulement (403 à tous les rôles de club et de fédération).
- `mcp` : 401 sans jeton valide pour tous, session ou non ; 405 en GET.

## Limites

- Pas de ressources ni de prompts MCP, pas de flux SSE (pas de notifications serveur). Pas d'OAuth : la clé suffit, à garder comme un mot de passe.
- Niveau 2 (assistant dans la console) et niveau 3 (connecteurs par organisation) restent à faire.

## Vérification

- `tests/international-console.test.ts`, `tests/integration/mcp.integration.ts` (clés, protocole, portées, journal, révocation, cadence), `tests/e2e/international-console.spec.ts` (création d'une clé, secret affiché une fois, serveur qui répond avec la clé et refuse sans).
