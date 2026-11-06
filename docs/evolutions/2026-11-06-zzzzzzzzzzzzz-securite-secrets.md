# Sécurité : fuite de clés API et de secrets

Audit du 06/11/2026 : une clé, un mot de passe ou un jeton peut-il sortir de là où il doit rester ?

## Fuite trouvée et corrigée : l'export complet d'un club

L'export complet (Sécurité et données) est un fichier que la présidence garde et transmet (un comptable, un nouveau comité). Il écartait les colonnes `ciphertext`, `secret`, `token_hash` et `password`, mais pas les autres formes. Il contenait donc :
- des **jetons de liens encore valides** : page publique d'une cagnotte (`public_token`), rapport d'un partenaire (`report_token`), inscription à un événement ouvert (`token`), match en direct (`live_token`), capture d'un signalement (`screenshot_token`) ;
- les **numéros nationaux des donateurs** sous forme scellée et leur empreinte (`national_sealed`, `national_hash`), alors que leur lecture à l'écran est réservée et journalisée ;
- des **empreintes** : clés d'API et de connecteurs (`key_hash`), adresses e-mail des désinscriptions (`email_hash`, réversible avec une liste d'adresses).

Correctif : `secretColumn()` écarte toute colonne dont le nom évoque un jeton, un secret, un mot de passe, une valeur chiffrée ou scellée, ou une empreinte ; le manifeste de l'export les liste dans `left_out`. Un test d'intégration parcourt **toutes** les colonnes des tables de club dans la base et échoue si une nouvelle colonne sensible n'est pas reconnue.

## Durcissements

- **Journaux** : `logEvent` retirait les données personnelles ; il retire aussi tout champ nommé comme un secret (`secret`, `token`, `apiKey`, `authorization`, `cookie`, `session`…) et toute valeur qui en a la forme (clés de la plateforme, `whsec_`, `Bearer`, clés Anthropic, Mollie, GitHub, clés privées, adresses de base avec mot de passe). Une fermeture de club en échec journalise le nom de l'erreur, plus son message.
- **CI** : `ci.yml` déclare `permissions: contents: read` ; le jeton du workflow ne peut plus écrire dans le dépôt.

## Vérifié sans fuite

- **Dépôt et historique** : aucun secret de format connu dans les fichiers ni dans les 928 commits de l'historique ; seul `.env.example` a jamais été commité, sans valeur sensible ; le mot de passe de la base locale ne sert qu'en local.
- **Secrets de configuration** : `BETTER_AUTH_SECRET` et `CRON_SECRET` refusent de fonctionner absents ou trop courts (pas de valeur par défaut) ; le secret des tâches est comparé en temps constant ; le mot de passe démo public est refusé en ligne (l'aperçu exige le sien, la production refuse les comptes démo).
- **Navigateur** : aucune variable `NEXT_PUBLIC_` ; `next.config` n'expose que l'adresse publique de l'aperçu ; aucun composant du navigateur ne lit un secret ni n'importe un module qui en lit un.
- **Stockage** : clés d'API, de l'opérateur et des connecteurs MCP hachées (montrées une seule fois) ; secrets de webhooks, numéros nationaux, messages en attente et documents chiffrés (AES-256-GCM) ; jetons d'invitation, de transfert, d'agenda et de reçu fiscal hachés.
- **Réponses et erreurs** : les erreurs inattendues ne renvoient qu'un code (`UNAVAILABLE`) ; les appels à Claude, GitHub et Mollie gardent leur clé côté serveur et ne renvoient qu'un code.
- **Adresses** : les jetons portés dans une adresse (événement ouvert, cagnotte, reçu) ne partent pas vers un autre site (`Referrer-Policy: strict-origin-when-cross-origin`, `no-referrer` pour les widgets) ; aucune ressource externe n'est chargée.
- **CI** : `pull_request` et non `pull_request_target`, donc aucun secret pour une PR venue d'un fork ; le nom de branche passe par une variable, jamais dans un script.

## Recommandation (non faite ici)

`BETTER_AUTH_SECRET` signe les sessions **et** dérive la clé qui chiffre les données scellées. En cas de fuite, le changer rendrait illisibles les numéros nationaux, les secrets de webhooks et les documents. Une clé de chiffrement distincte (`PFM_DATA_KEY`) avec un identifiant de version dans chaque valeur scellée permettrait une rotation sans perte. À prévoir avant la production.

## Garde-fous automatiques

- `tests/secrets-safety.test.ts` (à chaque lancement des tests) : aucun secret de 13 formats dans les fichiers suivis par git ; `.env*` ignorés sauf l'exemple, sans valeur pour une variable secrète ; aucune `NEXT_PUBLIC_` secrète ni lecture ou import d'un secret dans un composant du navigateur ; journaux nettoyés ; aucun `console.error` d'un message d'erreur ; CI en lecture seule, sans `pull_request_target` ni valeur de la PR dans un script. Vérifié en plantant une clé : attrapée.
- `tests/integration/secu-secrets.integration.ts` : toutes les colonnes sensibles des tables de club reconnues ; un export complet sans aucun jeton. Vérifié avec l'ancien filtre : les deux échouent.
- `tests/audit/access.spec.ts` : chaque réponse lue par chaque rôle est examinée ; un champ secret avec une valeur, un secret de configuration (`BETTER_AUTH_SECRET`, `CRON_SECRET`, clés Anthropic, Mollie, SMTP, VAPID, GitHub) ou le jeton de session d'un autre compte la fait échouer.
