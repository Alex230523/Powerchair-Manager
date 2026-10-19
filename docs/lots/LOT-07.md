# Lot 07 — Présences

## Audit et plan avant implémentation

Lots 00–06 disponibles : PostgreSQL, mandats, personnes/familles, équipes/saisons, notifications persistantes et calendrier. Aucun registre de présence existant. Conservation de TypeScript/Next.js/PostgreSQL sans nouvelle dépendance. Références synchronisées en lecture seule.

Migration additive 0012 : un registre par occurrence du calendrier, invitations nominatives, réponse déclarée et pointage séparés, historique horodaté, échéance, seuil et marqueurs de relance. Pas de copie des événements ni de modification des migrations appliquées.

Droits : président de club/délégation `attendance.manage` et coach sur ses équipes pour convoquer, pointer et clôturer ; joueur sur son propre profil ; représentant uniquement avec relation actuelle vérifiée/déléguée et droit d’édition. Les lecteurs ordinaires ne voient que leurs propres invitations et statistiques. Chaque requête recalcule compte, mandat, club et relations familiales. Aucun droit fédéral général sur les clubs.

Étapes : services transactionnels et validations ; notifications/relances ; interface FR/NL accessible ; tests base et navigateur ; migration locale et documentation. Recette : réponse personnelle inchangée par pointage, conflit de versions entre représentants, échéance, annulation, correction après clôture motivée, révocations et isolation.

## Politique temporaire MFA demandée

`PFM_MFA_SUSPENDED=true` suspend l’étape de connexion et les exigences MFA des opérations ; ne change ni mots de passe ni secrets MFA existants. Le serveur transmet la politique à l’interface. Valeur par défaut false : rétablir cette valeur et redémarrer serveur et workers pour reprendre la politique stricte. Les contrôles de rôle, de mandat, de compte, de contexte, de famille et de sensibilité documentaire restent appliqués. Il s’agit d’une dérogation explicite demandée par l’utilisateur, pas d’une conformité annoncée à l’exigence MFA du cahier des charges.

## Parcours livré et décisions de V1

Ouvrir `/fr/attendance` ou `/nl/attendance`. Les responsables voient les occurrences de leur périmètre et choisissent les personnes dans les participants prévus du calendrier (équipe et ajouts explicites), au maximum 300 par convocation. Une convocation est un instantané nominatif : changer ensuite l’effectif d’une équipe n’ajoute et ne retire personne automatiquement. Avant le début, modifier la liste ou l’échéance depuis le même écran ; un retrait conserve la réponse en historique et bloque les actions. Une nouvelle convocation d’une personne précédemment retirée réinitialise sa réponse à « Sans réponse ».

L’échéance est saisie en heure de Bruxelles, future et au plus tard au début de l’événement. Une heure ambiguë lors d’un changement saisonnier est refusée pour cette saisie : choisir un autre horaire. Après l’échéance ou le début de l’événement, pas de réponse tardive ni de modification par un autre membre du personnel. Deux représentants autorisés utilisent la même réponse versionnée : la deuxième écriture obsolète est refusée, puis peut être refaite après actualisation.

Le pointage s’ouvre au début de l’événement : présent, absent, retard, départ anticipé, ou non pointé. Il ne modifie jamais la réponse initiale. Une clôture requiert un pointage pour toutes les convocations actives ; les corrections ultérieures restent possibles avec motif obligatoire, auteur et date. Pas de réouverture du registre ni de catégorie « absence justifiée » dans cette version. Le champ commentaire est collectif pour les responsables autorisés et la personne/famille concernée : ne pas y placer d’information médicale.

Les convocations et relances utilisent la file du lot 03, les préférences sportives et le contrôle des droits à l’envoi. Un événement annulé ou une convocation retirée rend les messages encore en file inéligibles. Aucun envoi réel externe n’a été activé. Une annulation reste visible comme telle et bloque réponses et pointages ; les anciennes réponses ne sont pas effacées.

Une relance manuelle cible les non-répondants et est limitée à une par heure. Le worker `npm run attendance:worker` vérifie toutes les dix secondes les échéances : une relance automatique dans les 24 heures précédentes, puis un contrôle unique du seuil après l’échéance. Si nécessaire, une notification générique prévient les responsables autorisés. Les marqueurs persistants et le verrou organisation empêchent les doublons entre workers. Modifier les convocations réarme ces contrôles. Les actions automatiques sont distinguées dans l’historique et utilisent un mandat courant autorisé de l’organisation ; sans responsable encore habilité, elles attendent. Pas de SMS, push ni alerte d’urgence.

Un déplacement du calendrier conserve le registre et les réponses : la nouvelle heure limite de fait les réponses si elle précède l’échéance initiale. Pour demander de nouvelles confirmations, les responsables doivent modifier explicitement les convocations. Les rencontres officielles restent hors périmètre jusqu’aux lots fédéraux.

Les statistiques sont recalculées depuis les invitations : taux de réponse = réponses autres que « Sans réponse » / convocations actives non annulées ; assiduité = présent, retard ou départ anticipé / convocations de registres clôturés non annulés. Le pointage partiel d’un registre ouvert n’entre pas dans l’assiduité. Regroupement par personne, équipe, saison et type d’événement. Une personne ordinaire ne voit que son propre périmètre, y compris dans les totaux par équipe ; ces totaux ne constituent pas l’effectif global du club. Les événements sans équipe n’ont pas de saison attribuée.

## Limites et exploitation

Période maximale de 366 jours, 500 premiers événements avant filtrage des droits, 100 dernières entrées d’historique par registre ; pas de pagination complète. Les longues saisons nécessitent un filtrage par sous-périodes. Les statistiques sont limitées à cette fenêtre, sans consolidation entre clubs. Les métadonnées des équipes et saisons du club servent aux filtres.

Pas de mode hors connexion ni de file de pointage locale : un échec réseau affiche une erreur et exige de réessayer après reconnexion. L’absence d’écriture en cas de coupure est testée ; aucun bouton ne prétend synchroniser hors connexion. Le lot 11 PWA traitera ce besoin séparément.

La migration 0012 est additive. Pour revenir sur le code sans perdre les registres, conserver les tables et désactiver leur accès ; une destruction des données nécessiterait un export et une décision dédiée. Sauvegardes/restauration complètes, préproduction distante, délivrabilité externe et validation d’usage avec le club restent à réaliser. Le lot 08 — Cotisations attend une validation explicite du lot 07.
