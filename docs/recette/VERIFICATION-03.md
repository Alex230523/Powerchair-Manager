# Recette du lot 03 — 18 octobre 2026

## Résultats exécutés

- Migration 0008 appliquée au PostgreSQL local persistant ; migrations relancées deux fois sans erreur, contrôle db:test réussi. Le club pilote et ses données sont conservés.
- `npm run check` : lint et TypeScript strict réussis ; 14 tests unitaires réussis.
- `npm run test:integration` : 60 tests réussis, dont 23 scénarios notifications et les 37 scénarios des lots précédents. Schémas temporaires supprimés ensuite.
- `npm run test:e2e:db` : 10 tests navigateur réussis avec compilation de production. Le parcours notifications modifie un modèle, prévisualise et sauvegarde, prépare un test personnel dédupliqué, marque la notification comme lue, reprend la file, constate la capture locale puis recharge les préférences persistées.
- Contrôles axe sur notifications FR/NL (règles ciblées WCAG 2.2 AA) réussis, largeur 320 px sans débordement. Le parcours peuplé est aussi contrôlé. Capture `test-results/notifications.png` inspectée visuellement, sans défaut constaté. Ces contrôles ne constituent pas une certification d’accessibilité.
- Vérification/récupération de vrais comptes de test passent par la file persistante et le worker local. Les anciens parcours d’authentification, MFA, mandats, invitations, répertoire, équipes, familles et export restent passants.
- Un serveur SMTP réel limité à 127.0.0.1 reçoit un message de test et son identifiant stable : ce test confirme le protocole et l’acceptation, sans envoi externe.
- `npm audit --omit=dev --json` : aucune vulnérabilité de production signalée au moment du contrôle. Les alertes connues de la chaîne de développement ESLint restent distinctes ; cela ne vaut pas audit de sécurité complet.
- Page locale `/fr/notifications` : réponse HTTP 200. Worker de développement démarré en mode local.

## Garanties exercées sur PostgreSQL

Déduplication persistante, chiffrement et échappement HTML ; réservation concurrente par deux workers sans double envoi ; erreur temporaire et délai de reprise ; plafond de tentatives ; reprise manuelle contrôlée ; résultats SMTP incertains ; expiration des baux ; reprise locale idempotente avec publication atomique des fichiers.

Annulation après révocation d’appartenance, désactivation du compte ou expiration du lien ; masquage d’une notification devenue inaccessible ; autorisation familiale retirée ou majorité atteinte avant lecture/envoi. L’affectation créée par le vrai service personnes prépare la notification dans la même transaction. Les callbacks d’identité tolèrent une transaction encore en cours, puis annulent un lien définitivement absent.

Préférences générales et par canal, sécurité maintenue, changement de préférence avant envoi, absence de rejeu d’un ancien événement après réactivation ; pause des emails conservant la notification interne. Modèles FR/NL indépendants, conflit de version détecté, contenu d’un envoi déjà préparé immuable ; locale néerlandaise réellement enregistrée lors de l’inscription. Administrateur d’un autre club refusé, destinataire limité à lui-même, métadonnées administratives sans liens privés ni contenu chiffré.

Les jeux de test vivent exclusivement dans des schémas et bases aléatoires supprimés par les scripts. Aucun faux membre, équipe ou message de démonstration n’est ajouté à Club pilote.

## Limites et suite

Aucun email externe n’a été envoyé. Fournisseur, domaine expéditeur, délivrabilité, environnement de production, Safari/Firefox et lecteur d’écran manuel restent non vérifiés. Les emails locaux n’établissent pas une réception réelle chez Outlook ou Gmail. La CI est fournie mais non exécutée à distance.

La liste est bornée à 100 notifications et 50 envois, avec indication dans l’écran ; pagination et politique automatique de conservation ne sont pas livrées. Les modules métier futurs et la communication de groupe ne sont pas déclarés fonctionnels.

Le lot 04 n’a pas été commencé. Il attend la validation explicite du lot 03.
