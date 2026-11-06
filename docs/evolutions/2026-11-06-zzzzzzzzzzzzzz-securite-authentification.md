# Sécurité : authentification défaillante

Audit du 06/11/2026 : peut-on entrer dans un compte, en créer un sans y avoir droit, ou garder un accès qui aurait dû se fermer ?

## Faille trouvée et corrigée : l'inscription sans invitation

L'inscription publique n'est permise qu'avec une invitation envoyée à la même adresse (vague 16) : c'est ce qui prouve qu'on possède la boîte mail. Le contrôle lisait l'adresse de la requête avec `pathname.endsWith("/sign-up/email")`. Or le routeur de Better Auth ignore les segments vides : `/api/auth/sign-up/email/` (barre finale) atteint la même inscription sans passer ce contrôle. Un compte créé ainsi, à une adresse qui n'a pas encore de compte, pouvait notamment prendre l'adresse d'un opérateur de `PFM_OPERATOR_EMAILS` et ouvrir la console avec le rôle de propriétaire.

Correctif, à deux niveaux :
- la route lit le chemin comme le routeur (décodé, en minuscules, sans segments vides ; un chemin qu'on ne peut pas décoder est traité comme une inscription) ;
- l'invitation est vérifiée **une seconde fois dans Better Auth**, après son propre routage (`hooks.before` sur `/sign-up/email`), quelle que soit la forme de l'adresse. Les comptes créés côté serveur (page d'accueil d'une invitation, scripts, tests) ne passent pas par une requête et ne sont pas concernés.

## Durcissements

- **Forçage d'un compte depuis plusieurs machines** : Better Auth limite les essais par adresse IP ; s'y ajoute maintenant une limite par compte. Après **dix mots de passe faux en quinze minutes** pour une même adresse e-mail, d'où qu'ils viennent, la connexion est refusée (`TOO_MANY_ATTEMPTS`, message traduit) jusqu'à ce que les plus anciens aient quinze minutes ; un bon mot de passe remet le compte à zéro. L'adresse n'est gardée qu'en empreinte (`auth_failure`). La réponse ne dit jamais si le compte existe.
- **Réinitialisation** : trois e-mails de réinitialisation au plus en cinq minutes par adresse IP (pas de boîte inondée), cinq essais de lien.
- **Départ d'un opérateur** : ses clés MCP sont révoquées et refusées dès l'entrée (avant, elles échouaient outil par outil), ses accès de support en cours sont clos (mandat révoqué, contexte effacé).

## Vérifié sans faille

- Mots de passe de 12 caractères au moins, hachés par Better Auth ; sessions de 24 heures prolongées à l'usage (12 heures maximum pour la console) ; toutes les sessions fermées à la réinitialisation ; cache des sessions désactivé, donc une session révoquée s'arrête au prochain appel.
- Un compte désactivé n'ouvre plus de session, et ses sessions existantes sont supprimées et refusées (`u.active` contrôlé à chaque appel).
- Cookie de session `HttpOnly`, `SameSite=Lax`, `Secure` en HTTPS ; toutes les routes qui modifient avec un cookie vérifient l'origine (CSRF) ; aucune route GET ne modifie.
- Invitations, transferts, liens d'inscription, agendas, reçus : jetons aléatoires de 256 bits, hachés, à durée limitée ; le lien d'inscription sans mot de passe est refusé aux comptes du staff.
- Clés d'API, de l'opérateur et des connecteurs : hachées, comparées en temps constant, limitées par minute ; secret des tâches comparé en temps constant ; secrets de configuration sans valeur par défaut.
- Aucune énumération : l'inscription refuse de la même façon qu'un compte existe ou non (invitation requise), la réinitialisation répond pareil.

## Hors de cet audit

La double authentification reste retirée (décision prise plus tôt). Une vérification des mots de passe connus pour avoir fuité (service *Have I Been Pwned*, par k-anonymat) serait un ajout utile avant la production.

## Garde-fous

- `tests/auth-safety.test.ts` : toutes les formes de l'adresse d'inscription reconnues ; contrôle d'invitation devant et dans la bibliothèque ; réglages protecteurs (longueur des mots de passe, sessions, réinitialisation, limites) ; contrôle d'origine sur chaque route qui modifie avec un cookie ; départ d'un opérateur.
- `tests/integration/secu-auth.integration.ts` : verrou par adresse (casse, fenêtre, remise à zéro, empreinte seulement), invitation exacte et valide, clés et accès d'un opérateur qui part.
- `tests/audit/access.spec.ts`, contre le serveur réel : six formes de l'inscription sans invitation (aucun compte créé), dix mauvais mots de passe puis le bon (refusé), cookie `HttpOnly` et `SameSite`, session inutilisable après la déconnexion, réinitialisation identique pour un compte existant ou non, requête d'un autre site refusée.
