import type { Locale } from "@/lib/locale";

/** Knowledge centre: search, lexicon, gallery, catalogue of chairs, quizzes, how-to sheets. */
type Copy = {
  search: { label: string; placeholder: string; go: string; chapters: string; terms: string; none: string };
  sections: Record<"lexicon" | "chairs" | "gallery" | "help", { title: string; intro: string }>;
  toc: string;
  lexicon: { empty: string; adopt: string; adopted: string; add: string; term: string; definition: string; language: string; save: string; saved: string; remove: string; removed: string; setting: string; settingHelp: string };
  gallery: {
    empty: string;
    upload: string;
    file: string;
    category: string;
    categories: Record<"court" | "goals" | "ball" | "guard" | "speed" | "chair" | "other", string>;
    conform: string;
    conforms: Record<"" | "yes" | "no", string>;
    alt: string;
    altHelp: string;
    caption: string;
    people: string;
    rights: string;
    save: string;
    saved: string;
    remove: string;
    embed: string;
  };
  chairs: {
    empty: string;
    manufacturer: string;
    price: string;
    priceOn: string;
    speed: string;
    weight: string;
    protections: string;
    strengths: string;
    limits: string;
    suppliers: string;
    noSheet: string;
    photos: string;
    addPhoto: string;
    edit: string;
    save: string;
    saved: string;
    remove: string;
    back: string;
    modelLink: string;
    language: string;
    updated: string;
  };
  quiz: { title: string; intro: string; questionLabel: string; choice: string; correct: string; explanation: string; question: string; check: string; next: string; right: string; wrong: string; passed: string; failed: string; retry: string; finish: string; already: string };
  help: { title: string; intro: string; roles: Record<"president" | "coach" | "player" | "parent" | "federation" | "referee", string>; capture: string; open: string; aide: string; back: string };
  errors: Record<string, string>;
};

const fr: Copy = {
  search: { label: "Rechercher dans le guide", placeholder: "Un mot, une règle…", go: "Rechercher", chapters: "Chapitres", terms: "Lexique", none: "Aucun résultat." },
  sections: {
    lexicon: { title: "Lexique", intro: "Les mots du powerchair football, en une phrase chacun." },
    chairs: { title: "Catalogue des fauteuils", intro: "Une fiche par modèle validé : photos, fabricant, fournisseurs, prix indicatif, points forts et limites." },
    gallery: { title: "Galerie terrain et équipement", intro: "Photos et schémas annotés : terrain, buts, ballon, protections conformes ou non, contrôle de vitesse." },
    help: { title: "Mode d'emploi", intro: "Une fiche courte par action, avec une capture de l'écran." },
  },
  toc: "Sommaire",
  lexicon: {
    empty: "Le lexique est vide.",
    adopt: "Ajouter le lexique proposé",
    adopted: "{n} termes ajoutés.",
    add: "Ajouter un terme",
    term: "Terme",
    definition: "Définition courte",
    language: "Langue",
    save: "Enregistrer le terme",
    saved: "Terme enregistré.",
    remove: "Supprimer",
    removed: "Terme supprimé.",
    setting: "Souligner les mots du lexique (définition au survol et au clavier)",
    settingHelp: "Dans les pages du guide, la première apparition d'un terme est soulignée en pointillé.",
  },
  gallery: {
    empty: "La galerie est vide.",
    upload: "Ajouter une image",
    file: "Image (PNG, JPEG ou WebP, 2 Mo au plus)",
    category: "Sujet",
    categories: { court: "Terrain", goals: "Buts", ball: "Ballon", guard: "Protection", speed: "Contrôle de vitesse", chair: "Fauteuil", other: "Autre" },
    conform: "Conformité",
    conforms: { "": "Sans objet", yes: "Conforme", no: "Non conforme" },
    alt: "Texte alternatif (ce que montre l'image)",
    altHelp: "Obligatoire : lu par les lecteurs d'écran à la place de l'image.",
    caption: "Légende",
    people: "Des personnes sont reconnaissables sur l'image",
    rights: "Leur droit à l'image est respecté (accord écrit)",
    save: "Ajouter à la galerie",
    saved: "Image ajoutée.",
    remove: "Retirer",
    embed: "Dans un chapitre : {code}",
  },
  chairs: {
    empty: "Aucun modèle validé pour l'instant.",
    manufacturer: "Fabricant",
    price: "Prix indicatif",
    priceOn: "au {date}",
    speed: "Vitesse",
    weight: "Poids",
    protections: "Protections",
    strengths: "Points forts",
    limits: "Limites",
    suppliers: "Fournisseurs",
    noSheet: "La fédération n'a pas encore rédigé la fiche de ce modèle.",
    photos: "Photos",
    addPhoto: "Ajouter une photo",
    edit: "Modifier la fiche",
    save: "Enregistrer la fiche",
    saved: "Fiche enregistrée.",
    remove: "Retirer",
    back: "Catalogue des fauteuils",
    modelLink: "Fiche du modèle",
    language: "Langue des textes",
    updated: "Mis à jour le {date}",
  },
  quiz: {
    questionLabel: "Question",
    choice: "Réponse {n}",
    correct: "La réponse {n} est la bonne",
    explanation: "Explication",
    title: "Quiz",
    intro: "Cinq questions pour vérifier ce qu'on a retenu. Le résultat reste entre vous et l'application.",
    question: "Question {n} sur {total}",
    check: "Valider",
    next: "Question suivante",
    right: "Bonne réponse.",
    wrong: "Pas tout à fait.",
    passed: "Réussi : {n} bonnes réponses sur {total}.",
    failed: "{n} bonnes réponses sur {total} : il en faut 4. Relisez le chapitre et recommencez.",
    retry: "Recommencer",
    finish: "Voir le résultat",
    already: "Quiz déjà réussi.",
  },
  help: {
    title: "Mode d'emploi",
    intro: "Une fiche courte par action clé, pour chaque rôle.",
    roles: { president: "Présidence", coach: "Coachs", player: "Joueurs", parent: "Parents", federation: "Fédération", referee: "Arbitres" },
    capture: "Capture de l'écran : {title}",
    open: "Ouvrir la page",
    aide: "Aide",
    back: "Mode d'emploi",
  },
  errors: { IMAGE_RIGHTS: "Confirmez le droit à l'image des personnes visibles.", ALT_REQUIRED: "Décrivez l'image (texte alternatif).", INVALID_FILE: "Ce fichier n'est pas une image PNG, JPEG ou WebP de 2 Mo au plus.", PRICE_DATE: "Indiquez la date du prix." },
};

const nl: Copy = {
  search: { label: "Zoeken in de gids", placeholder: "Een woord, een regel…", go: "Zoeken", chapters: "Hoofdstukken", terms: "Woordenlijst", none: "Geen resultaat." },
  sections: {
    lexicon: { title: "Woordenlijst", intro: "De woorden van powerchair football, elk in één zin." },
    chairs: { title: "Catalogus van de rolstoelen", intro: "Eén fiche per goedgekeurd model: foto's, fabrikant, leveranciers, richtprijs, sterke punten en beperkingen." },
    gallery: { title: "Galerij veld en uitrusting", intro: "Foto's en geannoteerde schema's: veld, doelen, bal, conforme of niet-conforme beschermingen, snelheidscontrole." },
    help: { title: "Handleiding", intro: "Een korte fiche per handeling, met een schermafbeelding." },
  },
  toc: "Inhoud",
  lexicon: {
    empty: "De woordenlijst is leeg.",
    adopt: "De voorgestelde woordenlijst toevoegen",
    adopted: "{n} termen toegevoegd.",
    add: "Een term toevoegen",
    term: "Term",
    definition: "Korte definitie",
    language: "Taal",
    save: "De term opslaan",
    saved: "Term opgeslagen.",
    remove: "Verwijderen",
    removed: "Term verwijderd.",
    setting: "Woorden uit de woordenlijst onderstrepen (definitie bij aanwijzen en met het toetsenbord)",
    settingHelp: "In de pagina's van de gids wordt de eerste vermelding van een term met stippellijn onderstreept.",
  },
  gallery: {
    empty: "De galerij is leeg.",
    upload: "Een afbeelding toevoegen",
    file: "Afbeelding (PNG, JPEG of WebP, hoogstens 2 MB)",
    category: "Onderwerp",
    categories: { court: "Veld", goals: "Doelen", ball: "Bal", guard: "Bescherming", speed: "Snelheidscontrole", chair: "Rolstoel", other: "Andere" },
    conform: "Conformiteit",
    conforms: { "": "Niet van toepassing", yes: "Conform", no: "Niet conform" },
    alt: "Alternatieve tekst (wat de afbeelding toont)",
    altHelp: "Verplicht: schermlezers lezen hem in plaats van de afbeelding.",
    caption: "Bijschrift",
    people: "Er zijn herkenbare personen op de afbeelding",
    rights: "Hun portretrecht is gerespecteerd (schriftelijk akkoord)",
    save: "Aan de galerij toevoegen",
    saved: "Afbeelding toegevoegd.",
    remove: "Verwijderen",
    embed: "In een hoofdstuk: {code}",
  },
  chairs: {
    empty: "Nog geen goedgekeurd model.",
    manufacturer: "Fabrikant",
    price: "Richtprijs",
    priceOn: "op {date}",
    speed: "Snelheid",
    weight: "Gewicht",
    protections: "Beschermingen",
    strengths: "Sterke punten",
    limits: "Beperkingen",
    suppliers: "Leveranciers",
    noSheet: "De federatie heeft de fiche van dit model nog niet geschreven.",
    photos: "Foto's",
    addPhoto: "Een foto toevoegen",
    edit: "De fiche wijzigen",
    save: "De fiche opslaan",
    saved: "Fiche opgeslagen.",
    remove: "Verwijderen",
    back: "Catalogus van de rolstoelen",
    modelLink: "Fiche van het model",
    language: "Taal van de teksten",
    updated: "Bijgewerkt op {date}",
  },
  quiz: {
    questionLabel: "Vraag",
    choice: "Antwoord {n}",
    correct: "Antwoord {n} is juist",
    explanation: "Uitleg",
    title: "Quiz",
    intro: "Vijf vragen om na te gaan wat je onthouden hebt. Het resultaat blijft tussen jou en de toepassing.",
    question: "Vraag {n} van {total}",
    check: "Bevestigen",
    next: "Volgende vraag",
    right: "Juist.",
    wrong: "Niet helemaal.",
    passed: "Geslaagd: {n} van {total} juist.",
    failed: "{n} van {total} juist: er zijn er 4 nodig. Lees het hoofdstuk opnieuw en probeer nog eens.",
    retry: "Opnieuw",
    finish: "Het resultaat bekijken",
    already: "Quiz al geslaagd.",
  },
  help: {
    title: "Handleiding",
    intro: "Een korte fiche per belangrijke handeling, voor elke rol.",
    roles: { president: "Voorzitters", coach: "Coaches", player: "Spelers", parent: "Ouders", federation: "Federatie", referee: "Scheidsrechters" },
    capture: "Schermafbeelding: {title}",
    open: "De pagina openen",
    aide: "Hulp",
    back: "Handleiding",
  },
  errors: { IMAGE_RIGHTS: "Bevestig het portretrecht van de zichtbare personen.", ALT_REQUIRED: "Beschrijf de afbeelding (alternatieve tekst).", INVALID_FILE: "Dit bestand is geen PNG-, JPEG- of WebP-afbeelding van hoogstens 2 MB.", PRICE_DATE: "Geef de datum van de prijs." },
};

const en: Copy = {
  search: { label: "Search the guide", placeholder: "A word, a rule…", go: "Search", chapters: "Chapters", terms: "Lexicon", none: "No result." },
  sections: {
    lexicon: { title: "Lexicon", intro: "The words of powerchair football, one sentence each." },
    chairs: { title: "Chair catalogue", intro: "One sheet per validated model: photos, maker, suppliers, indicative price, strengths and limits." },
    gallery: { title: "Court and equipment gallery", intro: "Photos and annotated diagrams: court, goals, ball, guards fit or not, speed check." },
    help: { title: "How-to", intro: "One short sheet per action, with a capture of the screen." },
  },
  toc: "Contents",
  lexicon: {
    empty: "The lexicon is empty.",
    adopt: "Add the proposed lexicon",
    adopted: "{n} terms added.",
    add: "Add a term",
    term: "Term",
    definition: "Short definition",
    language: "Language",
    save: "Save the term",
    saved: "Term saved.",
    remove: "Remove",
    removed: "Term removed.",
    setting: "Underline the lexicon's words (definition on hover and with the keyboard)",
    settingHelp: "In the guide's pages, the first time a term appears it is underlined with dots.",
  },
  gallery: {
    empty: "The gallery is empty.",
    upload: "Add an image",
    file: "Image (PNG, JPEG or WebP, 2 MB at most)",
    category: "Subject",
    categories: { court: "Court", goals: "Goals", ball: "Ball", guard: "Guard", speed: "Speed check", chair: "Chair", other: "Other" },
    conform: "Fitness",
    conforms: { "": "Not relevant", yes: "Fit", no: "Not fit" },
    alt: "Text alternative (what the image shows)",
    altHelp: "Required: screen readers read it instead of the image.",
    caption: "Caption",
    people: "People can be recognised in the image",
    rights: "Their image rights are respected (written consent)",
    save: "Add to the gallery",
    saved: "Image added.",
    remove: "Remove",
    embed: "In a chapter: {code}",
  },
  chairs: {
    empty: "No validated model yet.",
    manufacturer: "Maker",
    price: "Indicative price",
    priceOn: "on {date}",
    speed: "Speed",
    weight: "Weight",
    protections: "Guards",
    strengths: "Strengths",
    limits: "Limits",
    suppliers: "Suppliers",
    noSheet: "The federation has not written this model's sheet yet.",
    photos: "Photos",
    addPhoto: "Add a photo",
    edit: "Edit the sheet",
    save: "Save the sheet",
    saved: "Sheet saved.",
    remove: "Remove",
    back: "Chair catalogue",
    modelLink: "Model sheet",
    language: "Language of the texts",
    updated: "Updated on {date}",
  },
  quiz: {
    questionLabel: "Question",
    choice: "Answer {n}",
    correct: "Answer {n} is right",
    explanation: "Explanation",
    title: "Quiz",
    intro: "Five questions to check what you remember. The result stays between you and the application.",
    question: "Question {n} of {total}",
    check: "Check",
    next: "Next question",
    right: "Right.",
    wrong: "Not quite.",
    passed: "Passed: {n} right out of {total}.",
    failed: "{n} right out of {total}: 4 are needed. Read the chapter again and retry.",
    retry: "Retry",
    finish: "See the result",
    already: "Quiz already passed.",
  },
  help: {
    title: "How-to",
    intro: "One short sheet per key action, for each role.",
    roles: { president: "Presidents", coach: "Coaches", player: "Players", parent: "Parents", federation: "Federation", referee: "Referees" },
    capture: "Screen capture: {title}",
    open: "Open the page",
    aide: "Help",
    back: "How-to",
  },
  errors: { IMAGE_RIGHTS: "Confirm the image rights of the people shown.", ALT_REQUIRED: "Describe the image (text alternative).", INVALID_FILE: "This file is not a PNG, JPEG or WebP image of 2 MB at most.", PRICE_DATE: "Give the date of the price." },
};

export const knowledgeCopy: Record<Locale, Copy> = { fr, nl, en };
