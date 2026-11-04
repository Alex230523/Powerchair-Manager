import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { exerciseCommand, libraryCommand, tagColors } from "../src/domains/exercises/schema";
import { clamp, drawing, moveBy, newId, nextNumber, pitch, type Drawing } from "../src/domains/exercises/drawing";
import { describeDrawing, describeSituation, fieldCopy, objectName } from "../src/components/field-copy";
import { exercisesCopy } from "../src/components/exercises-copy";
import { imagePdf } from "../src/lib/image-pdf";
import { menuGroups, type Workspace } from "../src/components/menu";

/** 4: exercise and tactic sheets: commands, drawing, description, PDF export, copy, menu, migration. */
const keys = (o: object): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? keys(v).map((x) => `${k}.${x}`) : [k])).sort();
const base = {
  action: "create",
  title: "Sortie de balle",
  objective: "tactics",
  description: "",
  safety: "",
  durationMinutes: 15,
  playersMin: 2,
  playersMax: 6,
  level: "beginner",
  suited: "both",
  equipment: "",
  variants: "",
  videoUrl: "",
  tags: [],
  shared: true,
};
const sample: Drawing = {
  v: 1,
  situations: [
    {
      name: "Coup franc",
      half: false,
      items: [
        { id: "a", kind: "player", team: "A", n: 3, x: 10, y: 5 },
        { id: "b", kind: "player", team: "B", n: 1, x: 12, y: 6 },
        { id: "c", kind: "ball", x: 10.5, y: 5.2 },
        { id: "d", kind: "pass", x: 10, y: 5, x2: 12, y2: 6 },
        { id: "e", kind: "zone", x: 0, y: 3.5, w: 5, h: 8 },
      ],
    },
  ],
};

describe("4: the sheet's command", () => {
  it("takes the type, a free objective of 500 characters and the genre, with defaults for older callers", () => {
    const old = exerciseCommand.parse(base);
    expect(old).toMatchObject({ genre: "exercise", goal: "" });
    expect(exerciseCommand.safeParse({ ...base, goal: "x".repeat(500), genre: "tactic" }).success).toBe(true);
    expect(exerciseCommand.safeParse({ ...base, goal: "x".repeat(501) }).success).toBe(false);
    expect(exerciseCommand.safeParse({ ...base, genre: "match" }).success).toBe(false);
    expect(exerciseCommand.safeParse({ ...base, tags: ["a".repeat(31)] }).success).toBe(false);
  });
  it("manages tags among the chart colours only", () => {
    const id = "6f1c2a52-6a7e-4c55-9d8f-1f2e3d4c5b6a";
    expect(tagColors).toEqual(["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"]);
    expect(exerciseCommand.safeParse({ action: "tagColor", tagId: id, color: "c3" }).success).toBe(true);
    expect(exerciseCommand.safeParse({ action: "tagColor", tagId: id, color: "#ff0000" }).success).toBe(false);
    expect(exerciseCommand.safeParse({ action: "tagMerge", tagId: id, into: id }).success).toBe(true);
    expect(libraryCommand.safeParse({ action: "decide", exerciseId: id, approve: false, reason: "Trop long" }).success).toBe(true);
    expect(libraryCommand.parse({ ...base, action: "publish" })).toMatchObject({ drawing: null });
  });
});

describe("4: the drawing", () => {
  it("validates a drawing on the pitch and refuses one off it", () => {
    expect(drawing.safeParse(sample).success).toBe(true);
    expect(drawing.safeParse({ v: 1, situations: [] }).success).toBe(false);
    const off = structuredClone(sample);
    off.situations[0].items[0].x = pitch.length + 1;
    expect(drawing.safeParse(off).success).toBe(false);
    expect(drawing.safeParse({ v: 1, situations: Array.from({ length: 9 }, () => ({ name: "", half: false, items: [] })) }).success).toBe(false);
  });
  it("moves an object with its arrow end, kept on the pitch or its half", () => {
    const arrow = sample.situations[0].items[3];
    expect(moveBy(arrow, 1, -1)).toMatchObject({ x: 11, y: 4, x2: 13, y2: 5 });
    expect(moveBy({ id: "z", kind: "cone", x: 13, y: 1 }, 5, -5, true)).toMatchObject({ x: 14, y: 0 });
    expect(clamp(-3, 99)).toEqual({ x: 0, y: 15 });
  });
  it("numbers the players of each team and gives unique ids", () => {
    const items = sample.situations[0].items;
    expect(nextNumber(items, "A")).toBe(1);
    expect(nextNumber(items, "B")).toBe(2);
    // 10 to 14 are a to e, already taken.
    expect(newId(items, 10)).toBe("f");
  });
});

describe("4: the text description for screen readers", () => {
  it("names each object by its team letter and number, never by colour alone", () => {
    expect(objectName("fr", sample.situations[0].items[0])).toBe("joueur A3");
    const text = describeSituation("fr", sample.situations[0], 0);
    expect(text).toContain("Coup franc (terrain entier, 28 x 15 m)");
    expect(text).toContain("joueur A3 à 10 m de la gauche et 5 m du haut");
    expect(text).toContain("passe ou tir de joueur A3 vers joueur B1");
    expect(text).toContain("zone de 5 m sur 8 m");
    expect(describeDrawing("en", sample)[0]).toContain("pass or shot from player A3 to player B1");
    expect(describeSituation("nl", { name: "", half: true, items: [] }, 1)).toBe("Situatie 2 (half veld, 28/2 x 15 m): er staat niets.");
  });
});

describe("4: the PDF export", () => {
  it("wraps a JPEG in a one page A4 PDF", () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
    const pdf = imagePdf(jpeg, 1200, 680, "Sortie de balle · Coup franc");
    const text = new TextDecoder("latin1").decode(pdf);
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("/MediaBox [0 0 842 595]");
    expect(text).toContain("/Filter /DCTDecode /Length 9");
    expect(text).toContain("(Sortie de balle ? Coup franc)");
    const xref = Number(text.match(/startxref\n(\d+)/)![1]);
    expect(text.slice(xref, xref + 4)).toBe("xref");
  });
});

describe("4: texts, menu and migration", () => {
  it("has the same texts in three languages, without long dashes nor the banned words", () => {
    for (const copy of [exercisesCopy, fieldCopy]) {
      expect(keys(copy.nl)).toEqual(keys(copy.fr));
      expect(keys(copy.en)).toEqual(keys(copy.fr));
      const all = JSON.stringify(copy) + Object.values(copy).map((c) => Object.values(c).map(String).join(" ")).join(" ");
      expect(all).not.toMatch(/[–—]/);
      expect(all).not.toMatch(/convoqu|opgeroep|summon|call-up/i);
    }
    expect(exercisesCopy.fr.objective).toBe("Type");
    expect(exercisesCopy.fr.x4.uses(6, 2)).toBe("Utilisée dans 6 entraînements et 2 matchs");
    expect(exercisesCopy.fr.x4.createTag("relance")).toBe("Créer le tag « relance »");
    expect(exercisesCopy.fr.x4.creator("Lina", "Club A")).toBe("Créée par Lina (Club A)");
  });
  it("opens the library to the federation through its courses competence", () => {
    const fed = (role: Workspace["contexts"][number]["role"], permissions: string[]): Workspace => ({
      user: { name: "Alex" },
      contexts: [{ id: "m1", name: "Fédé", role }],
      profiles: [],
      selected: { id: "m1", organization_id: "o1", organization_name: "Fédé", kind: "federation", logo_version: null },
      permissions,
    });
    const routes = (w: Workspace) => menuGroups(w).flatMap((g) => g.items.map((i) => i.route));
    expect(routes(fed("federation_president", []))).toContain("/exercises");
    expect(routes(fed("federation_worker", ["federation.courses"]))).toContain("/exercises");
    expect(routes(fed("federation_worker", ["federation.finance"]))).not.toContain("/exercises");
  });
  it("migrates additively and can run twice", () => {
    const sql = readFileSync("db/migrations/0106_exercise_tactics.sql", "utf8");
    expect(sql).not.toMatch(/DROP TABLE|DROP COLUMN/);
    expect(sql.match(/CREATE TABLE IF NOT EXISTS/g)?.length).toBe(6);
    expect(sql).toContain("UPDATE exercise SET tags = '{}'");
  });
  it("keeps the editor usable without dragging: keys, tap to place, fields and nudges", () => {
    const src = readFileSync("src/components/field-editor.tsx", "utf8");
    for (const k of ["ArrowLeft", "Delete", "tabIndex={0}", "aria-describedby={descId}", "t.nudge.left", 'type="number"', "undo", "redo"]) expect(src).toContain(k);
    expect(src).not.toContain("style={{");
  });
});
