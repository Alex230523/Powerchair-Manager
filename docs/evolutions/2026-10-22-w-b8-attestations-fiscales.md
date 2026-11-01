# B8 : attestations fiscales, activées par un réglage oui/non (22 octobre 2026)

Document « fonctionnalités manquantes » du 22 octobre, point B8. Seule une ASBL agréée par le SPF Finances peut délivrer des attestations pour dons ; un club sportif ne l'est pas d'office. Chaque club répond donc pour lui-même.

## Décisions
- **Réglage** dans Réglages › Club : « Notre ASBL est agréée pour délivrer des attestations fiscales », **non** par défaut. Sur « non », aucun menu, onglet, bouton, champ ni rappel lié aux attestations n'apparaît (et les appels au serveur refusent). Sur « oui », le numéro et la période d'agrément sont obligatoires, puis l'onglet Finances › Attestations fiscales apparaît (droit argent). Repasser à « non » masque le module sans rien effacer. Une alerte prévient quand l'agrément arrive à son terme (90 jours) ou est échu.
- **Seuls les dons sans contrepartie comptent** : chaque don a une nature (don, don en nature, achat ou souper, sponsoring, cotisation) et seule la première entre dans le cumul. Les dons enregistrés dans les finances (catégorie « Dons ») ou dans les cagnottes sont proposés « à qualifier » et se rattachent une fois à un donateur.
- **Donateur** : personne (numéro de registre national, contrôle modulo 97, né avant ou après 2000) ou entreprise (numéro BCE, contrôle modulo 97). Le numéro national est **chiffré au repos** (`notifications/crypto.ts`, lié au donateur), un hachage à clé sert à repérer les doublons sans l'ouvrir. Il est saisi, affiché et exporté **seulement avec le droit dédié** `tax.identity` (la présidence l'a toujours ; elle le donne à d'autres depuis la page des attestations), et **chaque ouverture est notée au journal d'audit**. Les écrans sans ce droit ne voient que « connu » ou « manquant ».
- **Collecte** : le club envoie au donateur un **formulaire sécurisé** (lien privé, une seule fois, 30 jours) ; le numéro n'est jamais demandé dans la communication d'un virement. **Conservation** : dix ans après le dernier don, le numéro, l'adresse et l'e-mail du donateur sont effacés par la tâche planifiée `documents` ; les attestations restent (elles n'ont jamais contenu le numéro complet).
- **Cumul annuel** par donateur, **seuil** légal réglable (40 € par défaut). **Attestations** émises par lot (une par donateur et par an au-dessus du seuil, numéro séquentiel par année), **PDF** généré par l'application (`src/lib/pdf.ts`, sans dépendance), **envoi par e-mail** d'un lien privé vers le PDF. **Correction** (même numéro, montant recalculé, motif) et **annulation** (motif) gardent l'historique.
- **Belcotax-on-Web** : fichier XML des fiches 281.71 de l'année (originales, rectificatives et annulations), **vérifié avant l'export** (BCE et adresse du club, numéros, montants, adresses, numéros uniques, totaux de contrôle) ; un problème bloquant refuse l'export. **Rapport de contrôle** : attestations prévues, sous le seuil, sans numéro national ou BCE, doublons probables. La structure suit la brochure Belcotax-on-Web du SPF Finances ; elle est **versionnée par année** et se valide contre le **XSD officiel** de l'année avec `scripts/belcotax-validate.mjs` (voir `docs/belcotax/README.md`).
- **Rappel automatique** avant l'échéance de dépôt (fin février, à vérifier chaque année) : nouvelle règle « Dépôt des attestations fiscales » des automatisations (B7), active seulement pour un club agréé : notification, e-mail et tâche pour la présidence, 30 jours avant (réglable).

## Écran
Finances › Attestations fiscales : année des dons et date limite, rapport de contrôle, attestations (émettre, PDF, corriger, annuler, envoyer), dons (à qualifier, ajouter, annuler), donateurs (numéro national connu ou manquant, afficher, saisir, demander au donateur), Belcotax-on-Web (vérifier, télécharger), accès aux numéros nationaux. Page publique `/[locale]/don/[jeton]` pour le donateur.

## Code
- Migration `0070` : réglage et période d'agrément, seuil ; droit `tax.identity` ; `tax_donor`, `tax_gift`, `tax_receipt`, `tax_identity_request` ; type de ressource `tax` dans la file d'e-mails.
- `src/domains/tax/` : `identity.ts` (numéro national, BCE), `rules.ts` (cumul, rapport, échéance, purge), `belcotax.ts` (fichier et vérification), `receipt-pdf.ts`, `schema.ts`, `service.ts` ; routes `/api/tax`, `/api/tax/receipts/[id]`, `/api/tax/export`, et publiques `/api/tax/identity`, `/api/tax/receipt/[jeton]`.
- Composants : `tax.tsx`, `tax-approval.tsx`, `tax-donor.tsx`, textes `tax-copy.ts`. L'onglet Finances suit `tax_approved` (contexte actif, `useScope().taxApproved`).
- Nouveaux messages `tax_receipt` et `tax_identity` (adressés au donateur, sans compte), règle `taxDeadline` dans le catalogue des automatisations.

## Limites connues
- Le XSD officiel ne peut pas être téléchargé depuis l'environnement de développement (réseau fermé) : il est à placer dans `docs/belcotax/<année>/` avant le premier dépôt, et les noms de balises propres à la 281.71 sont à confirmer avec lui.
- Pas de dépôt direct sur Belcotax-on-Web (le fichier se dépose à la main, gratuitement).
- La règle pour le numéro national en 2026 reste à confirmer : un numéro manquant est signalé, pas bloquant.

## Tests
- Unitaires (`tests/b8-tax.test.ts`) : numéro national et BCE, dons qui comptent, deux dons sous puis au-dessus du seuil, rapport (sans numéro, doublons), échéance, alerte d'agrément, purge, PDF valide sans le numéro complet, fichier Belcotax bien formé avec ses totaux, problèmes signalés, validation XSD si le schéma est présent, textes.
- Intégration (`tests/integration/b8-tax.integration.ts`) : club non agréé sans accès, réglage, sponsoring exclu, donateur sans numéro signalé, numéro chiffré et journalisé, formulaire du donateur, attestations émises et envoyées, attestation corrigée, export refusé sans le droit et vérifié avec, annulation dans le fichier, rappel de dépôt, « non » sans effacement, purge, deux clubs.
- Bout en bout (`tests/e2e/tax.spec.ts`) : « non » sans rien, « oui », donateur, don, numéro national, attestation et PDF ; axe et 390 px.
