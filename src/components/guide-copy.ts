import type { Locale } from "@/lib/locale";
import type { Figure, GuideAudience } from "@/domains/guide/schema";
import type { ComplianceItem } from "@/domains/guide/drafts";

/** Guide du powerchair football: the pages, the federation's writing tools, the figures' texts. */
type Copy = {
  title: string;
  intro: string;
  menu: string;
  noFederation: string;
  empty: string;
  emptyManage: string;
  forMe: string;
  all: string;
  read: string;
  draft: string;
  changed: string;
  publicBadge: string;
  updated: string;
  sources: string;
  print: string;
  back: string;
  fallback: string;
  audiences: Record<GuideAudience, string>;
  ours: string;
  oursHelp: string;
  oursSave: string;
  oursEmpty: string;
  write: {
    title: string;
    adopt: string;
    adopted: string;
    edit: string;
    preview: string;
    newChapter: string;
    slug: string;
    slugHelp: string;
    language: string;
    chapterTitle: string;
    summary: string;
    body: string;
    bodyHelp: string;
    sources: string;
    audiences: string;
    save: string;
    saved: string;
    publish: string;
    published: string;
    told: string;
    unpublish: string;
    makePublic: string;
    publicLink: string;
    versions: string;
    version: string;
    close: string;
    toCheck: string;
  };
  figures: Record<Figure, { title: string; desc: string }>;
  labels: Record<"fipfa" | "epfa" | "bpcf" | "clubs" | "beside" | "court" | "goalArea" | "goal" | "penalty" | "ball" | "us" | "them" | "keeper" | "foul" | "guard" | "rearGuard" | "belt" | "number" | "height" | "lowEdge" | "reach" | "width" | "front", string>;
  compliance: {
    title: string;
    intro: string;
    items: Record<ComplianceItem, string>;
    date: string;
    note: string;
    save: string;
    saved: string;
    last: string;
    ok: string;
    missing: string;
    never: string;
    guide: string;
  };
  errors: Record<string, string>;
};

const fr: Copy = {
  title: "Guide du jeu",
  intro: "Les règles, le fauteuil et le reste, écrits par la fédération pour tous les clubs.",
  menu: "Guide du jeu",
  noFederation: "Votre club n'est rattaché à aucune fédération : le guide n'est pas disponible.",
  empty: "La fédération n'a pas encore publié de chapitre.",
  emptyManage: "Aucun chapitre pour l'instant. Ajoutez les brouillons proposés, relisez-les, puis publiez-les.",
  forMe: "Pour moi",
  all: "Tout voir",
  read: "Lu",
  draft: "Brouillon",
  changed: "Modifié, pas encore publié",
  publicBadge: "Page publique",
  updated: "Mis à jour le {date}",
  sources: "Sources",
  print: "Imprimer",
  back: "Retour au guide",
  fallback: "Ce chapitre n'est pas encore traduit : texte en français.",
  audiences: { player: "Joueurs", guardian: "Parents", coach: "Coachs", staff: "Staff", referee: "Arbitres", president: "Présidents", federation: "Fédération" },
  ours: "Chez nous",
  oursHelp: "Une courte note propre au club, visible seulement de ses membres. Le texte de la fédération ne change pas.",
  oursSave: "Enregistrer la note",
  oursEmpty: "Laissez vide pour retirer la note.",
  write: {
    title: "Rédaction (fédération)",
    adopt: "Ajouter les brouillons proposés",
    adopted: "{n} brouillons ajoutés.",
    edit: "Modifier",
    preview: "Aperçu",
    newChapter: "Nouveau chapitre",
    slug: "Adresse",
    slugHelp: "Lettres minuscules, chiffres et tirets (par exemple « game »).",
    language: "Langue du texte",
    chapterTitle: "Titre",
    summary: "Résumé en une phrase",
    body: "Texte",
    bodyHelp: "« ## » un titre, « - » une liste, « | a | b | » un tableau, « > » une note, « [[figure:pitch]] » un schéma. Une ligne vide entre les paragraphes.",
    sources: "Sources",
    audiences: "Pour qui",
    save: "Enregistrer le brouillon",
    saved: "Brouillon enregistré.",
    publish: "Publier",
    published: "Chapitre publié.",
    told: "Chapitre publié ; {n} coachs et arbitres prévenus.",
    unpublish: "Retirer de la publication",
    makePublic: "Page publique (sans compte)",
    publicLink: "Lien public",
    versions: "Versions",
    version: "Version {n} · {author} · {date}",
    close: "Fermer",
    toCheck: "Relisez chaque chapitre et adaptez-le aux règles nationales avant de publier.",
  },
  figures: {
    pitch: { title: "Le terrain", desc: "Terrain de 28 m sur 15 m. À chaque bout, deux plots à 6 m l'un de l'autre font le but, devant une zone de but de 8 m de large sur 5 m de profondeur. Le point de penalty est à 3,5 m de la ligne de but." },
    "two-v-one": { title: "Le 2 contre 1", desc: "Autour du ballon, un cercle de 3 m. Un adversaire y est, avec deux joueurs de la même équipe : c'est une faute, sanctionnée d'un coup franc indirect." },
    "three-in-area": { title: "Trois dans la zone de but", desc: "Le ballon est dans la moitié de l'équipe. Trois de ses joueurs sont dans sa zone de but : c'est une faute, sanctionnée d'un coup franc indirect." },
    "chair-profile": { title: "Le fauteuil vu de profil", desc: "Protection avant entre 20 et 45 cm du sol, bord inférieur entre 5 et 10 cm du sol, protection arrière, ceinture abdominale et numéro à l'arrière." },
    pyramid: { title: "La pyramide du powerchair football", desc: "De haut en bas : la FIPFA (monde), l'EPFA (Europe), la fédération belge, puis les clubs. À côté : Sportéa, l'ADEPS, la Ligue Handisport Francophone et les pouvoirs subsidiants." },
    "chair-top": { title: "Le fauteuil vu de dessus", desc: "La protection avant avance d'au plus 33 cm devant les roues avant et n'est pas plus étroite que les roulettes ; le fauteuil n'est pas plus large que son châssis ou ses roues motrices ; numéro à l'avant." },
  },
  labels: { fipfa: "FIPFA · monde", epfa: "EPFA · Europe", bpcf: "Fédération belge", clubs: "Clubs", beside: "À côté : Sportéa, ADEPS, Ligue Handisport, pouvoirs subsidiants", court: "28 m × 15 m", goalArea: "Zone de but 8 × 5 m", goal: "But 6 m", penalty: "Penalty 3,5 m", ball: "Ballon", us: "Équipe A", them: "Équipe B", keeper: "Gardien", foul: "Faute", guard: "Protection avant", rearGuard: "Protection arrière", belt: "Ceinture", number: "Numéro", height: "20 à 45 cm", lowEdge: "5 à 10 cm", reach: "33 cm max", width: "Pas plus large", front: "Avant" },
  compliance: {
    title: "Conforme pour un match",
    intro: "Les points de « Le fauteuil de match », cochés lors de l'entretien.",
    items: {
      guard: "Protections avant et arrière incassables et bien fixées",
      heights: "Hauteurs des protections (20 à 45 cm, bord inférieur 5 à 10 cm)",
      width: "Largeur et avancée de la protection (33 cm maximum)",
      belt: "Ceinture abdominale (et sangles si nécessaire)",
      number: "Numéro visible à l'avant et à l'arrière",
      edges: "Aucune arête vive, rien ne coince le ballon",
      speed: "Vitesse contrôlée : 10 km/h maximum",
    },
    date: "Date du contrôle",
    note: "Remarque",
    save: "Enregistrer le contrôle",
    saved: "Contrôle enregistré.",
    last: "Dernier contrôle le {date} par {by}",
    ok: "Conforme",
    missing: "À revoir",
    never: "Jamais contrôlé.",
    guide: "Voir « Le fauteuil de match »",
  },
  errors: { NOT_PUBLISHED: "Publiez d'abord le chapitre.", DUPLICATE: "Cette adresse est déjà utilisée." },
};

const nl: Copy = {
  title: "Spelgids",
  intro: "De regels, de rolstoel en de rest, geschreven door de federatie voor alle clubs.",
  menu: "Spelgids",
  noFederation: "Uw club is bij geen enkele federatie aangesloten: de gids is niet beschikbaar.",
  empty: "De federatie heeft nog geen hoofdstuk gepubliceerd.",
  emptyManage: "Nog geen hoofdstukken. Voeg de voorgestelde ontwerpen toe, lees ze na en publiceer ze.",
  forMe: "Voor mij",
  all: "Alles tonen",
  read: "Gelezen",
  draft: "Ontwerp",
  changed: "Gewijzigd, nog niet gepubliceerd",
  publicBadge: "Openbare pagina",
  updated: "Bijgewerkt op {date}",
  sources: "Bronnen",
  print: "Afdrukken",
  back: "Terug naar de gids",
  fallback: "Dit hoofdstuk is nog niet vertaald: tekst in het Frans.",
  audiences: { player: "Spelers", guardian: "Ouders", coach: "Coaches", staff: "Staf", referee: "Scheidsrechters", president: "Voorzitters", federation: "Federatie" },
  ours: "Bij ons",
  oursHelp: "Een korte eigen notitie van de club, alleen zichtbaar voor haar leden. De tekst van de federatie verandert niet.",
  oursSave: "De notitie opslaan",
  oursEmpty: "Laat leeg om de notitie te verwijderen.",
  write: {
    title: "Redactie (federatie)",
    adopt: "De voorgestelde ontwerpen toevoegen",
    adopted: "{n} ontwerpen toegevoegd.",
    edit: "Wijzigen",
    preview: "Voorbeeld",
    newChapter: "Nieuw hoofdstuk",
    slug: "Adres",
    slugHelp: "Kleine letters, cijfers en streepjes (bijvoorbeeld « game »).",
    language: "Taal van de tekst",
    chapterTitle: "Titel",
    summary: "Samenvatting in één zin",
    body: "Tekst",
    bodyHelp: "« ## » een titel, « - » een lijst, « | a | b | » een tabel, « > » een notitie, « [[figure:pitch]] » een schema. Een lege lijn tussen de alinea's.",
    sources: "Bronnen",
    audiences: "Voor wie",
    save: "Het ontwerp opslaan",
    saved: "Ontwerp opgeslagen.",
    publish: "Publiceren",
    published: "Hoofdstuk gepubliceerd.",
    told: "Hoofdstuk gepubliceerd; {n} coaches en scheidsrechters verwittigd.",
    unpublish: "Uit de publicatie halen",
    makePublic: "Openbare pagina (zonder account)",
    publicLink: "Openbare link",
    versions: "Versies",
    version: "Versie {n} · {author} · {date}",
    close: "Sluiten",
    toCheck: "Lees elk hoofdstuk na en pas het aan de nationale regels aan voor u publiceert.",
  },
  figures: {
    pitch: { title: "Het veld", desc: "Veld van 28 m op 15 m. Aan elk uiteinde vormen twee palen op 6 m van elkaar het doel, voor een doelgebied van 8 m breed en 5 m diep. De strafschopstip ligt op 3,5 m van de doellijn." },
    "two-v-one": { title: "Twee tegen één", desc: "Rond de bal een cirkel van 3 m. Er is een tegenstander, met twee spelers van dezelfde ploeg: dat is een fout, bestraft met een onrechtstreekse vrije trap." },
    "three-in-area": { title: "Drie in het doelgebied", desc: "De bal is op de helft van de ploeg. Drie van haar spelers staan in haar doelgebied: dat is een fout, bestraft met een onrechtstreekse vrije trap." },
    "chair-profile": { title: "De rolstoel van opzij", desc: "Voorste bescherming tussen 20 en 45 cm van de grond, onderrand tussen 5 en 10 cm van de grond, achterste bescherming, heupgordel en nummer achteraan." },
    pyramid: { title: "De piramide van powerchair football", desc: "Van boven naar onder: de FIPFA (wereld), de EPFA (Europa), de Belgische federatie, dan de clubs. Ernaast: Sportéa, ADEPS, Ligue Handisport Francophone en de subsidiërende overheden." },
    "chair-top": { title: "De rolstoel van boven", desc: "De voorste bescherming steekt hoogstens 33 cm voor de voorwielen uit en is niet smaller dan de voorwieltjes; de rolstoel is niet breder dan zijn chassis of aandrijfwielen; nummer vooraan." },
  },
  labels: { fipfa: "FIPFA · wereld", epfa: "EPFA · Europa", bpcf: "Belgische federatie", clubs: "Clubs", beside: "Ernaast: Sportéa, ADEPS, Ligue Handisport, overheden", court: "28 m × 15 m", goalArea: "Doelgebied 8 × 5 m", goal: "Doel 6 m", penalty: "Strafschop 3,5 m", ball: "Bal", us: "Ploeg A", them: "Ploeg B", keeper: "Doelman", foul: "Fout", guard: "Voorste bescherming", rearGuard: "Achterste bescherming", belt: "Gordel", number: "Nummer", height: "20 tot 45 cm", lowEdge: "5 tot 10 cm", reach: "max. 33 cm", width: "Niet breder", front: "Voorkant" },
  compliance: {
    title: "Wedstrijdklaar",
    intro: "De punten van « De wedstrijdrolstoel », afgevinkt bij het onderhoud.",
    items: {
      guard: "Voorste en achterste bescherming onbreekbaar en stevig vast",
      heights: "Hoogte van de beschermingen (20 tot 45 cm, onderrand 5 tot 10 cm)",
      width: "Breedte en uitsteken van de bescherming (hoogstens 33 cm)",
      belt: "Heupgordel (en riemen indien nodig)",
      number: "Nummer zichtbaar voor en achter",
      edges: "Geen scherpe randen, niets klemt de bal",
      speed: "Snelheid gecontroleerd: hoogstens 10 km/u",
    },
    date: "Datum van de controle",
    note: "Opmerking",
    save: "De controle opslaan",
    saved: "Controle opgeslagen.",
    last: "Laatste controle op {date} door {by}",
    ok: "In orde",
    missing: "Na te kijken",
    never: "Nooit gecontroleerd.",
    guide: "« De wedstrijdrolstoel » bekijken",
  },
  errors: { NOT_PUBLISHED: "Publiceer het hoofdstuk eerst.", DUPLICATE: "Dit adres is al in gebruik." },
};

const en: Copy = {
  title: "Game guide",
  intro: "The rules, the chair and the rest, written by the federation for every club.",
  menu: "Game guide",
  noFederation: "Your club belongs to no federation: the guide is not available.",
  empty: "The federation has not published a chapter yet.",
  emptyManage: "No chapter yet. Add the proposed drafts, read them through, then publish them.",
  forMe: "For me",
  all: "See all",
  read: "Read",
  draft: "Draft",
  changed: "Changed, not yet published",
  publicBadge: "Public page",
  updated: "Updated on {date}",
  sources: "Sources",
  print: "Print",
  back: "Back to the guide",
  fallback: "This chapter is not translated yet: text in French.",
  audiences: { player: "Players", guardian: "Parents", coach: "Coaches", staff: "Staff", referee: "Referees", president: "Presidents", federation: "Federation" },
  ours: "At our club",
  oursHelp: "A short note of the club's own, seen by its members only. The federation's text does not change.",
  oursSave: "Save the note",
  oursEmpty: "Leave empty to remove the note.",
  write: {
    title: "Writing (federation)",
    adopt: "Add the proposed drafts",
    adopted: "{n} drafts added.",
    edit: "Edit",
    preview: "Preview",
    newChapter: "New chapter",
    slug: "Address",
    slugHelp: "Lower-case letters, digits and hyphens (for example « game »).",
    language: "Language of the text",
    chapterTitle: "Title",
    summary: "One-sentence summary",
    body: "Text",
    bodyHelp: "« ## » a heading, « - » a list, « | a | b | » a table, « > » a note, « [[figure:pitch]] » a figure. A blank line between paragraphs.",
    sources: "Sources",
    audiences: "For whom",
    save: "Save the draft",
    saved: "Draft saved.",
    publish: "Publish",
    published: "Chapter published.",
    told: "Chapter published; {n} coaches and referees told.",
    unpublish: "Take off publication",
    makePublic: "Public page (no account)",
    publicLink: "Public link",
    versions: "Versions",
    version: "Version {n} · {author} · {date}",
    close: "Close",
    toCheck: "Read each chapter through and adapt it to the national rules before publishing.",
  },
  figures: {
    pitch: { title: "The court", desc: "A court of 28 m by 15 m. At each end, two posts 6 m apart make the goal, in front of a goal area 8 m wide and 5 m deep. The penalty mark is 3.5 m from the goal line." },
    "two-v-one": { title: "Two on one", desc: "Around the ball, a 3 m circle. An opponent is in it, with two players of the same team: that is a foul, punished by an indirect free kick." },
    "three-in-area": { title: "Three in the goal area", desc: "The ball is in the team's half. Three of its players are in its goal area: that is a foul, punished by an indirect free kick." },
    "chair-profile": { title: "The chair from the side", desc: "Front guard between 20 and 45 cm from the floor, lower edge between 5 and 10 cm from the floor, rear guard, lap belt and number at the back." },
    pyramid: { title: "The powerchair football pyramid", desc: "From top to bottom: FIPFA (world), EPFA (Europe), the Belgian federation, then the clubs. Beside it: Sportéa, ADEPS, Ligue Handisport Francophone and the funding authorities." },
    "chair-top": { title: "The chair from above", desc: "The front guard reaches 33 cm at most in front of the front wheels and is no narrower than the castors; the chair is no wider than its frame or drive wheels; number at the front." },
  },
  labels: { fipfa: "FIPFA · world", epfa: "EPFA · Europe", bpcf: "Belgian federation", clubs: "Clubs", beside: "Beside: Sportéa, ADEPS, Ligue Handisport, authorities", court: "28 m × 15 m", goalArea: "Goal area 8 × 5 m", goal: "Goal 6 m", penalty: "Penalty 3.5 m", ball: "Ball", us: "Team A", them: "Team B", keeper: "Keeper", foul: "Foul", guard: "Front guard", rearGuard: "Rear guard", belt: "Belt", number: "Number", height: "20 to 45 cm", lowEdge: "5 to 10 cm", reach: "33 cm max", width: "No wider", front: "Front" },
  compliance: {
    title: "Fit for a match",
    intro: "The points of « The match chair », ticked at a service.",
    items: {
      guard: "Front and rear guards unbreakable and firmly fixed",
      heights: "Height of the guards (20 to 45 cm, lower edge 5 to 10 cm)",
      width: "Width and reach of the guard (33 cm at most)",
      belt: "Lap belt (and straps if needed)",
      number: "Number visible at the front and back",
      edges: "No sharp edge, nothing traps the ball",
      speed: "Speed checked: 10 km/h at most",
    },
    date: "Date of the check",
    note: "Remark",
    save: "Save the check",
    saved: "Check saved.",
    last: "Last check on {date} by {by}",
    ok: "Fit",
    missing: "To review",
    never: "Never checked.",
    guide: "See « The match chair »",
  },
  errors: { NOT_PUBLISHED: "Publish the chapter first.", DUPLICATE: "This address is already used." },
};

export const guideCopy: Record<Locale, Copy> = { fr, nl, en };
