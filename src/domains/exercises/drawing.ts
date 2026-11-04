import { z } from "zod";

/**
 * 4: the drawn pitch of a sheet (no I/O: shared with the editor). Positions
 * are in metres from the top left corner of the whole pitch, so a half
 * pitch is the left half of the same drawing.
 *
 * The pitch is a basketball court. The measures below follow the FIPFA laws
 * of the game as read when this was written (court 28 x 15 m, goal 6 m wide
 * between two posts, goal area 5 m deep and 8 m wide); they live here only,
 * to be adjusted when the laws change.
 */
export const pitch = { length: 28, width: 15, goalWidth: 6, goalAreaDepth: 5, goalAreaWidth: 8, centreRadius: 1.8 } as const;
/** SVG units per metre: a player is 14 units, a label 12, the --text-xs size. */
export const scale = 20;

export const objectKinds = ["player", "keeper", "ball", "cone", "plot", "chair", "zone", "area", "text", "move", "pass"] as const;
export type ObjectKind = (typeof objectKinds)[number];
export const teams = ["A", "B"] as const;
/** Kinds drawn as a line from (x, y) to (x2, y2). */
export const lineKinds: ObjectKind[] = ["move", "pass"];

const coordX = z.number().min(0).max(pitch.length),
  coordY = z.number().min(0).max(pitch.width);
export const drawingObject = z.object({
  id: z.string().regex(/^[a-z0-9]{1,12}$/),
  kind: z.enum(objectKinds),
  x: coordX,
  y: coordY,
  team: z.enum(teams).optional(),
  n: z.number().int().min(0).max(99).optional(),
  w: z.number().min(0.5).max(pitch.length).optional(),
  h: z.number().min(0.5).max(pitch.width).optional(),
  x2: coordX.optional(),
  y2: coordY.optional(),
  points: z.array(z.tuple([coordX, coordY])).max(20).optional(),
  label: z.string().trim().max(80).optional(),
});
export type DrawingObject = z.infer<typeof drawingObject>;
export const situation = z.object({ name: z.string().trim().max(40), half: z.boolean(), items: z.array(drawingObject).max(60) });
export type Situation = z.infer<typeof situation>;
export const drawing = z.object({ v: z.literal(1), situations: z.array(situation).min(1).max(8) });
export type Drawing = z.infer<typeof drawing>;

export const emptyDrawing = (): Drawing => ({ v: 1, situations: [{ name: "", half: false, items: [] }] });
/** A drawing with nothing on it is not worth keeping. */
export const isBlank = (d: Drawing | null | undefined) => !d || d.situations.every((s) => !s.items.length);
const round = (n: number) => Math.round(n * 10) / 10;
/** Keeps a point on the pitch (or its left half), to the decimetre. */
export function clamp(x: number, y: number, half = false) {
  return { x: round(Math.min(half ? pitch.length / 2 : pitch.length, Math.max(0, x))), y: round(Math.min(pitch.width, Math.max(0, y))) };
}
/** Moves an object by dx, dy metres, its arrow end and its points with it. */
export function moveBy(o: DrawingObject, dx: number, dy: number, half = false): DrawingObject {
  const p = clamp(o.x + dx, o.y + dy, half);
  const ax = p.x - o.x,
    ay = p.y - o.y;
  return {
    ...o,
    ...p,
    ...(o.x2 !== undefined && o.y2 !== undefined ? { x2: clamp(o.x2 + ax, o.y2 + ay, half).x, y2: clamp(o.x2 + ax, o.y2 + ay, half).y } : {}),
    ...(o.points ? { points: o.points.map(([px, py]) => [clamp(px + ax, py + ay, half).x, clamp(px + ax, py + ay, half).y] as [number, number]) } : {}),
  };
}
/** The next free number of a team, from 1. */
export function nextNumber(items: DrawingObject[], team: "A" | "B") {
  const used = new Set(items.filter((o) => (o.kind === "player" || o.kind === "keeper") && o.team === team).map((o) => o.n));
  let n = 1;
  while (used.has(n)) n++;
  return Math.min(n, 99);
}
/** A short id, unique in the situation. */
export function newId(items: DrawingObject[], seed: number) {
  const used = new Set(items.map((o) => o.id));
  let n = seed;
  while (used.has(n.toString(36))) n++;
  return n.toString(36);
}
