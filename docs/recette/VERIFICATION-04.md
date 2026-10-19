# Recette du lot 04 — 19 octobre 2026

## Résultats exécutés

- Migration additive 0009 appliquée à PostgreSQL local, puis second passage sans duplication ; `npm run db:test` réussi. Les données de Club pilote sont conservées.
- `npm run check` : lint et TypeScript strict réussis, 18 tests unitaires passants, dont quatre nouveaux scénarios sur champs conditionnels, consentement, types de réponses et pièces obligatoires.
- `npm run test:integration` : 85 tests passants dans quatre schémas temporaires PostgreSQL, dont 25 scénarios inscriptions et les 60 scénarios des lots précédents.
- `npm run test:e2e:db` : 11 tests navigateur passants avec compilation de production. Après les derniers ajustements de présentation, `npm run test:e2e:db -- registrations.spec.ts` a également réussi : le parcours étendu crée la campagne suivante par le bouton de duplication, avec conservation des questions.
- La première relance de compilation a dépassé le délai de 180 secondes ; aucune erreur fonctionnelle n’a été masquée. Le délai de démarrage de recette a été porté à 300 secondes et les relances ont compilé et terminé avec succès.
- Contrôles axe ciblant WCAG 2.2 AA réussis pour les écrans de gestion et le formulaire public en FR/NL, puis pour l’espace candidat et le dossier rempli. Largeur 320 px contrôlée sans débordement. Capture `test-results/registrations.png` inspectée visuellement. Ces contrôles automatiques ne constituent pas une certification.
- Pages locales `/fr/registrations` et `/fr/registrations/mine` : HTTP 200. Le worker final est démarré en mode local ; aucun email externe n’est envoyé.
- Aucune nouvelle dépendance ajoutée pour ce lot. La CI existante inclut migrations, contrôle statique, tests PostgreSQL et E2E ; elle n’a pas été exécutée sur GitHub.

## Parcours navigateur réellement exercé

Créer un compte responsable avec MFA et un compte candidat sans mandat de club ; créer un formulaire par l’éditeur avec consentement et pièce facultative, puis le publier. Lire les aperçus publics FR/NL et vérifier les en-têtes : widget intégrable, formulaire protégé contre l’encadrement.

Préparer une candidature familiale, confirmer les coordonnées, enregistrer un consentement, déposer et télécharger une pièce privée, puis soumettre. Ajouter une note interne côté club, demander un complément et vérifier que le candidat voit la réponse mais jamais la note. Soumettre à nouveau, placer en liste d’attente, admettre avec affectation et constater une seule fiche membre. Vérifier le filtre des admissions des 14 derniers jours et le suivi documents/cotisations explicitement différé.

Dupliquer le formulaire vers une nouvelle saison depuis l’interface, choisir la candidature précédemment acceptée, constater le nom et la date de naissance préremplis et préparer le second dossier sans effacer le premier. Vérifier également le refus d’une écriture venant d’une autre origine.

## Garanties vérifiées sur PostgreSQL

Publication sans exposition d’informations privées ; vérification d’adresse et MFA administrative ; délégation explicite à un secrétaire, refus d’un coach non habilité ; isolation de deux clubs, de deux candidats et de leurs pièces ; révocation immédiate d’un mandat ; protection contre les changements de contexte.

Brouillon idempotent, double soumission refusée, conditions/consentement et pièces obligatoires validés, snapshot conservé après modification du formulaire, détection des versions obsolètes et correction des coordonnées avant soumission. Les brouillons non soumis, y compris retirés, restent invisibles au club. Une pièce d’un champ masqué est supprimée avant partage.

Compléments et resoumission historisés, notes internes exclues de la réponse candidat, motif obligatoire pour refus/complément, transitions finales protégées. Capacité sérialisée malgré deux décisions concurrentes, promotion de liste d’attente, admission transactionnelle et absence de création partielle si l’équipe est invalide.

Sélection d’une fiche existante exigée en cas de correspondance ; impossibilité d’une deuxième admission pour la même fiche/saison ; réinscription reprenant la même identité et refusant une substitution ; joueur autonome réutilisant son identité de connexion sans compte parent ou mandat automatique. Consentements et pièces non recopiés lors du renouvellement. Intentions documents/cotisation persistantes sans créance fictive.

Notification réelle d’un déposant non encore membre, via la file locale persistante ; absence de naissance dans le contenu email ; fichiers contrôlés et accès refusé à un autre candidat ou club ; leurre anti-robot et limitation persistante par compte.

## Limites de la recette

Les schémas et bases de test sont aléatoires et supprimés par les scripts. Aucun faux candidat, membre ou formulaire n’est ajouté à Club pilote.

Préproduction distante, délivrabilité externe, analyse antivirus, signature certifiée, lecteurs d’écran manuels et navigateurs autres que Chromium ne sont pas validés. Les pièces ont un contrôle de format et un téléchargement confiné, sans certification de leur contenu. Le dépôt exige un compte vérifié ; le widget ouvre le formulaire sécurisé plutôt que de faire passer une session privée dans une iframe tierce.

Les listes sont bornées et annoncées. Documents, cotisations, calendrier, licences et les autres modules futurs ne sont pas déclarés fonctionnels. Le lot 05 attend la validation explicite du lot 04.
