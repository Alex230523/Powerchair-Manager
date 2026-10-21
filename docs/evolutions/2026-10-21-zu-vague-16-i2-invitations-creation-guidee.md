# Vague 16, I2 : invitations et création de compte guidée (21 octobre 2026)

Revue du 21 octobre au soir : quand le club ajoute quelqu'un, l'invitation part toute seule, et le lien de l'email ouvre une création de compte guidée, déjà reliée à la fiche.

## Invitations liées à une fiche
- Migration additive `0045_invitation_profile.sql` : une invitation peut nommer la fiche du club que le compte reprend (`profile_id`), l'équipe citée dans l'email (`team_id`), l'enfant pour un parent (`guardian_of`), le prénom utilisé pour saluer (`greeting`), le signalement « Ce n'est pas mon rôle » (`disputed_at`, `disputed_note`) et l'invitation remplacée par « Renvoyer » (`resent_from`). Les clés étrangères composites empêchent de nommer la fiche ou l'équipe d'un autre club.
- `src/domains/access/invite.ts` réunit la création (`inviteProfile`), l'acceptation (`acceptInvitation`, utilisée aussi par « Mon espace »), la page guidée et « Renvoyer ».
- À l'acceptation, le compte reprend la fiche ; pour un parent, le lien familial déclaré devient un lien vérifié (consultation et modification), ou il est créé.

## Quand l'invitation part
- Ajout d'un joueur ou d'un coach (annuaire) : case « Envoyer une invitation par email », cochée par défaut. Adulte : à son adresse. Joueur mineur : le nom et l'email du parent sont demandés ; la fiche du parent et un lien déclaré sont créés, l'invitation part au parent.
- Import Excel : la même case, avec le compte avant l'envoi (« 18 invitations vont partir. »), une invitation par ligne avec une adresse (celle du parent pour un mineur), puis « 18 invitations envoyées. » dans le message final.
- Inscription acceptée : la personne qui a rempli le formulaire et n'a pas encore de profil dans le club reçoit l'invitation (joueur pour elle même, parent pour un enfant, avec sa propre fiche).
- Seul un profil autorisé à inviter (`invitations.create`) déclenche ces envois ; pas de doublon si une invitation valable existe déjà pour la même fiche.
- L'email dit qui invite, comme quoi et dans quelle équipe, et mène à `/[locale]/welcome/[jeton]` (valable sept jours).

## Création guidée (`/[locale]/welcome/[jeton]`)
1. Bienvenue : « Bonjour Camille », le club, le rôle, l'équipe ou l'enfant, l'adresse. « C'est bien moi » ou « Ce n'est pas mon rôle » (avec une note facultative : la personne qui a invité est prévenue, l'invitation attend une correction).
2. Mes informations : prénom, nom, date de naissance (joueur), téléphone, langue, préremplis depuis la fiche.
3. Informations pour le club (joueur et parent) : classification, fauteuil personnel ou du club, consignes de soin (chiffrées, visibles des seules personnes autorisées).
4. Mot de passe deux fois (12 caractères minimum) et politique de confidentialité, puis la personne arrive connectée sur l'accueil.
- Le compte est créé côté serveur : la route publique d'inscription reste fermée (I1). Un compte qui existe déjà avec un mot de passe se connecte puis accepte depuis cette même page ; un compte créé par le lien d'inscription (sans mot de passe) en reçoit un.
- Le lien ne sert qu'une fois ; un lien utilisé, révoqué ou inconnu affiche un message clair.

## Mon espace
La liste des invitations montre « Signalée : ce n'est pas le bon rôle » avec la note, et « Renvoyer l'invitation » : un nouveau lien pour la même fiche, l'ancien cesse de fonctionner. Renvoyer n'est possible que pour ce que le profil pourrait lui même donner.

## Tests
- Unitaires : `tests/wave16-invite.test.ts` (modèles d'email, textes fr/nl/en sans tiret long, majorité, mot de passe et confidentialité, route serveur).
- Intégration à deux clubs : `tests/integration/wave16-invite.integration.ts` (ajout adulte et mineur, refus sans droit d'inviter, création guidée complète, lien parent vérifié, signalement et renvoi, refus entre clubs, import, inscription acceptée). `registrations.integration.ts` compte désormais les fiches joueur, puisque le parent a sa fiche.
- Bout en bout : `tests/e2e/welcome.spec.ts` (les quatre étapes avec axe, mots de passe différents, arrivée connectée, lien déjà utilisé, « Ce n'est pas mon rôle »).
