# Recette du lot 05 — 19 octobre 2026

## Résultats exécutés

- Migration additive 0010 appliquée au PostgreSQL local persistant ; second passage sans duplication et `npm run db:test` réussis. Les comptes ne sont pas artificiellement marqués comme vérifiés et leurs mots de passe restent inchangés.
- `npm run check` : lint sans avertissement, TypeScript strict et 20 tests unitaires réussis.
- `npm run test:integration` : 105 tests réussis sur cinq schémas PostgreSQL temporaires, dont 20 scénarios documentaires. Les 85 scénarios antérieurs restent passants avec la nouvelle politique email.
- `npm run test:e2e:db` : 12 tests navigateur réussis avec compilation de production. Le parcours d’accès exerce réellement un compte non vérifié, MFA, mandats, invitation, révocation et récupération. Les parcours personnes, notifications et inscriptions utilisent également des comptes non vérifiés.
- Le nouveau parcours documents crée deux comptes non vérifiés, configure MFA pour le responsable, crée une demande depuis l’interface, dépose un PDF comme joueur autonome sans MFA, valide la pièce, la télécharge, crée un modèle et génère une deuxième version texte traçable.
- Absence de message auth_verify vérifiée après ces inscriptions ; absence du bouton de vérification vérifiée dans le navigateur. La récupération de mot de passe reste fonctionnelle.
- Les écrans Documents FR/NL et l’écran rempli passent les contrôles axe ciblant WCAG 2.2 AA. Largeur 320 px vérifiée sans débordement. Capture `test-results/documents.png` inspectée visuellement. Ces tests ne constituent pas une certification d’accessibilité.
- Une requête de la bibliothèque peuplée présentait un tri SQL ambigu ; elle a été corrigée et un test de régression couvre maintenant la bibliothèque administrateur avec un partage existant. Le champ mot de passe de configuration MFA possède un libellé explicite pour éviter l’ambiguïté du parcours navigateur après retrait du panneau email.
- Moteur email redémarré avec transport local ; moteur d’échéances documentaires démarré. Aucun fournisseur email ni hébergement externe n’est activé.

## Garanties vérifiées sur base réelle

Contenu chiffré en base, téléchargement fidèle aux octets déposés, compte non vérifié autorisé pour ses propres fichiers, MFA administrative conservée, refus depuis un autre club et après changement de contexte. Dépôt, vérification et validation distincts ; ancienne version conservée, doublon immédiat de dépôt évité, version obsolète refusée, motif requis et archive protégée contre remplacement.

Représentant autorisé en lecture/édition, puis refus après révocation, à la majorité ou lorsque seule la lecture est autorisée. Refus d’un compte désactivé et d’un mandat révoqué. Pièces d’aptitude obligatoirement sensibles, invisibles au personnel sans habilitation explicite ; MFA requise même pour le propriétaire d’une pièce sensible.

Expiration unique, suivi de renouvellement persistant et idempotent, fermeture du suivi après nouvelle validation. Partage privé d’une version validée, révocation immédiate, suppression de l’accès fédéral après remplacement ou expiration, absence d’accès sensible fédéral par le seul partage général.

Règles d’âge et de rôle appliquées sans double demande ; saison d’une règle immuable ; durcissement de sensibilité sur les demandes existantes, sans déclassement rétroactif. Modèles à variables contrôlées, conflits de version détectés, génération d’un fichier texte avec provenance. Reprise d’une pièce d’inscription comme dépôt non validé du même profil, refus sur un autre profil et consommation des seules intentions documents — les cotisations restent en attente.

Annulation d’un email documentaire encore en file lorsque l’autorisation du représentant a été révoquée. Les détails des documents ne sont pas placés dans les aperçus des emails.

## Périmètre et limites

Les jeux de recette sont confinés à des schémas ou bases aléatoires supprimés après exécution. Aucun faux document, règle, joueur ou candidature n’a été ajouté à Club pilote. Les données synchronisées sous sources/ restent inchangées.

Préproduction distante, antivirus, purge, restauration complète, délivrabilité réelle, tests manuels de lecteurs d’écran et navigateurs autres que Chromium restent non validés. Les pièces ont un contrôle de format et un téléchargement privé, sans garantie sur leur contenu ou la qualité de leur émetteur. La génération est textuelle, sans certification de signature ou mise en page PDF.

Les suivis documentaires sont persistants ; le dashboard général n’est pas développé. Les règles officielles dépendant de compétitions/règlements futurs ne sont pas simulées. Le lot 06 n’est pas commencé : validation explicite du lot 05 requise avant la suite.
