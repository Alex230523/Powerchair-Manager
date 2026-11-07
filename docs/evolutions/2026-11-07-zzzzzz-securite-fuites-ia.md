# Sécurité : fuites de données vers l'IA

Audit du 07/11/2026 : quelles données de la plateforme partent vers un modèle d'IA, et en partent-elles plus que nécessaire ?

## Où des données partent vers une IA

1. **L'assistant de la console** (API Claude d'Anthropic, aux États-Unis) : ce que lisent ses outils (chiffres, organisations, responsables, tickets de support) est envoyé au modèle.
2. **Le connecteur MCP des opérateurs** : le Claude d'un opérateur (Claude Desktop, Claude Code) reçoit les mêmes résultats.
3. **Le connecteur MCP d'un club** : le Claude du club reçoit équipes, matchs, calendrier et, si le club le choisit, les cotisations nommément.
4. **Les signalements** vont dans un dépôt GitHub privé, que lisent aussi des agents de code.

## Ce qui protégeait déjà

- Aucun outil ne renvoie de donnée de santé, de dossier de joueur ni de numéro national ; le calendrier d'un club sans noms de participants.
- La conversation de l'assistant n'est gardée ni par le serveur (seulement les jetons utilisés) ni dans le stockage du navigateur.
- Un signalement ne transmet un nom et un e-mail que si la personne l'accepte ; les captures masquent les zones sensibles.

## Failles trouvées et corrigées

- **Adresses e-mail envoyées au modèle.** La fiche d'une organisation donnait l'e-mail de ses responsables, la liste des tickets celui de chaque demandeur : l'assistant et le MCP des opérateurs les envoyaient au modèle. Ces champs sont maintenant retirés de tout résultat d'outil, avec les téléphones, IBAN, BIC, numéros nationaux, dates de naissance, adresses, jetons et empreintes.
- **Texte libre des tickets.** Un parent écrit son téléphone, son e-mail, son IBAN ou le numéro national de son enfant dans un message : tout partait tel quel. Ces informations sont masquées dans le texte (`[téléphone]`, `[e-mail]`, `[IBAN]`, `[numéro national]`, `[carte]`) ; les identifiants, dates, montants et numéros de facture restent, les outils en ont besoin.
- **Demandes RGPD.** Les messages d'un ticket « données personnelles » (accès, effacement…), qui parlent souvent de santé ou d'enfants, ne partent plus : le modèle lit le sujet et une phrase qui renvoie à la console.
- **Sous-traitants non déclarés.** Anthropic (l'assistant) et GitHub (les signalements), tous deux aux États-Unis, ainsi que Mollie (paiement des abonnements), ne figuraient pas dans la liste publique des sous-traitants. Ils y sont, avec ce qui part et la région.
- **Rien n'était dit à l'endroit de l'usage.** Le panneau de l'assistant dit ce qui part, où, et ce qui est masqué ; l'écran du connecteur MCP du club dit que ce que lit son assistant part chez son fournisseur, souvent hors de l'UE, et de ne choisir les cotisations nommément que si le club l'accepte.

## À faire par l'exploitant

- Le contrat de sous-traitance prévoit que les clubs sont **prévenus avant l'ajout d'un sous-traitant**. Anthropic, GitHub et Mollie étaient déjà utilisés par le code : la liste est maintenant exacte, mais les clubs existants doivent recevoir l'information (circulaire ou message de la console).
- Côté Anthropic : vérifier que le compte API est couvert par l'accord de traitement des données (DPA) d'Anthropic et ses clauses contractuelles types.
- Ces textes restent des brouillons à faire relire par un juriste.

## Garde-fous

- `tests/ai-data-safety.test.ts` : masquage dans le texte libre (et ce qui doit rester), champs retirés à toute profondeur, tout résultat d'outil masqué (assistant, MCP des opérateurs, MCP des clubs), demande RGPD retenue, rien de la conversation gardé, sous-traitants et textes d'information.
- `tests/integration/secu-ai-data.integration.ts` (club A, club B) : ce que l'assistant envoie vraiment au modèle (le ticket, sans téléphone, e-mail, IBAN ni numéro national ; la demande d'effacement sans un mot de son contenu), ce que rendent le MCP des opérateurs et celui du club (aucun e-mail).

## Vérification

```
npx vitest run tests/ai-data-safety.test.ts
npm run test:integration -- secu-ai-data assistant secu-prompt
```
