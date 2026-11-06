# International (étapes 1 et 2) et console du gestionnaire (étape 1)

Deux chantiers ouverts le 05/11/2026 à partir des notes `claude/architecture-multi-pays.md` et `claude/console-gestionnaire.md` du projet.

## International

### Pays et règlement par fédération

- `country` : 17 pays (code ISO, nom fr/nl/en, devise). `organization.country_code` (Belgique par défaut). La fédération choisit son pays dans la page **Règlement et pays** ; ses clubs prennent le même.
- `federation_policy` : le barème de la fédération en données, versionné (`federation_policy_history`) : indemnité de formation par année et par format (national et international), frais de dossier international, plafonds, amendes proposées (retard, forfait, journée non tenue). Sans ligne, le barème BPCF 2025 s'applique ; « Revenir au barème BPCF 2025 » supprime la ligne, l'historique reste.
- Le code ne connaît plus les montants : `policyFor(c, federationId)` les lit (`src/domains/federation/policy.ts`, `policy-service.ts`). Le marché des transferts, les transferts internationaux et le formulaire d'amende s'en servent. Les constantes exportées par `transfers/schema.ts` et `fines/schema.ts` restent (barème BPCF) pour les textes et les tests.
- Page `/federation/policy`, API `/api/federation/policy`, menu « Règlement et pays » (compétence licences ; lecture seule pour les autres délégués).

### Dossier de transfert international entre deux fédérations

- Dans l'onglet Transferts internationaux, la fédération d'origine choisit la **fédération d'accueil** parmi celles de la plateforme (pays différent) ; le pays du dossier est alors le sien. « Hors plateforme » garde la saisie libre d'aujourd'hui.
- Le dossier envoyé (`international_transfer.status = sent`) apparaît chez la fédération d'accueil dans **Dossiers reçus de l'étranger** : nom, classification, club et fédération d'origine, formation (années × format), indemnité, note. Rien d'autre ne traverse : pas de naissance, de contact, de document.
- La fédération d'accueil **accepte** (en nommant le club d'accueil si elle le connaît) ou **refuse** avec une note. Acceptation : numéro de certificat `CIT-AAAA-0001` par fédération d'accueil et par année. Les deux journaux de commission reçoivent la décision (celle de la fédération d'origine non signée, ses membres signent) ; les présidences et délégués aux licences des deux côtés sont prévenus.
- Statuts : enregistré (hors plateforme), envoyé, accepté, refusé.

## Console du gestionnaire

- `platform_operator` (rôles owner, support, finance, readonly), `platform_action` (journal des interventions), `platform_note` (notes internes jamais visibles par l'organisation).
- Entrée : `PFM_OPERATOR_EMAILS` (adresses des propriétaires) ou une ligne `platform_operator`. Aucun mandat de club n'y donne accès ; la matrice des droits refuse tous les rôles.
- Page `/console`, bandeau propre (jamais le menu d'un club), quatre onglets :
  - **Tableau de bord** : six tuiles (organisations, personnes, activité, santé, support, conformité), par pays, « à faire aujourd'hui » par règles (sans président, inactif 60 jours, saison qui se termine sans suivante, demandes RGPD hors délai, fermetures programmées, clés d'API dormantes, clubs sans accord de traitement), dernières interventions.
  - **Organisations** : recherche, type, pays ; fiche en chiffres, responsables (e-mail seulement pour support et propriétaire), notes internes, interventions.
  - **Supervision** : tâches planifiées, e-mails sur 7 jours, stockage par organisation, dernières migrations, signalements ouverts, demandes RGPD.
  - **Opérateurs** : le propriétaire ajoute un compte existant par e-mail et retire (jamais lui-même).
- Comptages seulement : aucun nom de joueur ne sort de la console (test).
- Pas encore de facturation ni de relances : étape 4 du plan ; la page le dit.

## Migrations

`0125_international.sql`, `0126_console.sql` (additives, idempotentes).

## Permissions

- `federation/policy` : fédération (présidence, délégués aux licences écrivent ; autres délégués lisent) ; 403 aux clubs.
- `console` : 403 à tous les rôles de club et de fédération ; opérateurs seulement.

## Limites connues

- Le dossier international ne crée pas le joueur dans le club d'accueil : le club l'inscrit par le parcours habituel (invitation). La fiche de la personne n'est pas encore une identité globale (étape 3 du plan).
- La console ne suspend pas encore une organisation, n'emprunte pas de contexte, ne facture rien (étapes 3 et 4).

## Vérification

- `tests/international-console.test.ts`, `tests/integration/international.integration.ts`, `tests/integration/console.integration.ts`, `tests/e2e/international-console.spec.ts`.
