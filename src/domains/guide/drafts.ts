import type { ChapterContent, GuideAudience } from "./schema";

/**
 * The proposed drafts of the Guide du powerchair football. A federation adds
 * them as its own drafts, reads them, adapts them (national rules) and
 * publishes them: nothing is shown to the clubs before that. Taken from the
 * FIPFA Laws of the Game 2025 and the FIPFA Technical Supplement 2020.
 */
export type Draft = { slug: string; position: number; audiences: GuideAudience[]; sources: string; content: ChapterContent };

const lawsSources = "Lois du jeu FIPFA 2025 ; Supplément technique FIPFA 2020 ; FIPFA, « What is powerchair football » (taille du ballon). Adaptations nationales : à confirmer par la fédération.";

export const drafts: Draft[] = [
  {
    slug: "game",
    position: 1,
    audiences: ["player", "guardian", "coach", "staff", "referee", "president", "federation"],
    sources: lawsSources,
    content: {
      fr: {
        title: "Le powerchair football en une page",
        summary: "Du football en fauteuil électrique, rapide et tactique : les règles à connaître.",
        body: `Le powerchair football, c'est du football en fauteuil électrique, rapide et tactique. On le joue en salle, sur un terrain de basket.

## Deux équipes de quatre
Chaque équipe a quatre joueurs sur le terrain, dont un gardien. On joue avec au moins deux joueurs, et jusqu'à quatre remplaçants.

## Un grand ballon
Il fait environ 33 cm de diamètre (13 pouces). On le frappe avec la protection fixée à l'avant du fauteuil, et les plus beaux tirs partent souvent d'une rotation.

## Le terrain
Environ 28 m sur 15 m. Les buts sont deux plots placés à 6 m l'un de l'autre, devant une zone de but de 8 m sur 5 m. Le point de penalty est à 3,5 m.

[[figure:pitch]]

## Le temps
Deux mi-temps de 20 minutes, avec une pause de 10 minutes au maximum.

## 10 km/h, pas plus
Tous les fauteuils sont contrôlés avant le match, en marche avant et arrière.

## Les deux règles qui font la spécificité du jeu
- Le 2 contre 1 : deux coéquipiers ne peuvent pas être tous les deux à moins de 3 m du ballon quand un adversaire y est aussi et qu'ils jouent l'action. Sanction : coup franc indirect. Le gardien dans sa zone de but ne compte pas.
- Trois dans la zone de but : une équipe ne peut pas avoir trois joueurs ou plus dans sa propre zone de but quand le ballon est dans sa moitié. Sanction : coup franc indirect.

[[figure:two-v-one]]

[[figure:three-in-area]]

## Pas de touche à la main
Quand le ballon sort sur le côté, on le remet en jeu avec le fauteuil, et on peut marquer directement. Sur les coups francs, les remises en jeu et les coups d'envoi, les adversaires reculent à 5 m.

## Le fair-play avant tout
Foncer volontairement dans un adversaire (le « ramming ») est une faute. Une rotation dangereuse aussi.

## PF1 et PF2
Chaque joueur a une classification : PF1 pour les joueurs les plus limités physiquement, PF2 pour les moins limités. Une équipe ne peut pas aligner plus de deux PF2 en même temps. C'est ce qui garde le jeu équitable.`,
      },
      nl: {
        title: "Powerchair football op één pagina",
        summary: "Voetbal in een elektrische rolstoel, snel en tactisch: de regels die je moet kennen.",
        body: `Powerchair football is voetbal in een elektrische rolstoel, snel en tactisch. Het wordt binnen gespeeld, op een basketbalveld.

## Twee ploegen van vier
Elke ploeg heeft vier spelers op het veld, waarvan één doelman. Er wordt gespeeld met minstens twee spelers, en tot vier wissels.

## Een grote bal
Ongeveer 33 cm doorsnede (13 duim). Je raakt hem met de bescherming vooraan de rolstoel, en de mooiste schoten komen vaak uit een draai.

## Het veld
Ongeveer 28 m op 15 m. De doelen zijn twee palen op 6 m van elkaar, voor een doelgebied van 8 m op 5 m. De strafschopstip ligt op 3,5 m.

[[figure:pitch]]

## De speeltijd
Twee helften van 20 minuten, met een rust van hoogstens 10 minuten.

## Niet sneller dan 10 km/u
Alle rolstoelen worden voor de wedstrijd gecontroleerd, vooruit en achteruit.

## De twee regels die het spel eigen maken
- Twee tegen één: twee ploeggenoten mogen niet allebei binnen 3 m van de bal zijn wanneer ook een tegenstander er is en zij in de actie spelen. Sanctie: onrechtstreekse vrije trap. De doelman in zijn doelgebied telt niet mee.
- Drie in het doelgebied: een ploeg mag geen drie of meer spelers in haar eigen doelgebied hebben wanneer de bal op haar helft is. Sanctie: onrechtstreekse vrije trap.

[[figure:two-v-one]]

[[figure:three-in-area]]

## Geen inworp met de hand
Gaat de bal over de zijlijn, dan wordt hij met de rolstoel ingespeeld, en je mag rechtstreeks scoren. Bij vrije trappen, inspelen en aftrap blijven de tegenstanders op 5 m.

## Fair play eerst
Opzettelijk tegen een tegenstander inrijden (« ramming ») is een fout. Een gevaarlijke draai ook.

## PF1 en PF2
Elke speler heeft een classificatie: PF1 voor de spelers met de meeste fysieke beperkingen, PF2 voor de minst beperkte. Een ploeg mag niet meer dan twee PF2 tegelijk opstellen. Zo blijft het spel eerlijk.`,
      },
      en: {
        title: "Powerchair football on one page",
        summary: "Football in a power wheelchair, fast and tactical: the rules to know.",
        body: `Powerchair football is football in a power wheelchair, fast and tactical. It is played indoors, on a basketball court.

## Two teams of four
Each team has four players on the court, one of them a goalkeeper. A team plays with at least two players, and up to four substitutes.

## A big ball
About 33 cm across (13 inches). It is struck with the guard fixed at the front of the chair, and the finest shots often come from a spin.

## The court
About 28 m by 15 m. The goals are two posts 6 m apart, in front of a goal area of 8 m by 5 m. The penalty mark is at 3.5 m.

[[figure:pitch]]

## The time
Two halves of 20 minutes, with a break of 10 minutes at most.

## 10 km/h, no more
Every chair is checked before the match, forwards and backwards.

## The two rules that make the game
- Two on one: two team-mates may not both be within 3 m of the ball when an opponent is there too and they are playing the action. Sanction: indirect free kick. The goalkeeper in his goal area does not count.
- Three in the goal area: a team may not have three or more players in its own goal area when the ball is in its half. Sanction: indirect free kick.

[[figure:two-v-one]]

[[figure:three-in-area]]

## No throw-in by hand
When the ball goes out over the side line, it is brought back into play with the chair, and a goal may be scored directly. At free kicks, kick-ins and kick-offs, opponents stay 5 m away.

## Fair play first
Driving into an opponent on purpose (« ramming ») is a foul. So is a dangerous spin.

## PF1 and PF2
Each player has a classification: PF1 for the players with the greatest physical limitation, PF2 for the least limited. A team may not field more than two PF2 at the same time. That keeps the game fair.`,
      },
    },
  },
  {
    slug: "chair",
    position: 2,
    audiences: ["player", "guardian", "coach", "staff", "referee", "president", "federation"],
    sources: lawsSources,
    content: {
      fr: {
        title: "Le fauteuil de match",
        summary: "Ce que les arbitres contrôlent sur un fauteuil avant de jouer.",
        body: `Un fauteuil de powerchair football est un fauteuil électrique d'au moins quatre roues, équipé pour jouer en sécurité. Voici ce que les arbitres contrôlent.

[[figure:chair-profile]]

[[figure:chair-top]]

| Élément | Règle |
| --- | --- |
| Vitesse | 10 km/h maximum, en avant et en arrière |
| Contrôle de vitesse | Au moins 15 min avant le coup d'envoi, au banc à rouleaux ou sur 15 m chronométrés (5,49 s minimum avant le match) ; après le match, 10 % de tolérance (4,99 s) ; un échec = un réglage et un seul nouvel essai |
| Réglages après contrôle | Interdits ; le programmateur reste à la table de marque pendant le match |
| Protection avant (guard) | Obligatoire, incassable, solidement fixée, surface plate ou bombée (jamais creuse) |
| Hauteur des protections | Entre 20 et 45 cm du sol ; bord inférieur entre 5 et 10 cm du sol |
| Largeur | Pas plus large que le châssis ou les roues motrices ; protection avant pas plus étroite que les roulettes avant |
| Avancée de la protection | 33 cm maximum devant les roues avant (10 cm de plus si les pieds l'exigent) |
| Protection arrière | Incassable et solidement fixée |
| Ceinture | Ceinture abdominale obligatoire ; sangles de poitrine, d'épaules ou de tête si le joueur en a besoin |
| Dépassement | Rien ne dépasse à l'avant ou à l'arrière de la base, sauf les roulettes anti-bascule |
| Sécurité | Aucune arête vive ; rien ne doit coincer le ballon ni permettre de rouler dessus |
| Numéros | Numéro bien visible à l'arrière du fauteuil et à l'avant (fauteuil ou joueur) |

> Bon à savoir pour le club : toute modification qui peut changer la vitesse après le contrôle doit être signalée à l'arbitre, et le fauteuil est recontrôlé. Les batteries et chargeurs ne sont pas réglementés, mais un fauteuil à plat ne joue pas : chargez la veille et emportez les chargeurs.`,
      },
      nl: {
        title: "De wedstrijdrolstoel",
        summary: "Wat de scheidsrechters op een rolstoel controleren voor er gespeeld wordt.",
        body: `Een powerchair-football-rolstoel is een elektrische rolstoel met minstens vier wielen, uitgerust om veilig te spelen. Dit controleren de scheidsrechters.

[[figure:chair-profile]]

[[figure:chair-top]]

| Onderdeel | Regel |
| --- | --- |
| Snelheid | Hoogstens 10 km/u, vooruit en achteruit |
| Snelheidscontrole | Minstens 15 min voor de aftrap, op de rollenbank of over 15 m met chrono (minstens 5,49 s voor de wedstrijd); na de wedstrijd 10 % tolerantie (4,99 s); mislukt = één afstelling en één nieuwe poging |
| Afstellen na de controle | Verboden; de programmeur blijft tijdens de wedstrijd aan de wedstrijdtafel |
| Voorste bescherming (guard) | Verplicht, onbreekbaar, stevig vastgemaakt, vlak of bol oppervlak (nooit hol) |
| Hoogte van de beschermingen | Tussen 20 en 45 cm van de grond; onderrand tussen 5 en 10 cm van de grond |
| Breedte | Niet breder dan het chassis of de aandrijfwielen; voorste bescherming niet smaller dan de voorwieltjes |
| Uitsteken van de bescherming | Hoogstens 33 cm voor de voorwielen (10 cm meer als de voeten het vragen) |
| Achterste bescherming | Onbreekbaar en stevig vastgemaakt |
| Gordel | Heupgordel verplicht; borst-, schouder- of hoofdriemen als de speler ze nodig heeft |
| Uitsteken | Niets steekt uit voor of achter de basis, behalve de anti-kantelwieltjes |
| Veiligheid | Geen scherpe randen; niets mag de bal klemmen of erover laten rijden |
| Nummers | Goed zichtbaar nummer achteraan de rolstoel en vooraan (rolstoel of speler) |

> Goed om te weten voor de club: elke wijziging die de snelheid na de controle kan veranderen, wordt aan de scheidsrechter gemeld, en de rolstoel wordt opnieuw gecontroleerd. Batterijen en laders zijn niet gereglementeerd, maar een lege rolstoel speelt niet: laad de avond voordien op en neem de laders mee.`,
      },
      en: {
        title: "The match chair",
        summary: "What the referees check on a chair before it plays.",
        body: `A powerchair football chair is a power wheelchair with at least four wheels, fitted to play safely. This is what the referees check.

[[figure:chair-profile]]

[[figure:chair-top]]

| Item | Rule |
| --- | --- |
| Speed | 10 km/h at most, forwards and backwards |
| Speed check | At least 15 min before kick-off, on a roller bench or over 15 m timed (5.49 s minimum before the match); after the match, 10 % tolerance (4.99 s); a failure = one adjustment and one new try only |
| Adjusting after the check | Forbidden; the programmer stays at the scorers' table during the match |
| Front guard | Required, unbreakable, firmly fixed, flat or rounded surface (never hollow) |
| Height of the guards | Between 20 and 45 cm from the floor; lower edge between 5 and 10 cm from the floor |
| Width | No wider than the frame or the drive wheels; front guard no narrower than the front castors |
| Guard reach | 33 cm at most in front of the front wheels (10 cm more if the feet need it) |
| Rear guard | Unbreakable and firmly fixed |
| Belt | Lap belt required; chest, shoulder or head straps if the player needs them |
| Overhang | Nothing sticks out at the front or back of the base, except the anti-tip wheels |
| Safety | No sharp edge; nothing may trap the ball or let a chair roll over it |
| Numbers | A clearly visible number at the back of the chair and at the front (chair or player) |

> Good to know for the club: any change that may alter the speed after the check is reported to the referee, and the chair is checked again. Batteries and chargers are not regulated, but a flat chair does not play: charge the day before and take the chargers along.`,
      },
    },
  },
];

/** The lines of « Le fauteuil de match » a club checks at a service (« Conforme pour un match »). */
export const complianceItems = ["guard", "heights", "width", "belt", "number", "edges", "speed"] as const;
export type ComplianceItem = (typeof complianceItems)[number];
