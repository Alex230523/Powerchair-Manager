import type { Locale } from "@/lib/locale";
import { lineKinds, pitch, type Drawing, type DrawingObject, type ObjectKind, type Situation } from "@/domains/exercises/drawing";

/** 4: the words of the pitch editor, and the text description of a drawing for screen readers. */
const fr = {
  editor: "Éditeur de terrain",
  colon: " : ",
  situations: "Situations",
  situation: (n: number) => `Situation ${n}`,
  situationName: "Nom de la situation (sortie de balle, coup franc…)",
  addSituation: "Ajouter une situation",
  duplicateSituation: "Dupliquer la situation",
  removeSituation: "Supprimer la situation",
  half: "Demi-terrain",
  tools: "Outils",
  tool: {
    select: "Sélectionner",
    playerA: "Joueur A",
    playerB: "Joueur B",
    keeperA: "Gardien A",
    keeperB: "Gardien B",
    ball: "Ballon",
    cone: "Cône",
    plot: "Plot",
    chair: "Chaise",
    zone: "Zone rectangulaire",
    area: "Zone libre",
    text: "Texte",
    move: "Déplacement (flèche pleine)",
    pass: "Passe ou tir (flèche pointillée)",
  },
  howTo: "Choisissez un outil puis touchez le terrain pour placer l'objet. Pour une flèche, touchez le départ puis l'arrivée. Pour une zone libre, touchez chaque coin puis « Terminer la zone ». Avec le clavier : Tab pour choisir un objet, les flèches pour le déplacer (Maj pour aller plus loin), Suppr pour l'effacer, Ctrl+Z et Ctrl+Y pour annuler et rétablir.",
  arrowStart: "Touchez maintenant le point d'arrivée de la flèche.",
  areaPoints: (n: number) => `${n} coin${n > 1 ? "s" : ""} placé${n > 1 ? "s" : ""}.`,
  finishArea: "Terminer la zone",
  undo: "Annuler",
  redo: "Rétablir",
  selected: "Objet choisi",
  nothingSelected: "Aucun objet choisi. Touchez un objet ou passez de l'un à l'autre avec Tab.",
  x: "Position X (m, de gauche à droite)",
  y: "Position Y (m, de haut en bas)",
  x2: "Arrivée X (m)",
  y2: "Arrivée Y (m)",
  w: "Largeur (m)",
  h: "Hauteur (m)",
  number: "Numéro",
  team: "Équipe",
  label: "Texte",
  nudge: { left: "Déplacer à gauche", right: "Déplacer à droite", up: "Déplacer vers le haut", down: "Déplacer vers le bas" },
  remove: "Supprimer l'objet",
  description: "Description du terrain",
  kinds: {
    player: "joueur",
    keeper: "gardien",
    ball: "ballon",
    cone: "cône",
    plot: "plot",
    chair: "chaise",
    zone: "zone",
    area: "zone libre",
    text: "texte",
    move: "déplacement",
    pass: "passe ou tir",
  } as Record<ObjectKind, string>,
  whole: "terrain entier",
  halfPitch: "demi-terrain",
  empty: "rien n'est placé",
  at: (x: number, y: number) => `à ${x} m de la gauche et ${y} m du haut`,
  from: (a: string, b: string) => `de ${a} vers ${b}`,
  sized: (w: number, h: number) => `de ${w} m sur ${h} m`,
  corners: (n: number) => `${n} coins`,
  teamOf: (team: string, n?: number) => `${team}${n ?? ""}`,
  itemAt: (what: string, where: string) => `${what} ${where}`,
};
type Copy = typeof fr;
const nl: Copy = {
  editor: "Veldeditor",
  colon: ": ",
  situations: "Situaties",
  situation: (n: number) => `Situatie ${n}`,
  situationName: "Naam van de situatie (opbouw, vrije trap…)",
  addSituation: "Een situatie toevoegen",
  duplicateSituation: "De situatie dupliceren",
  removeSituation: "De situatie verwijderen",
  half: "Half veld",
  tools: "Gereedschap",
  tool: {
    select: "Selecteren",
    playerA: "Speler A",
    playerB: "Speler B",
    keeperA: "Doelman A",
    keeperB: "Doelman B",
    ball: "Bal",
    cone: "Kegel",
    plot: "Hoedje",
    chair: "Stoel",
    zone: "Rechthoekige zone",
    area: "Vrije zone",
    text: "Tekst",
    move: "Verplaatsing (volle pijl)",
    pass: "Pass of schot (stippelpijl)",
  },
  howTo: "Kies een gereedschap en tik op het veld om het object te plaatsen. Voor een pijl tikt u op het begin en dan op het einde. Voor een vrije zone tikt u op elke hoek en dan op « De zone afwerken ». Met het toetsenbord: Tab om een object te kiezen, de pijltjes om het te verplaatsen (Shift voor verder), Delete om het te wissen, Ctrl+Z en Ctrl+Y om ongedaan te maken en opnieuw te doen.",
  arrowStart: "Tik nu op het eindpunt van de pijl.",
  areaPoints: (n: number) => `${n} hoek${n > 1 ? "en" : ""} geplaatst.`,
  finishArea: "De zone afwerken",
  undo: "Ongedaan maken",
  redo: "Opnieuw",
  selected: "Gekozen object",
  nothingSelected: "Geen object gekozen. Tik op een object of ga van het ene naar het andere met Tab.",
  x: "Positie X (m, van links naar rechts)",
  y: "Positie Y (m, van boven naar beneden)",
  x2: "Einde X (m)",
  y2: "Einde Y (m)",
  w: "Breedte (m)",
  h: "Hoogte (m)",
  number: "Nummer",
  team: "Ploeg",
  label: "Tekst",
  nudge: { left: "Naar links verplaatsen", right: "Naar rechts verplaatsen", up: "Naar boven verplaatsen", down: "Naar beneden verplaatsen" },
  remove: "Het object verwijderen",
  description: "Beschrijving van het veld",
  kinds: {
    player: "speler",
    keeper: "doelman",
    ball: "bal",
    cone: "kegel",
    plot: "hoedje",
    chair: "stoel",
    zone: "zone",
    area: "vrije zone",
    text: "tekst",
    move: "verplaatsing",
    pass: "pass of schot",
  } as Record<ObjectKind, string>,
  whole: "volledig veld",
  halfPitch: "half veld",
  empty: "er staat niets",
  at: (x: number, y: number) => `op ${x} m van links en ${y} m van boven`,
  from: (a: string, b: string) => `van ${a} naar ${b}`,
  sized: (w: number, h: number) => `van ${w} m op ${h} m`,
  corners: (n: number) => `${n} hoeken`,
  teamOf: (team: string, n?: number) => `${team}${n ?? ""}`,
  itemAt: (what: string, where: string) => `${what} ${where}`,
};
const en: Copy = {
  editor: "Pitch editor",
  colon: ": ",
  situations: "Situations",
  situation: (n: number) => `Situation ${n}`,
  situationName: "Name of the situation (build-up, free kick…)",
  addSituation: "Add a situation",
  duplicateSituation: "Duplicate the situation",
  removeSituation: "Delete the situation",
  half: "Half pitch",
  tools: "Tools",
  tool: {
    select: "Select",
    playerA: "Player A",
    playerB: "Player B",
    keeperA: "Goalkeeper A",
    keeperB: "Goalkeeper B",
    ball: "Ball",
    cone: "Cone",
    plot: "Marker",
    chair: "Chair",
    zone: "Rectangular zone",
    area: "Free zone",
    text: "Text",
    move: "Movement (solid arrow)",
    pass: "Pass or shot (dotted arrow)",
  },
  howTo: "Choose a tool, then tap the pitch to place the object. For an arrow, tap the start and then the end. For a free zone, tap each corner and then « Finish the zone ». With the keyboard: Tab to pick an object, the arrow keys to move it (Shift to go further), Delete to remove it, Ctrl+Z and Ctrl+Y to undo and redo.",
  arrowStart: "Now tap the end point of the arrow.",
  areaPoints: (n: number) => `${n} corner${n > 1 ? "s" : ""} placed.`,
  finishArea: "Finish the zone",
  undo: "Undo",
  redo: "Redo",
  selected: "Selected object",
  nothingSelected: "No object selected. Tap an object or move from one to the next with Tab.",
  x: "Position X (m, left to right)",
  y: "Position Y (m, top to bottom)",
  x2: "End X (m)",
  y2: "End Y (m)",
  w: "Width (m)",
  h: "Height (m)",
  number: "Number",
  team: "Team",
  label: "Text",
  nudge: { left: "Move left", right: "Move right", up: "Move up", down: "Move down" },
  remove: "Delete the object",
  description: "Description of the pitch",
  kinds: {
    player: "player",
    keeper: "goalkeeper",
    ball: "ball",
    cone: "cone",
    plot: "marker",
    chair: "chair",
    zone: "zone",
    area: "free zone",
    text: "text",
    move: "movement",
    pass: "pass or shot",
  } as Record<ObjectKind, string>,
  whole: "whole pitch",
  halfPitch: "half pitch",
  empty: "nothing placed",
  at: (x: number, y: number) => `${x} m from the left and ${y} m from the top`,
  from: (a: string, b: string) => `from ${a} to ${b}`,
  sized: (w: number, h: number) => `of ${w} m by ${h} m`,
  corners: (n: number) => `${n} corners`,
  teamOf: (team: string, n?: number) => `${team}${n ?? ""}`,
  itemAt: (what: string, where: string) => `${what} ${where}`,
};
export const fieldCopy = { fr, nl, en };

/** The name of one object, as read aloud: « joueur A3 », « ballon ». */
export function objectName(locale: Locale, o: DrawingObject) {
  const t = fieldCopy[locale];
  const base = t.kinds[o.kind];
  if (o.kind === "player" || o.kind === "keeper") return `${base} ${t.teamOf(o.team ?? "A", o.n)}`;
  if (o.kind === "text") return `${base} « ${o.label ?? ""} »`;
  return o.label ? `${base} « ${o.label} »` : base;
}
/** The nearest player or keeper to a point, to name an arrow's ends. */
function near(items: DrawingObject[], x: number, y: number) {
  let best: DrawingObject | null = null,
    d = 1.5;
  for (const o of items)
    if (o.kind === "player" || o.kind === "keeper" || o.kind === "ball") {
      const e = Math.hypot(o.x - x, o.y - y);
      if (e <= d) {
        d = e;
        best = o;
      }
    }
  return best;
}
/** One sentence per object. */
export function describeObject(locale: Locale, o: DrawingObject, items: DrawingObject[]) {
  const t = fieldCopy[locale];
  if (lineKinds.includes(o.kind) && o.x2 !== undefined && o.y2 !== undefined) {
    const a = near(items, o.x, o.y),
      b = near(items, o.x2, o.y2);
    return `${t.kinds[o.kind]} ${t.from(a ? objectName(locale, a) : t.at(o.x, o.y), b ? objectName(locale, b) : t.at(o.x2, o.y2))}`;
  }
  if (o.kind === "zone") return t.itemAt(`${objectName(locale, o)} ${t.sized(o.w ?? 1, o.h ?? 1)}`, t.at(o.x, o.y));
  if (o.kind === "area") return t.itemAt(`${objectName(locale, o)} (${t.corners(o.points?.length ?? 0)})`, t.at(o.x, o.y));
  return t.itemAt(objectName(locale, o), t.at(o.x, o.y));
}
/** The whole situation in words: its name, the pitch, then each object. */
export function describeSituation(locale: Locale, s: Situation, index: number) {
  const t = fieldCopy[locale];
  const head = `${s.name || t.situation(index + 1)} (${s.half ? t.halfPitch : t.whole}, ${pitch.length}${s.half ? "/2" : ""} x ${pitch.width} m)`;
  const order = [...s.items].sort((a, b) => Number(lineKinds.includes(a.kind)) - Number(lineKinds.includes(b.kind)));
  return `${head}${t.colon}${order.length ? order.map((o) => describeObject(locale, o, s.items)).join(" ; ") : t.empty}.`;
}
export function describeDrawing(locale: Locale, d: Drawing) {
  return d.situations.map((s, i) => describeSituation(locale, s, i));
}
