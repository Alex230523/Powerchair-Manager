# Vague 9 : communication du club, fils de discussion protégés, matériel, export sélectif, copie de semaine (20 octobre 2026)

Dernière vague des reprises de PRÊT, adaptées au powerchair football. Migration additive `0028_communication_equipment.sql`.

## Correction importante : des mails ne partaient pas

Le contrôle fait juste avant l'envoi (le worker vérifie que le destinataire a toujours le droit de recevoir le mail) ne connaissait pas plusieurs types de messages. Résultat : ils étaient **annulés en silence** au lieu de partir.

- Rappels de cotisation et de documents (vague 1) : maintenant envoyés à la personne concernée, à ses représentants, ou à l'adresse notée sur sa fiche quand personne n'a de compte. Un parent qui n'est plus représentant ne reçoit plus rien.
- Formations des coachs, matchs et désignations, licences : envoyés aux comptes qui ont toujours un mandat dans l'organisation.
- Lien d'inscription sans mot de passe (vague 4) : envoyé tant que le lien est valable.

Le test d'intégration de la vague 8 sur les absences annoncées échouait aussi sur `main` (il convoquait des joueurs qui ne faisaient pas partie de la séance) : corrigé.

## Communication (menu Vie du club)

Page **Communication**, module « Messagerie ». Accès : la newsletter, les groupes, les anciens et l'expéditeur demandent le droit « Notifications » (président par défaut) ; les mails d'événements sont ouverts à qui organise l'événement (gestion du calendrier ou coach de l'équipe).

- **Expéditeur** : le nom affiché et l'adresse de réponse du club. Les mails partent toujours de l'adresse de la plateforme (sinon ils finissent en indésirables) ; la réponse arrive chez le club. Sans adresse de réponse, c'est l'adresse de contact du club.
- **Groupes de destinataires** enregistrés : joueurs, parents et représentants, coachs, bénévoles, comité et staff, anciens, limités à certaines équipes ou à tout le club, plus des personnes ajoutées à la main. Un groupe est recalculé à chaque envoi.
- **Newsletter par blocs** : titre, texte, bouton (lien https), liste d'événements ouverts à tout le club, séparateur. Brouillon, aperçu fidèle, puis envoi avec confirmation. Chaque adresse reçoit un seul mail.
- **Désinscription** : chaque newsletter contient un lien personnel (page publique « Nouvelles du club »). Une personne désinscrite ne reçoit plus de newsletter ; les messages liés à ses inscriptions et activités continuent. Le club ne peut pas lever une désinscription demandée par la personne ; il peut lui même marquer « ne plus écrire ».
- **Anciens** : les personnes parties du club, avec leur statut (reçoit les nouvelles, désinscrit, pas d'adresse). Pour leur écrire : « Inclure les anciens » dans une newsletter.
- **Mails préparés avant un événement** : objet et texte écrits à l'avance, champs remplis à l'envoi ({name}, {event}, {date}, {place}), date d'envoi choisie (par défaut deux jours avant à 18 h). Si l'événement change (heure, lieu) ou est annulé, le mail passe en **« À relire »** et ne part pas : l'écran montre ce qui a changé, puis « Relire et confirmer ». Envoi automatique par le worker des présences (`npm run attendance:worker`), ou « Envoyer maintenant ». Accessible aussi depuis le calendrier : bouton « Préparer un mail » sur un événement.
- **Mineurs** : un mineur est toujours écrit via ses représentants (sa propre adresse seulement si personne ne le représente). Les personnes aidées (adulte avec un représentant) reçoivent le mail, leurs aidants aussi.

## Fils de discussion protégés (Messagerie)

- Par équipe, deux fils ouverts par le coach ou le président : **Équipe** (coachs, joueurs adultes, parents des jeunes joueurs) et **Parents** (coachs et parents).
- **Protection des mineurs** : un joueur mineur n'est jamais seul dans une conversation privée avec un adulte. Ses représentants y sont ajoutés automatiquement (marqués « représentant ») ; sans représentant ayant un compte, la conversation est refusée. Les mineurs ne sont pas dans les fils d'équipe : leurs parents lisent pour eux.
- **Signalement** : chacun peut signaler un message (motif et commentaire). Le président ou les personnes qui gèrent les membres voient les signalements, masquent le message (il reste dans l'historique, lisible par la modération seulement) ou le gardent, et peuvent verrouiller un fil.

## Matériel

- **Lieu de rangement** sur chaque fauteuil, avec les lieux déjà utilisés proposés.
- **Petit matériel** : ballons, premiers secours, batteries, chargeurs, pièces, maillots, protections, outils. Quantité, rangement, date d'expiration avec alerte (expiré, dans les 30 jours). Géré par le responsable matériel, lisible par les coachs.
- **Souhaits d'achat** : un coach ou le responsable matériel propose (quoi, pourquoi, quantité, prix estimé, lien) ; le président ou le trésorier valide ou refuse avec un mot ; l'achat est ensuite noté. Celui qui a demandé peut retirer sa demande tant qu'elle attend.

## Export sélectif

Dans la liste des joueurs et des coachs, bouton **Exporter** : choix des colonnes (nom, naissance, âge, email, téléphone, entrée, statut, équipes, fonctions, numéro, poste), puis **Excel**, **CSV** ou **version imprimable** (enregistrable en PDF). L'export suit les filtres affichés et reste soumis au droit « Exporter les joueurs » ; chaque export est tracé dans le journal. Le fichier Excel ne contient que du texte : rien ne peut s'y exécuter comme une formule.

## Calendrier

- **Dupliquer** un événement : le formulaire s'ouvre avec ses informations, une semaine plus tard ; il suffit d'ajuster la date.
- **Copier une semaine** (vue semaine) vers une autre semaine, pour toutes ses équipes ou une seule. Chaque événement passe les mêmes contrôles qu'un nouvel événement ; ceux qui ne peuvent pas être copiés (lieu déjà pris, hors saison, pas votre équipe) sont listés, les autres sont créés. Un double clic ne copie pas deux fois.

## Tests

- Unitaires (`tests/wave9.test.ts`) : choix des destinataires (mineurs, représentants, aidants, doublons), rendu de la newsletter (tout est échappé, liens https seulement), en-tête d'expéditeur protégé, état d'un mail d'événement, champs remplis, expiration du matériel, colonnes d'export, fichier Excel relu, page imprimable échappée, dates de la copie de semaine, textes identiques en FR/NL/EN et sans tiret long.
- Intégration (`tests/integration/wave9.integration.ts`) : rappels et mails de formation réellement envoyés (avec le nom du club et l'adresse de réponse), refus pour un parent qui ne représente pas la personne, groupes et newsletter avec désinscription, mail d'événement retenu puis envoyé après relecture, protection des mineurs et modération, souhaits d'achat validés par le trésorier, copie de semaine avec conflit et sans doublon, export par colonnes.
- Bout en bout : chaque onglet de Communication, un groupe, un brouillon de newsletter et son aperçu, la page de désinscription, la messagerie et le matériel, avec contrôle axe.

## Limites

- Les mails partent toujours de l'adresse de la plateforme ; seuls le nom affiché et l'adresse de réponse sont propres au club.
- Pas de pièce jointe ni d'image importée dans la newsletter (un bouton peut pointer vers un document en ligne).
- Une newsletter part vers 2000 adresses au plus ; au delà, découper en plusieurs groupes.
