import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { buildSlides, delta, suggestedThanks } from "../src/domains/report/slides";
import { reportPptx } from "../src/domains/report/pptx";
import { reportCopy, reportSections } from "../src/components/report-copy";
import type { ActivityReport } from "../src/domains/report/service";

/** Wave 15 (C11): the report's pages, the PowerPoint file read back, texts. */
const report = {
  organization_id: "o",
  club: { name: "Club test", logo_version: null },
  seasons: [],
  season: { id: "s", name: "2025-26", starts_on: "2025-07-01", ends_on: "2026-06-30" },
  previous: { name: "2024-25", figures: { members: 20, players: 14, teams: 2, trainings: 60, hours: 110, attendance: 78 } },
  team: null,
  money: true,
  figures: { members: 24, players: 16, teams: 2, trainings: 72, hours: 140, attendance: 82 },
  tournaments: [{ title: "Tournoi de Gand", starts_on: "2026-03-14", destination: "Gand", final_rank: 2, teams_count: 8, result_note: "", team: "Équipe A" }],
  matches: [{ team: "Équipe A", played: 10, won: 6, drawn: 2, lost: 2, scored: 31, conceded: 18 }],
  highlights: [{ title: "Fête du club", day: "2026-05-30", place: "Hall du Parc", kind: "event" }],
  staff: { coaches: ["Sam Leroy"], volunteers: 3, courses: [] },
  equipment: { chairs: 8, purchases: [] },
  finances: [
    { direction: "in", category: "dues", cents: 600000 },
    { direction: "out", category: "equipment", cents: 950000 },
  ],
  thanks: { partners: ["Garage Dupont"], funders: ["ADEPS"] },
  // Lot 5 (05/11/2026): awards and the year's obligations.
  awards: [{ title: "Coupe de Belgique", competition: "Coupe", kind: "team" as const, place: 2, awarded_on: "2026-05-01", team: "Aigles", person: null }],
  obligations: [
    { title: "Assemblée générale tenue", due_on: "2026-06-30", done_on: "2026-06-12" },
    { title: "Comptes déposés", due_on: "2026-07-31", done_on: null },
  ],
} as unknown as ActivityReport;
const t = reportCopy.fr;
const all = { sections: [...reportSections], word: "Bravo à tous.", thanks: "Merci !", locale: "fr" as const };

describe("report pages", () => {
  it("writes the change against last season", () => {
    expect([delta(24, 20), delta(2, 2), delta(78, 82, " pts"), delta(5, null)]).toEqual(["+4", "±0", "-4 pts", ""]);
  });
  it("keeps the chosen sections in order, with the figures, the ranks and the frames", () => {
    const slides = buildSlides(report, all, t, { dues: "Cotisations", equipment: "Matériel" });
    expect(slides.map((s) => s.id)).toEqual(["cover", "word", "figures", "results", "highlights", "awards", "staff", "equipment", "finances", "obligations", "thanks"]);
    expect(slides[5].lines).toEqual(["Coupe de Belgique · Coupe · 2e place · Aigles · 1 mai"]);
    expect(slides[9].lines?.[0]).toBe("1 obligations sur 2 tenues cette année");
    expect(slides[9].lines?.[2]).toContain("Comptes déposés · à faire");
    expect(slides[2].numbers?.[0]).toEqual({ label: "Membres", value: "24", note: "+4 par rapport à 2024-25" });
    expect(slides[3].lines?.[0]).toContain("2e sur 8");
    expect(slides[4].photos?.[0].caption).toContain("Fête du club");
    expect(slides[8].charts?.map((c) => c.labels)).toEqual([["Cotisations"], ["Matériel"]]);
    expect(buildSlides(report, { ...all, sections: ["figures", "cover"] }, t, {}).map((s) => s.id)).toEqual(["cover", "figures"]);
  });
  it("leaves the finances out without the money right, and empty texts out", () => {
    const slides = buildSlides({ ...report, money: false, finances: null } as ActivityReport, { ...all, word: " ", thanks: "" }, t, {});
    expect(slides.map((s) => s.id)).not.toContain("finances");
    expect(slides.map((s) => s.id)).not.toContain("word");
    expect(slides.map((s) => s.id)).not.toContain("thanks");
  });
  it("suggests the thanks from the partners and the funders", () => {
    expect(suggestedThanks(report, t)).toBe("Nos partenaires : Garage Dupont.\nNos financeurs publics : ADEPS.");
  });
});

describe("PowerPoint file", () => {
  it("opens with one slide per page, real text, native charts and photo frames", async () => {
    const slides = buildSlides(report, all, t, { dues: "Cotisations", equipment: "Matériel" });
    const file = await reportPptx(slides, { club: "Club test", title: "Rapport", photo: t.photo });
    const zip = await JSZip.loadAsync(file);
    const names = Object.keys(zip.files);
    expect(names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))).toHaveLength(slides.length);
    expect(names.filter((n) => /^ppt\/charts\/chart\d+\.xml$/.test(n))).toHaveLength(2);
    const texts = (await Promise.all(names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).map((n) => zip.file(n)!.async("string")))).join("");
    for (const s of ["Rapport d’activité 2025-26", "Le club en chiffres", "Membres", "Tournoi de Gand", "Glissez une photo ici", "Merci !"]) expect(texts).toContain(s);
    expect((texts.match(/<a:t>/g) ?? []).length).toBeGreaterThan(30);
    expect(texts).not.toContain("<p:pic>");
  });
  it("has the same texts in three languages, without long dashes", () => {
    const keys = (o: object): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" && !Array.isArray(v) ? keys(v).map((x) => `${k}.${x}`) : [k])).sort();
    const texts = (o: object): string[] => Object.values(o).flatMap((v) => (v && typeof v === "object" ? texts(v) : [String(v)]));
    expect(keys(reportCopy.nl)).toEqual(keys(reportCopy.fr));
    expect(keys(reportCopy.en)).toEqual(keys(reportCopy.fr));
    for (const l of ["fr", "nl", "en"] as const) for (const x of texts(reportCopy[l])) expect(x).not.toMatch(/[–—]/);
  });
});
