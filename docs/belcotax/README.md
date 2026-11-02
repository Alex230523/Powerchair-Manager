# Belcotax-on-Web : schéma officiel et vérification (B8)

Le fichier des fiches 281.71 est construit par `src/domains/tax/belcotax.ts`, d'après la brochure Belcotax-on-Web du SPF Finances (enveloppe `Verzendingen › Verzending › Aangiften › Aangifte › Opgaven`, zones `v00xx`, `a10xx`, `f20xx`, `r80xx`, `r90xx`, montants en centimes). Les noms propres à la fiche 281.71 (`Opgave32571`, `Fiche28171`, `f71_2060_bedragliberaliteit`) sont regroupés par année dans `layouts`.

L'application vérifie déjà, avant chaque export : numéro BCE et adresse du club, numéro national ou BCE de chaque fiche (contrôle modulo 97), montants, adresses, numéros de fiche uniques et totaux de contrôle. Un problème bloquant empêche l'export.

## Avant le premier dépôt de chaque année

Le schéma XSD officiel n'est pas dans le dépôt : il se télécharge sur la page « Documentation technique » de Belcotax-on-Web (SPF Finances), un fichier par année de revenus.

1. Téléchargez le XSD de l'année (par exemple `belcotax-2025.xsd`).
2. Placez-le dans `docs/belcotax/<année>/` (par exemple `docs/belcotax/2025/belcotax-2025.xsd`).
3. Exportez le fichier de l'année depuis Finances › Attestations fiscales, puis lancez :

```
node scripts/belcotax-validate.mjs 2025 belcotax-281-71-2025.xml
```

4. Si le validateur signale un nom de balise, corrigez l'entrée de l'année dans `layouts` (`src/domains/tax/belcotax.ts`) ; le test `tests/b8-tax.test.ts` valide alors automatiquement chaque export d'exemple contre ce XSD.

## Règles rappelées

- Attestation 281.71 : seuls les dons en argent sans contrepartie, au moins 40 € par donateur et par an (seuil réglable).
- Numéro de registre national du donateur obligatoire depuis les dons de 2024, avec une tolérance pour 2024 et 2025 ; le statut pour 2026 reste à confirmer.
- Le numéro national ne sert qu'à Belcotax, n'est jamais demandé dans la communication d'un virement et est effacé dix ans après le dernier don.
- Dépôt habituellement avant la fin février de l'année suivante (pour les dons 2024, l'échéance était le 1er mars 2025) : à vérifier chaque année.
