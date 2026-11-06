# Console, étape 7 : l'assistant dans la console

Suite de `2026-11-06-zz-acces-support.md`, d'après la note `claude/console-gestionnaire.md` (niveau 2 : « l'assistant dans la console »).

## Ce que ça fait

- Onglet **Assistant** de la console : une conversation avec Claude, appelé côté serveur (`ANTHROPIC_API_KEY`, modèle `PFM_ASSISTANT_MODEL`, par défaut `claude-sonnet-4-5`), avec les mêmes outils que le serveur MCP (`platform_overview`, `list_organizations`, `organization`, `supervision`, `billing_overview`, `invoices`, `send_reminder`, `mark_invoice_paid`, `add_note`), au nom de l'opérateur connecté et dans les limites de son rôle (un opérateur Lecture seule n'a aucun outil d'écriture).
- Les outils de lecture s'exécutent tout de suite et nourrissent la réponse. **Un outil d'écriture arrête le tour** : la console affiche l'action proposée (nom, paramètres, ce qu'elle fait) avec « Confirmer l'action » et « Refuser ». Confirmée, elle s'exécute, est journalisée dans `platform_action` (`assistant.<outil>`) et le modèle reprend ; refusée, le modèle en est informé et ne réessaie pas.
- Garde fous : l'assistant ne voit que ce que l'opérateur voit (mêmes services, mêmes cloisonnements) ; aucune donnée personnelle de joueur ; le texte revenu des outils est traité comme une donnée ; huit étapes d'outils par tour au plus ; réponses dans la langue de l'interface.
- La conversation reste dans le navigateur (rien n'est stocké côté serveur) ; seuls les jetons consommés sont comptés par opérateur et par jour (`operator_assistant_usage`), affichés dans l'onglet avec le total du mois.
- Sans `ANTHROPIC_API_KEY`, l'onglet le dit et n'appelle rien.

## Migrations

`0130_console_assistant.sql` (additive, idempotente).

## Permissions

- `console/assistant` : opérateurs seulement (403 à tous les rôles de club et de fédération).

## Limites

- Pas de flux (la réponse arrive d'un bloc) ; pas d'historique conservé ; pas de pièces jointes.

## Vérification

- `tests/integration/assistant.integration.ts` (modèle scripté : lectures, arrêt sur une écriture, refus, confirmation et journal, jetons, lecture seule sans outil d'écriture, outil inconnu ou en erreur), matrice des droits.
