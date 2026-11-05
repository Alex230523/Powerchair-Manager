import type { Draft } from "./drafts";

/**
 * Knowledge centre: the other proposed drafts (G1, G2, G3, G9, G11). Only
 * what has a source is stated as sure; the rest says « à confirmer par la
 * fédération », for the federation to complete before publishing.
 */
const tbc = { fr: "À confirmer par la fédération.", nl: "Te bevestigen door de federatie.", en: "To be confirmed by the federation." };

export const moreDrafts: Draft[] = [
  {
    slug: "who-does-what",
    position: 3,
    audiences: ["player", "guardian", "coach", "staff", "referee", "president", "federation"],
    sources: "FIPFA (fipfa.org ; Wikipédia, « Fédération internationale de powerchair football ») ; Je m'informe, « Fédérations sportives pour personnes porteuses de handicaps ». Partie flamande : à compléter.",
    content: {
      fr: {
        title: "Qui fait quoi",
        summary: "Du club à la FIPFA : qui organise le powerchair football, et qui le soutient.",
        body: `Le powerchair football est organisé en pyramide : chaque niveau s'appuie sur celui du dessous.

[[figure:pyramid]]

## La FIPFA
La Fédération internationale de powerchair football, fondée en 2006, a son siège à Paris. Elle écrit les Lois du jeu, organise la Coupe du monde et fixe les règles de classification. La Belgique en est membre fondateur.

## L'EPFA
L'association européenne de powerchair football organise les compétitions de la zone Europe (clubs et équipes nationales). ${tbc.fr}

## La fédération belge (BPCF)
Elle réunit les clubs, organise le championnat et les coupes, forme et désigne les arbitres, sélectionne l'équipe nationale.

## Les clubs
Ils accueillent les joueurs, entraînent les équipes, prêtent ou achètent les fauteuils de match.

## À côté de la pyramide
- Sportéa : accompagnement du sport adapté. ${tbc.fr}
- ADEPS : l'administration du sport de la Fédération Wallonie-Bruxelles (subsides, formations de cadres).
- Ligue Handisport Francophone : la fédération multisport du sport adapté côté francophone.
- Les pouvoirs subsidiants : communes, provinces, Régions et Fédération Wallonie-Bruxelles, qui financent les clubs et les infrastructures.

> Partie flamande (fédération et administration du sport en Flandre) : à compléter par la fédération.`,
      },
      nl: {
        title: "Wie doet wat",
        summary: "Van de club tot de FIPFA: wie powerchair football organiseert, en wie het steunt.",
        body: `Powerchair football is als een piramide georganiseerd: elk niveau steunt op het niveau eronder.

[[figure:pyramid]]

## De FIPFA
De internationale powerchair-footballfederatie, opgericht in 2006, heeft haar zetel in Parijs. Ze schrijft de spelregels, organiseert het wereldkampioenschap en legt de classificatieregels vast. België is stichtend lid.

## De EPFA
De Europese powerchair-footballvereniging organiseert de competities in Europa (clubs en nationale ploegen). ${tbc.nl}

## De Belgische federatie (BPCF)
Ze brengt de clubs samen, organiseert het kampioenschap en de bekers, leidt scheidsrechters op en duidt ze aan, selecteert de nationale ploeg.

## De clubs
Ze ontvangen de spelers, trainen de ploegen, lenen of kopen de wedstrijdrolstoelen.

## Naast de piramide
- Sportéa: begeleiding van aangepaste sport. ${tbc.nl}
- ADEPS: de sportadministratie van de Federatie Wallonië-Brussel (subsidies, opleidingen).
- Ligue Handisport Francophone: de Franstalige multisportfederatie voor aangepaste sport.
- De subsidiërende overheden: gemeenten, provincies, Gewesten en Federatie Wallonië-Brussel, die clubs en infrastructuur financieren.

> Vlaams deel (federatie en sportadministratie in Vlaanderen): aan te vullen door de federatie.`,
      },
      en: {
        title: "Who does what",
        summary: "From the club to FIPFA: who organises powerchair football, and who supports it.",
        body: `Powerchair football is organised as a pyramid: each level rests on the one below.

[[figure:pyramid]]

## FIPFA
The international powerchair football federation, founded in 2006, has its seat in Paris. It writes the Laws of the Game, organises the World Cup and sets the classification rules. Belgium is a founding member.

## EPFA
The European powerchair football association organises the competitions of the European zone (clubs and national teams). ${tbc.en}

## The Belgian federation (BPCF)
It brings the clubs together, runs the championship and the cups, trains and appoints the referees, selects the national team.

## The clubs
They welcome the players, train the teams, lend or buy the match chairs.

## Beside the pyramid
- Sportéa: support for adapted sport. ${tbc.en}
- ADEPS: the sport administration of the Wallonia-Brussels Federation (grants, coach training).
- Ligue Handisport Francophone: the French-speaking multisport federation for adapted sport.
- Funding authorities: municipalities, provinces, Regions and the Wallonia-Brussels Federation, which fund clubs and facilities.

> Flemish part (federation and sport administration in Flanders): to be completed by the federation.`,
      },
    },
  },
  {
    slug: "competitions",
    position: 4,
    audiences: ["player", "guardian", "coach"],
    sources: "FIPFA (Coupe du monde) ; EPFA (compétitions européennes). Calendrier et formules belges : à confirmer par la fédération.",
    content: {
      fr: {
        title: "Les compétitions",
        summary: "Du championnat de Belgique à la Coupe du monde : les compétitions et comment y accéder.",
        body: `## En Belgique
Le championnat réunit les équipes des clubs affiliés, sur des journées où plusieurs matchs se jouent dans la même salle. Des coupes complètent la saison. Formule, divisions et calendrier : ${tbc.fr}

## En Europe
L'EPFA organise des compétitions pour les clubs et pour les équipes nationales. ${tbc.fr}

## Dans le monde
La FIPFA organise la Coupe du monde des équipes nationales.

## Comment y accéder
- Pour jouer en championnat : être affilié à un club, avoir une licence valide et une classification (PF1 ou PF2).
- Pour les compétitions européennes de clubs : selon le classement national. ${tbc.fr}
- Pour l'équipe nationale : la fédération sélectionne les joueurs.

> Le calendrier des journées et les résultats sont dans l'application (Matchs, Calendrier fédéral).`,
      },
      nl: {
        title: "De competities",
        summary: "Van het Belgisch kampioenschap tot het wereldkampioenschap: de competities en hoe je er komt.",
        body: `## In België
Het kampioenschap brengt de ploegen van de aangesloten clubs samen, op speeldagen waarop meerdere wedstrijden in dezelfde zaal gespeeld worden. Bekers vullen het seizoen aan. Formule, reeksen en kalender: ${tbc.nl}

## In Europa
De EPFA organiseert competities voor clubs en nationale ploegen. ${tbc.nl}

## In de wereld
De FIPFA organiseert het wereldkampioenschap voor nationale ploegen.

## Hoe je er komt
- Om in het kampioenschap te spelen: aangesloten zijn bij een club, een geldige licentie en een classificatie (PF1 of PF2) hebben.
- Voor de Europese clubcompetities: volgens de nationale rangschikking. ${tbc.nl}
- Voor de nationale ploeg: de federatie selecteert de spelers.

> De kalender van de speeldagen en de uitslagen staan in de toepassing (Wedstrijden, Federale kalender).`,
      },
      en: {
        title: "The competitions",
        summary: "From the Belgian championship to the World Cup: the competitions and how to reach them.",
        body: `## In Belgium
The championship brings together the teams of the affiliated clubs, on match days when several matches are played in the same hall. Cups complete the season. Format, divisions and calendar: ${tbc.en}

## In Europe
EPFA organises competitions for clubs and for national teams. ${tbc.en}

## In the world
FIPFA organises the World Cup of national teams.

## How to reach them
- To play in the championship: be affiliated to a club, hold a valid licence and a classification (PF1 or PF2).
- For the European club competitions: according to the national ranking. ${tbc.en}
- For the national team: the federation selects the players.

> The calendar of the match days and the results are in the application (Matches, Federal calendar).`,
      },
    },
  },
  {
    slug: "classification",
    position: 5,
    audiences: ["player", "guardian", "coach"],
    sources: "Lois du jeu FIPFA 2025 (PF1, PF2, deux PF2 au plus sur le terrain) ; règles de classification FIPFA. Déroulé belge : à confirmer par la fédération.",
    content: {
      fr: {
        title: "La classification expliquée",
        summary: "PF1 et PF2, la journée de classification, le réexamen et ce que voit le club.",
        body: `## PF1 et PF2
Chaque joueur reçoit une classe : PF1 pour les joueurs les plus limités physiquement, PF2 pour les moins limités. Une équipe ne peut pas avoir plus de deux PF2 sur le terrain en même temps.

## Une journée de classification
- Le club inscrit le joueur à une journée de classification (page Classification de l'application).
- Des classificateurs formés évaluent le joueur : entretien, examen physique, puis observation avec le fauteuil et le ballon.
- La classe est communiquée au joueur et au club. ${tbc.fr}

## Le réexamen
Une classe peut être revue : le joueur évolue, ou la classe était provisoire. La date du prochain examen figure sur la licence quand elle existe. ${tbc.fr}

## Ce que voit le club
Le club voit la classe et la date du prochain examen, pas le détail médical. La composition d'équipe tient compte de la règle des deux PF2.`,
      },
      nl: {
        title: "De classificatie uitgelegd",
        summary: "PF1 en PF2, de classificatiedag, de herziening en wat de club ziet.",
        body: `## PF1 en PF2
Elke speler krijgt een klasse: PF1 voor de spelers met de meeste fysieke beperkingen, PF2 voor de minst beperkte. Een ploeg mag niet meer dan twee PF2 tegelijk op het veld hebben.

## Een classificatiedag
- De club schrijft de speler in voor een classificatiedag (pagina Classificatie in de toepassing).
- Opgeleide classificeerders beoordelen de speler: gesprek, lichamelijk onderzoek, daarna observatie met rolstoel en bal.
- De klasse wordt aan de speler en de club meegedeeld. ${tbc.nl}

## De herziening
Een klasse kan herzien worden: de speler evolueert, of de klasse was voorlopig. De datum van het volgende onderzoek staat op de licentie wanneer die bestaat. ${tbc.nl}

## Wat de club ziet
De club ziet de klasse en de datum van het volgende onderzoek, niet de medische details. De ploegopstelling houdt rekening met de regel van twee PF2.`,
      },
      en: {
        title: "Classification explained",
        summary: "PF1 and PF2, the classification day, the review and what the club sees.",
        body: `## PF1 and PF2
Each player gets a class: PF1 for the players with the greatest physical limitation, PF2 for the least limited. A team may not have more than two PF2 on the court at the same time.

## A classification day
- The club enters the player for a classification day (Classification page of the application).
- Trained classifiers assess the player: interview, physical examination, then observation with the chair and the ball.
- The class is given to the player and the club. ${tbc.en}

## The review
A class may be reviewed: the player changes, or the class was provisional. The date of the next examination is on the licence when there is one. ${tbc.en}

## What the club sees
The club sees the class and the date of the next examination, not the medical details. The line-up follows the two-PF2 rule.`,
      },
    },
  },
  {
    slug: "safety",
    position: 6,
    audiences: ["coach", "staff", "guardian", "president"],
    sources: "Numéro d'urgence européen 112. Consignes propres au powerchair football : à valider par la fédération.",
    content: {
      fr: {
        title: "Sécurité et urgences",
        summary: "Chute, blessure, fauteuil bloqué, batterie qui chauffe : que faire, qui prévenir, comment déclarer.",
        body: `> En cas d'urgence vitale : appelez le 112.

## Une chute
- Arrêtez le jeu. Coupez le fauteuil.
- Ne relevez pas le joueur tout de suite : demandez-lui s'il a mal, et où.
- En cas de douleur au cou ou au dos, ne le bougez pas et appelez le 112.
- Prévenez le responsable de la séance et les parents.

## Une blessure
- Les consignes de soin du joueur sont sur sa fiche (Soins) : allergies, traitement, personnes à prévenir.
- Gardez la trousse de secours au bord du terrain.

## Un fauteuil bloqué
- Coupez le fauteuil, puis passez en mode manuel (débrayage) s'il en a un.
- Ne forcez pas un fauteuil coincé contre un autre : dégagez d'abord le joueur si besoin, à deux.

## Une batterie qui chauffe
- Arrêtez le fauteuil, éloignez le joueur et les autres personnes.
- Ne touchez pas la batterie. En cas de fumée ou de feu : évacuez et appelez le 112.

## Qui prévenir, comment déclarer
- Le responsable de la séance, puis le club.
- Prévenez la présidence du club : elle fait la déclaration d'assurance.

${tbc.fr}`,
      },
      nl: {
        title: "Veiligheid en noodgevallen",
        summary: "Val, blessure, geblokkeerde rolstoel, warme batterij: wat doen, wie verwittigen, hoe aangeven.",
        body: `> Bij levensbedreigende nood: bel 112.

## Een val
- Leg het spel stil. Zet de rolstoel uit.
- Til de speler niet meteen op: vraag of hij pijn heeft, en waar.
- Bij pijn aan nek of rug: niet verplaatsen en 112 bellen.
- Verwittig de verantwoordelijke van de sessie en de ouders.

## Een blessure
- De zorginstructies van de speler staan op zijn fiche (Zorg): allergieën, behandeling, te verwittigen personen.
- Houd de verbanddoos aan de rand van het veld.

## Een geblokkeerde rolstoel
- Zet de rolstoel uit en schakel over op handmatig (ontkoppelen) als dat kan.
- Forceer geen rolstoel die tegen een andere klemt: haal zo nodig eerst de speler eruit, met twee.

## Een batterij die warm wordt
- Stop de rolstoel, breng de speler en de anderen op afstand.
- Raak de batterij niet aan. Bij rook of vuur: evacueer en bel 112.

## Wie verwittigen, hoe aangeven
- De verantwoordelijke van de sessie, daarna de club.
- Verwittig het clubbestuur: het doet de verzekeringsaangifte.

${tbc.nl}`,
      },
      en: {
        title: "Safety and emergencies",
        summary: "A fall, an injury, a stuck chair, a battery heating up: what to do, whom to tell, how to report.",
        body: `> In a life-threatening emergency: call 112.

## A fall
- Stop play. Switch the chair off.
- Do not lift the player at once: ask whether he is in pain, and where.
- With pain in the neck or back, do not move him and call 112.
- Tell the person in charge of the session and the parents.

## An injury
- The player's care instructions are on his file (Care): allergies, treatment, people to tell.
- Keep the first-aid kit by the court.

## A stuck chair
- Switch the chair off, then put it in manual mode (freewheel) if it has one.
- Do not force a chair caught against another: get the player out first if needed, with two people.

## A battery heating up
- Stop the chair, move the player and the others away.
- Do not touch the battery. With smoke or fire: evacuate and call 112.

## Whom to tell, how to report
- The person in charge of the session, then the club.
- Tell the club's presidency: it makes the insurance claim.

${tbc.en}`,
      },
    },
  },
  {
    slug: "parents-faq",
    position: 7,
    audiences: ["guardian", "player"],
    sources: "Fonctionnement de l'application. Montants et remboursements : propres à chaque club et à chaque mutualité.",
    content: {
      fr: {
        title: "FAQ des parents",
        summary: "Coût, mutuelle, fauteuil, transport, séance d'essai : les questions qu'on nous pose.",
        body: `## Combien ça coûte ?
Le club fixe sa cotisation pour la saison ; elle apparaît dans l'application (Cotisations), avec ses échéances et le paiement par QR code.

## La mutuelle rembourse-t-elle ?
Beaucoup de mutualités remboursent une partie de la cotisation d'un club sportif. Le club peut vous donner l'attestation à remettre. Demandez à votre mutualité ce qu'elle prévoit.

## Faut-il acheter un fauteuil ?
Non pour commencer : la plupart des clubs prêtent un fauteuil de match. Il est attribué au joueur dans l'application (Matériel).

## Et le transport ?
Les déplacements des matchs sont organisés par le club : véhicules, conducteurs et arrêts sont dans l'application (Déplacements).

## Peut-on essayer ?
Oui : demandez une séance d'essai au club. Les journées découverte sont annoncées dans l'agenda.

> Montants, remboursements et prêts dépendent du club et de la mutualité : renseignez-vous auprès d'eux.`,
      },
      nl: {
        title: "Veelgestelde vragen van ouders",
        summary: "Kostprijs, ziekenfonds, rolstoel, vervoer, proefsessie: de vragen die we krijgen.",
        body: `## Hoeveel kost het?
De club legt zijn lidgeld voor het seizoen vast; het staat in de toepassing (Lidgelden), met de vervaldagen en betaling met QR-code.

## Betaalt het ziekenfonds terug?
Veel ziekenfondsen betalen een deel van het lidgeld van een sportclub terug. De club kan u het attest bezorgen. Vraag uw ziekenfonds wat het voorziet.

## Moet je een rolstoel kopen?
Niet om te beginnen: de meeste clubs lenen een wedstrijdrolstoel uit. Hij wordt in de toepassing aan de speler toegewezen (Materiaal).

## En het vervoer?
De verplaatsingen naar wedstrijden organiseert de club: voertuigen, chauffeurs en stops staan in de toepassing (Verplaatsingen).

## Kan je het eens proberen?
Ja: vraag de club om een proefsessie. Kennismakingsdagen staan in de agenda.

> Bedragen, terugbetalingen en uitleningen hangen af van de club en het ziekenfonds: informeer bij hen.`,
      },
      en: {
        title: "Parents' FAQ",
        summary: "Cost, health insurance, chair, transport, trial session: the questions we are asked.",
        body: `## How much does it cost?
The club sets its fee for the season; it is in the application (Dues), with its due dates and payment by QR code.

## Does the health insurance fund pay back?
Many health insurance funds pay back part of a sports club's fee. The club can give you the certificate to hand in. Ask your fund what it offers.

## Must we buy a chair?
Not to start with: most clubs lend a match chair. It is assigned to the player in the application (Equipment).

## And transport?
The club organises the trips to matches: vehicles, drivers and stops are in the application (Trips).

## Can we try?
Yes: ask the club for a trial session. Discovery days are announced in the calendar.

> Amounts, refunds and loans depend on the club and the health insurance fund: ask them.`,
      },
    },
  },
];

type T3 = { fr: string; nl: string; en: string };
/** G12: the proposed lexicon, a short definition each. */
export const draftTerms: { term: T3; definition: T3 }[] = [
  { term: { fr: "Guard", nl: "Guard", en: "Guard" }, definition: { fr: "La protection fixée à l'avant du fauteuil, avec laquelle on frappe le ballon.", nl: "De bescherming vooraan de rolstoel, waarmee je de bal raakt.", en: "The guard fixed at the front of the chair, used to strike the ball." } },
  { term: { fr: "2 contre 1", nl: "Twee tegen één", en: "Two on one" }, definition: { fr: "Faute : deux coéquipiers à moins de 3 m du ballon en même temps qu'un adversaire.", nl: "Fout: twee ploeggenoten binnen 3 m van de bal samen met een tegenstander.", en: "Foul: two team-mates within 3 m of the ball together with an opponent." } },
  { term: { fr: "PF1", nl: "PF1", en: "PF1" }, definition: { fr: "Classe des joueurs les plus limités physiquement.", nl: "Klasse van de spelers met de meeste fysieke beperkingen.", en: "Class of the players with the greatest physical limitation." } },
  { term: { fr: "PF2", nl: "PF2", en: "PF2" }, definition: { fr: "Classe des joueurs les moins limités ; deux au plus sur le terrain par équipe.", nl: "Klasse van de minst beperkte spelers; hoogstens twee per ploeg op het veld.", en: "Class of the least limited players; two at most on the court per team." } },
  { term: { fr: "Kick-in", nl: "Kick-in", en: "Kick-in" }, definition: { fr: "Remise en jeu avec le fauteuil quand le ballon sort sur le côté ; on peut marquer directement.", nl: "Inspelen met de rolstoel wanneer de bal over de zijlijn gaat; je mag rechtstreeks scoren.", en: "Bringing the ball back with the chair after it crosses the side line; a goal may be scored directly." } },
  { term: { fr: "Ramming", nl: "Ramming", en: "Ramming" }, definition: { fr: "Foncer volontairement dans un adversaire : c'est une faute.", nl: "Opzettelijk tegen een tegenstander inrijden: dat is een fout.", en: "Driving into an opponent on purpose: a foul." } },
  { term: { fr: "Rolling road", nl: "Rolling road", en: "Rolling road" }, definition: { fr: "Le banc à rouleaux qui mesure la vitesse d'un fauteuil avant le match.", nl: "De rollenbank die de snelheid van een rolstoel voor de wedstrijd meet.", en: "The roller bench measuring a chair's speed before the match." } },
  { term: { fr: "Zone de but", nl: "Doelgebied", en: "Goal area" }, definition: { fr: "Le rectangle de 8 m sur 5 m devant le but ; trois joueurs d'une équipe n'y vont pas ensemble.", nl: "De rechthoek van 8 m op 5 m voor het doel; drie spelers van een ploeg staan er niet samen.", en: "The 8 m by 5 m rectangle in front of the goal; three players of one team may not be in it together." } },
  { term: { fr: "Coup franc indirect", nl: "Onrechtstreekse vrije trap", en: "Indirect free kick" }, definition: { fr: "Coup franc sur lequel on ne peut pas marquer directement.", nl: "Vrije trap waaruit je niet rechtstreeks mag scoren.", en: "A free kick from which a goal cannot be scored directly." } },
  { term: { fr: "Contrôle de vitesse", nl: "Snelheidscontrole", en: "Speed check" }, definition: { fr: "Le contrôle des 10 km/h, en avant et en arrière, avant le match.", nl: "De controle van de 10 km/u, vooruit en achteruit, voor de wedstrijd.", en: "The check of the 10 km/h, forwards and backwards, before the match." } },
];

type Question = { question: T3; choices: T3[]; answer: number; explanation: T3 };
/** G7: five questions on each rules chapter. */
export const draftQuizzes: Record<string, Question[]> = {
  game: [
    { question: { fr: "Combien de joueurs par équipe sur le terrain ?", nl: "Hoeveel spelers per ploeg op het veld?", en: "How many players per team on the court?" }, choices: [{ fr: "Trois", nl: "Drie", en: "Three" }, { fr: "Quatre, dont un gardien", nl: "Vier, waarvan één doelman", en: "Four, one a goalkeeper" }, { fr: "Cinq", nl: "Vijf", en: "Five" }], answer: 1, explanation: { fr: "Quatre joueurs, dont un gardien ; jusqu'à quatre remplaçants.", nl: "Vier spelers, waarvan één doelman; tot vier wissels.", en: "Four players, one a goalkeeper; up to four substitutes." } },
    { question: { fr: "Quelle est la vitesse maximale d'un fauteuil ?", nl: "Wat is de maximale snelheid van een rolstoel?", en: "What is a chair's top speed?" }, choices: [{ fr: "6 km/h", nl: "6 km/u", en: "6 km/h" }, { fr: "10 km/h", nl: "10 km/u", en: "10 km/h" }, { fr: "15 km/h", nl: "15 km/u", en: "15 km/h" }], answer: 1, explanation: { fr: "10 km/h, contrôlés en avant et en arrière avant le match.", nl: "10 km/u, vooruit en achteruit gecontroleerd voor de wedstrijd.", en: "10 km/h, checked forwards and backwards before the match." } },
    { question: { fr: "Deux coéquipiers à moins de 3 m du ballon avec un adversaire : c'est…", nl: "Twee ploeggenoten binnen 3 m van de bal met een tegenstander: dat is…", en: "Two team-mates within 3 m of the ball with an opponent: that is…" }, choices: [{ fr: "Un 2 contre 1", nl: "Twee tegen één", en: "A two on one" }, { fr: "Autorisé", nl: "Toegestaan", en: "Allowed" }, { fr: "Un penalty", nl: "Een strafschop", en: "A penalty" }], answer: 0, explanation: { fr: "Le 2 contre 1 est sanctionné d'un coup franc indirect.", nl: "Twee tegen één wordt bestraft met een onrechtstreekse vrije trap.", en: "Two on one is punished by an indirect free kick." } },
    { question: { fr: "Le ballon sort sur le côté. On le remet en jeu…", nl: "De bal gaat over de zijlijn. Hij wordt ingespeeld…", en: "The ball goes out over the side line. It comes back…" }, choices: [{ fr: "À la main", nl: "Met de hand", en: "By hand" }, { fr: "Avec le fauteuil", nl: "Met de rolstoel", en: "With the chair" }, { fr: "Par l'arbitre", nl: "Door de scheidsrechter", en: "By the referee" }], answer: 1, explanation: { fr: "Avec le fauteuil, et on peut marquer directement.", nl: "Met de rolstoel, en je mag rechtstreeks scoren.", en: "With the chair, and a goal may be scored directly." } },
    { question: { fr: "Combien de PF2 au plus sur le terrain par équipe ?", nl: "Hoeveel PF2 hoogstens per ploeg op het veld?", en: "How many PF2 at most on the court per team?" }, choices: [{ fr: "Un", nl: "Eén", en: "One" }, { fr: "Deux", nl: "Twee", en: "Two" }, { fr: "Quatre", nl: "Vier", en: "Four" }], answer: 1, explanation: { fr: "Deux PF2 au plus : c'est ce qui garde le jeu équitable.", nl: "Hoogstens twee PF2: zo blijft het spel eerlijk.", en: "Two PF2 at most: that keeps the game fair." } },
  ],
  chair: [
    { question: { fr: "Quand contrôle-t-on la vitesse ?", nl: "Wanneer wordt de snelheid gecontroleerd?", en: "When is the speed checked?" }, choices: [{ fr: "Au moins 15 min avant le coup d'envoi", nl: "Minstens 15 min voor de aftrap", en: "At least 15 min before kick-off" }, { fr: "À la mi-temps", nl: "Bij de rust", en: "At half-time" }, { fr: "Jamais en championnat", nl: "Nooit in het kampioenschap", en: "Never in the championship" }], answer: 0, explanation: { fr: "Au moins 15 minutes avant le coup d'envoi, au banc à rouleaux ou sur 15 m chronométrés.", nl: "Minstens 15 minuten voor de aftrap, op de rollenbank of over 15 m met chrono.", en: "At least 15 minutes before kick-off, on a roller bench or over 15 m timed." } },
    { question: { fr: "Entre quelles hauteurs se trouvent les protections ?", nl: "Tussen welke hoogtes zitten de beschermingen?", en: "Between which heights are the guards?" }, choices: [{ fr: "10 et 30 cm", nl: "10 en 30 cm", en: "10 and 30 cm" }, { fr: "20 et 45 cm", nl: "20 en 45 cm", en: "20 and 45 cm" }, { fr: "30 et 60 cm", nl: "30 en 60 cm", en: "30 and 60 cm" }], answer: 1, explanation: { fr: "Entre 20 et 45 cm du sol, bord inférieur entre 5 et 10 cm.", nl: "Tussen 20 en 45 cm van de grond, onderrand tussen 5 en 10 cm.", en: "Between 20 and 45 cm from the floor, lower edge between 5 and 10 cm." } },
    { question: { fr: "Peut-on régler le fauteuil après le contrôle ?", nl: "Mag de rolstoel na de controle afgesteld worden?", en: "May the chair be adjusted after the check?" }, choices: [{ fr: "Oui, librement", nl: "Ja, vrij", en: "Yes, freely" }, { fr: "Non ; le programmateur reste à la table de marque", nl: "Nee; de programmeur blijft aan de wedstrijdtafel", en: "No; the programmer stays at the scorers' table" }, { fr: "Seulement à la mi-temps", nl: "Alleen bij de rust", en: "Only at half-time" }], answer: 1, explanation: { fr: "Les réglages après contrôle sont interdits ; toute modification est signalée et le fauteuil recontrôlé.", nl: "Afstellen na de controle is verboden; elke wijziging wordt gemeld en de rolstoel opnieuw gecontroleerd.", en: "Adjusting after the check is forbidden; any change is reported and the chair checked again." } },
    { question: { fr: "La protection avant peut-elle être creuse ?", nl: "Mag de voorste bescherming hol zijn?", en: "May the front guard be hollow?" }, choices: [{ fr: "Oui", nl: "Ja", en: "Yes" }, { fr: "Non, plate ou bombée", nl: "Nee, vlak of bol", en: "No, flat or rounded" }, { fr: "Seulement pour le gardien", nl: "Alleen voor de doelman", en: "Only for the goalkeeper" }], answer: 1, explanation: { fr: "Plate ou bombée, jamais creuse, pour ne pas coincer le ballon.", nl: "Vlak of bol, nooit hol, om de bal niet te klemmen.", en: "Flat or rounded, never hollow, so as not to trap the ball." } },
    { question: { fr: "Quelle ceinture est obligatoire ?", nl: "Welke gordel is verplicht?", en: "Which belt is required?" }, choices: [{ fr: "Aucune", nl: "Geen", en: "None" }, { fr: "La ceinture abdominale", nl: "De heupgordel", en: "The lap belt" }, { fr: "Un harnais complet", nl: "Een volledig harnas", en: "A full harness" }], answer: 1, explanation: { fr: "La ceinture abdominale ; sangles de poitrine, d'épaules ou de tête si le joueur en a besoin.", nl: "De heupgordel; borst-, schouder- of hoofdriemen als de speler ze nodig heeft.", en: "The lap belt; chest, shoulder or head straps if the player needs them." } },
  ],
};
