# Vague 17, F1 : formulaires et décisions d'inscription (22 octobre 2026)

Revue du 21 octobre, observations de 23 h, point F1.

## Liste des formulaires
- Le haut de la page Inscriptions devient une carte « Formulaires » : un tableau avec le nom, l'année de création, la saison, le nombre de dossiers reçus et le statut (Ouvert au public, Fermé, Ouvre le…, Fermé depuis le…, Archivé).
- Chaque ligne a des actions en icônes, avec leur nom en infobulle et pour les lecteurs d'écran : Aperçu (le formulaire tel que le public le voit, dans une fenêtre), Réutiliser (copie pour une nouvelle saison), Partager, et « … » (Archiver ou Désarchiver, Enregistrer comme modèle). Les formulaires archivés se cachent derrière une case à cocher.
- Un clic sur le nom affiche les questions du formulaire dans l'éditeur, en dessous.
- L'en-tête n'a plus qu'un bouton : « Nouveau formulaire », qui propose « Partir de zéro » ou « Partir d'un modèle ».

## Modèles neutres
- Le modèle Tigerstorm disparaît (texte, numéro de compte, consentement au nom du club). Trois modèles de la plateforme le remplacent, sans nom de club : « Inscription d'un joueur », « Réinscription », « Inscription à un stage ». La cotisation reste un repère `{cotisation}` rempli depuis le plan de la saison.
- Un formulaire du club peut être enregistré comme modèle du club (nouvelle table `registration_template`, par club) ; ces modèles apparaissent dans « Partir d'un modèle » et se suppriment depuis là.

## Ouvrir au public et partager
- La fenêtre « Partager » commence par l'interrupteur « Ouvert au public », avec des dates d'ouverture et de fermeture facultatives. Un formulaire prend des candidatures s'il est ouvert, non archivé, et si la date du jour (Bruxelles) est entre ces dates : la même règle vaut pour la page publique, le formulaire intégré, le lien invité, les brouillons et la soumission.
- Trois onglets, chacun avec une phrase d'explication et un bouton « Copier » : Lien (adresse publique et QR code à télécharger en PNG pour une affiche), Site web (code iframe, avec la marche à suivre pour WordPress et Wix, et le bouton qui ouvre une fenêtre), Réseaux sociaux (texte d'annonce avec le lien, partage Facebook, WhatsApp et email par simples liens, sans compte connecté).
- Un nouveau formulaire est enregistré fermé : on l'ouvre depuis « Partager ».

## Éditeur de questions
Chaque question est une carte avec 16 px d'espace interne. En haut à droite, séparés des champs : la poignée (glisser, ou flèches haut et bas au clavier), les flèches Monter et Descendre, et la corbeille « Retirer la question N : libellé ». Retirer une question affiche « Question retirée · Annuler » ; un déplacement ou un retrait enlève les conditions qui ne tiendraient plus, l'annulation les remet.

## Décision en un clic
- Sur chaque dossier en attente, dans la liste et dans sa fiche : un bouton rond vert « Accepter » et un rouge « Refuser » (36 px, nom complet « Accepter le dossier de Lucas Martin »), et « … » pour « Liste d'attente » et « Demander un complément ». La liste déroulante d'état et le bouton « Enregistrer la décision » disparaissent.
- Accepter : s'il y a plusieurs équipes dans la saison, une fenêtre propose l'équipe avec ses places libres ; une équipe complète mène à « Accepter quand même » ou « Mettre en liste d'attente ». Une seule équipe : le joueur y entre directement. Un dossier qui ressemble à une fiche existante ouvre sa fiche avec les « Options d'admission ».
- Refuser : une petite fenêtre avec un motif facultatif, envoyé au candidat s'il est rempli. Demander un complément exige d'expliquer ce qui manque.
- Après chaque décision, « Dossier accepté · Annuler » (ou refusé, en liste d'attente, complément demandé). L'annulation passe par le système de la vague 15 (C10) avec un nouveau type `registrationDecision` : elle remet le dossier dans son état, retire la fiche et la personne créées (ou remet une fiche existante comme avant), l'affectation à l'équipe, les profils sportif et d'accompagnement remplis, les suivis, l'invitation du candidat et la fiche du parent créée pour elle. L'email au candidat et l'invitation ne partent qu'après le délai d'annulation : une décision annulée n'envoie rien. L'historique du dossier note « Décision annulée ».
- Une décision peut toujours être changée plus tard depuis la fiche : un dossier refusé peut être repris.

## Base de données
Migration `0051_registration_forms.sql` (ajout seulement) : colonnes `archived`, `opens_on`, `closes_on` de `registration_form`, table `registration_template`, type d'annulation `registrationDecision`.

## Tests
- Unitaires : `tests/wave17-registrations.test.ts` (déplacer, retirer et remettre une question, modèles neutres valides dans les trois langues, aucun « Tigerstorm » dans le code, textes FR/NL/EN), `tests/club-coaches-finance.test.ts`, `tests/wave10.test.ts` et `tests/wave15-undo.test.ts` mis à jour.
- Intégration à deux clubs : `tests/integration/wave17-registrations.integration.ts` (dates d'ouverture, archivage, modèles du club, accepter puis annuler sans email, refus avec motif, fiche existante remise comme avant, un autre club ne peut rien) ; `registrations.integration.ts` suit le motif de refus facultatif.
- Bout en bout : `tests/e2e/registration-forms.spec.ts` (liste et sélection, aperçu, réutilisation, modèles sans Tigerstorm, cartes de questions, copie du lien et de l'iframe, QR code, partage, dates, accepter puis annuler sans email, équipe complète vers la liste d'attente, refus avec motif, axe, 390 px en clair et en sombre) ; `registrations.spec.ts` suit les nouveaux boutons.
