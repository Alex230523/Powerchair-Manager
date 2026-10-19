# Vague 5 : présences hors ligne, nettoyage, mobile, relecture néerlandaise, tests (19 octobre 2026)

## Présences hors ligne

- Au bord du terrain sans réseau, le coach continue de cocher les présences : chaque coche est gardée sur l'appareil et la page l'affiche tout de suite (« enregistrée sur l'appareil, envoi au retour du réseau »).
- Au retour de la connexion, les coches partent une par une. Une coche refusée par le serveur (séance modifiée ou clôturée entre-temps) est abandonnée et comptée dans le message ; une coupure en cours d'envoi garde le reste pour plus tard.
- Pour une même convocation, seule la dernière coche est gardée.
- La dernière vue des présences est conservée 24 heures au plus pour rouvrir la page sans réseau ; l'appareil ne stocke que des identifiants et l'état de présence, jamais de données de santé.
- Tout est effacé à la déconnexion (appareil partagé).
- Un service worker met en cache l'interface (pages et fichiers statiques) mais **jamais** les réponses des API : aucune donnée du club n'est servie depuis un cache.

## Nettoyage

- Chargement des données et envoi des commandes regroupés dans `src/components/use-api.tsx` (`useData`, `usePost`), utilisés par les licences, l'arbitrage et les désignations.
- Listes longues affichées par pages de 50 avec « Afficher 50 de plus » : livre de caisse de la trésorerie, répertoires joueurs et coachs.

## Mobile

- Sur écran tactile, les champs passent à 16 px : l'iPhone ne zoome plus la page à chaque saisie (effet secondaire du design plus fin).
- Barres mensuelles des statistiques réorganisées sous 560 px (le mois sur sa ligne), boutons d'action pleine largeur, fenêtres modales plus compactes.
- Un test vérifie qu'à 375 px de large la trésorerie, les licences et le répertoire ne débordent pas horizontalement.

## Relecture néerlandaise

- `npm run i18n:export` produit `docs/traductions/nl-relecture.csv` : chaque texte français avec sa traduction néerlandaise (et anglaise), le fichier source, un statut et une colonne « correction_nl » à remplir. Séparateur « ; » et encodage reconnu par Excel.
- Le script lit les fichiers de textes et les textes placés directement dans les composants (sans exécuter le code des écrans), ainsi que les modèles de notification.
- Export du 19 octobre 2026 : 1 779 textes, aucun texte néerlandais manquant. La relecture porte donc sur la qualité (ton, vocabulaire du powerchair football en Flandre), pas sur des trous.

## Tests

- Unitaires (`tests/wave5.test.ts`) : file d'attente hors ligne (dernière coche gardée, envoi, refus, coupure), instantané limité à 24 heures, effacement à la déconnexion.
- Bout en bout (`tests/e2e/new-pages.spec.ts`) : un compte avec trois profils (président de club, président de fédération, arbitre) ouvre les pages ajoutées par les vagues 1 à 5 (trésorerie et rapport, répertoires, rappels, matchs, licences, calendrier fédéral, RGPD, réglages, statistiques, clubs affiliés, licences fédérales, désignations, formations, espace arbitre). Chaque page doit finir de charger sans erreur et passer les contrôles axe WCAG 2.2 AA.

## Correctif vague 4

La liste des transferts de l'espace fédération lisait une colonne inexistante ; la date de demande est maintenant déduite de l'échéance (7 jours).
