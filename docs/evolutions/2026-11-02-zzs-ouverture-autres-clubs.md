# Préparer l'ouverture à d'autres clubs (02/11/2026)

Point 21 de l'avis. Dès qu'un autre club utilise le service, l'exploitant devient son sous-traitant de données. Cette livraison prépare les textes et l'outillage. **Tous les textes sont des brouillons à faire relire par un juriste ; rien n'est présenté comme un avis juridique.** Migration `0110_club_data_care.sql`.

## Documents (`docs/legal/`, pages publiques `/legal/*`)

- Conditions d'utilisation, politique de confidentialité (avec une version courte en tête), contrat de sous-traitance (article 28), liste des sous-traitants ultérieurs avec la région d'hébergement (UE) et la date de mise à jour ; en fr, nl et en. Une seule source : `src/domains/legal/texts.ts`, qui sert aux pages et écrit `docs/legal/*.md` (`npx tsx scripts/legal-docs.ts`).
- Brouillons internes : registre des activités de traitement en tant que sous-traitant, analyse d'impact pour les données de santé et de mineurs, procédure de violation de données avec modèle de notification au club (`docs/legal/internal/`).

## Contrat de sous-traitance

- Acceptation électronique par la présidence, horodatée, versionnée (`DPA_VERSION`) et avec l'empreinte du texte (`club_dpa_acceptance`).
- Un club ouvert par sa fédération (`organization.dpa_required`) n'invite aucun membre avant cette acceptation (`DPA_REQUIRED`) ; un club qui a accepté une version accepte la suivante quand le texte change.

## Outils dans l'application

- **Export complet** par la présidence : archive ZIP (une table par fichier en CSV et JSON, un `README.json` qui documente les tables et les colonnes, et les fichiers des documents et des exercices) ; préparée par une tâche de fond, lien temporaire de 7 jours, chaque étape journalisée. Les colonnes chiffrées ou secrètes ne sortent jamais.
- **Fermeture** : demandée par la présidence (nom du club à retaper), délai de réflexion de 30 jours avec export proposé, annulable ; puis suppression de toutes les données et de tous les fichiers du club, sauf la comptabilité que la loi impose de garder, et certificat de suppression (nombre de lignes supprimées par table, ce qui reste et pourquoi). Table `club_termination` (le nom `club_closure` désigne déjà les fermetures de salle du planning).
- **Droits des personnes** : demande d'accès, de rectification ou d'effacement depuis Réglages › Mes données, transmise au club responsable (notification à la présidence), délai de 30 jours, suivi et réponse dans « Sécurité et données ».
- **Durées de conservation** par catégorie (notifications, journal des actions, documents sensibles expirés, journal des accès aux données de santé), réglables par club dans des bornes ; purge planifiée et journalisée (`retention_purge`).
- **Réglages › Club › « Sécurité et données »** : où sont les données (UE, sous-traitants), qui y accède, derniers accès aux données de santé, version du contrat acceptée, durées, export, fermeture, demandes. Trouvé par la recherche des réglages.

## Vérification

- `npx vitest run tests/data-care21.test.ts`.
- `npm run test:integration` (`tests/integration/data-care21.integration.ts`) : invitation refusée sans acceptation, nouvelle version redemandée, export complet relu, demande d'effacement transmise au bon club, purge planifiée dans les bornes, fermeture annulée puis confirmée, rien ne reste hors comptabilité, deux clubs.
- `tests/e2e/data-care.spec.ts` : pages publiques à 390 px, acceptation, export, demande ; axe.
