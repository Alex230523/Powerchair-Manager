# Un club sans fédération

Demande du 12/11/2026 : un club doit pouvoir utiliser la plateforme sans être rattaché à une fédération.

## Le parcours

1. **La demande.** Sur « Rejoindre la plateforme », une nouvelle carte « Je crée mon club, sans fédération » mène à `/join/club`. Le futur président y donne le nom du club, son pays (Belgique, Pays-Bas, France, Royaume-Uni ou États-Unis), sa ville, son nom, son adresse e-mail, un code de réduction s'il en a reçu un et un mot pour l'équipe, puis accepte les conditions d'utilisation. Aucun compte n'est créé à ce moment.
2. **La confirmation.** Un e-mail part avec un lien valable 7 jours. Tant qu'il n'est pas ouvert, la demande n'arrive nulle part. La réponse du formulaire est toujours la même, que l'adresse soit connue ou non ; un deuxième envoi dans les dix minutes ne renvoie rien, une demande déjà chez l'équipe non plus.
3. **La décision, à la main.** Les opérateurs owner et support sont prévenus par e-mail et lisent la demande dans la console, onglet Organisations, carte « Demandes de club sans fédération ». Le rôle finance la lit sans décider.
   - **Acceptée** : le club est créé sans fédération (avec son pays et sa ville), son président est invité par la plateforme, un abonnement « Club indépendant » commence avec 30 jours d'essai, puis 99 € par an. Le code de réduction de la demande s'applique s'il est encore valable ; sinon le club démarre sans (le président pourra en ajouter un).
   - **Refusée** : la raison écrite par l'opérateur part telle quelle par e-mail.
4. **Le club.** Le président accepte son invitation, puis le contrat de sous-traitance comme tout président de club. Son menu n'a pas les modules qui n'ont de sens qu'avec une fédération : transferts, classification, discipline, circulaires. Il peut demander plus tard son affiliation à une fédération depuis les réglages du club, comme aujourd'hui.
5. **La facturation.** Sept jours avant la fin de l'essai, la présidence reçoit un avis. Le jour venu, la tâche quotidienne émet la facture de l'année (99 €, moins la réduction), à payer sous 30 jours, avec le lien Mollie quand il est configuré ; puis une facture chaque année. Une facture à 0 € (code de 100 %) est marquée payée tout de suite. Les rappels par étapes restent ceux de toutes les factures.

## Codes de réduction

Dans la console, onglet Facturation, carte « Codes de réduction » (owner et finance) : un code de 4 à 30 lettres, chiffres ou traits d'union, une réduction en pourcentage ou d'un montant, sur la première facture, 2, 3, 5 ou toutes, une date limite et un nombre d'utilisations au plus, facultatifs, une note interne, actif ou non. Un opérateur peut aussi appliquer un code à un abonnement en cours.

Le président d'un club sans fédération qui n'a pas encore de code peut en saisir un sur « Abonnement à la plateforme ». Un code inconnu, expiré, épuisé ou désactivé reçoit la même réponse, et un président ne peut en essayer que 10 par heure (compteur `user-code`) : les codes ne se devinent pas.

## Choix

- La facture reste en euros, aussi pour le Royaume-Uni et les États-Unis (Mollie encaisse en euros).
- Aucune demande ne crée de compte : le compte naît quand le président accepte l'invitation, comme pour un club créé par une fédération.
- L'invitation envoyée par la plateforme n'est valable que si son opérateur est toujours owner ou support, pour un club sans fédération, et pour le seul rôle de président sans droit en plus. Une invitation marquée « plateforme » par quelqu'un d'autre est refusée à l'acceptation.
- Les demandes jamais confirmées sont effacées après 7 jours, les demandes refusées après un an. Les demandes acceptées restent liées à leur club.
- L'adversaire d'un match reste un texte libre : un club sans fédération joue contre qui il veut.
- Quand un club sans fédération rejoint une fédération, son abonnement continue : l'opérateur le termine à la main dans la console s'il y a lieu.

## Base de données

Migration `0144_independent_club.sql` : tables `club_request` et `billing_discount`, formule `club-independant` (9 900 centimes par an), colonnes `trial_ends_on`, `auto_invoice`, `discount_id`, `discount_cycles_left` sur `billing_subscription`, `discount_cents` et `discount_code` sur `billing_invoice`, `issued_by_platform` sur `invitation`. Tout est additif et rejouable.

## Garde-fous

- `tests/club-independant.test.ts` : pays ouverts, conditions acceptées, piège à robots, codes en capitales et d'un seul type, réduction jamais plus grande que la facture, dates de la période, menu sans les modules fédéraux, textes dans les trois langues sans tiret long, compteurs des routes.
- `tests/integration/club-independant.integration.ts` (club A affilié, clubs sans fédération) : même réponse quoi qu'il arrive, un lien à la fois, confirmation, opérateurs prévenus, le président du club A ne lit ni ne décide rien, finance ne décide pas ; codes créés par owner et finance, uniques ; acceptation (club, essai de 30 jours, code, invitation de la plateforme, journaux) ; invitation « plateforme » forgée ou d'un opérateur révoqué refusée ; avis de fin d'essai une seule fois, facture à moitié prix puis au plein tarif un an plus tard ; code saisi par le président une fois, facture à 0 € payée ; refus avec raison envoyée ; purge des demandes non confirmées.
- `tests/e2e/club-independant.spec.ts` (390 px, axe) : la demande avec un code, la confirmation par le lien de l'e-mail, le code créé dans la console, la demande acceptée.

## À faire par l'exploitant

- Rien de nouveau dans le planificateur : la tâche `reminders` envoie déjà les rappels des factures ; elle émet aussi les factures de fin d'essai et purge les demandes.
- Donner à l'équipe les codes de réduction à distribuer, depuis la console.
- Relire les conditions d'utilisation pour la formule à 99 € par an (essai, renouvellement, résiliation).
