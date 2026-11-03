import type { ActivityReport } from "./service";
import type { ReportCopy, ReportSection } from "../../components/report-copy";

/**
 * The pages of the activity report (wave 15, C11), one model for the screen
 * preview, the print and the PowerPoint file: titles, big numbers, lines,
 * simple tables, native charts and empty photo frames.
 */
export type ReportOptions = { sections: ReportSection[]; word: string; thanks: string; locale: "fr" | "nl" | "en" };
export type Slide = {
  id: ReportSection;
  title: string;
  subtitle?: string;
  numbers?: { label: string; value: string; note: string }[];
  text?: string;
  lines?: string[];
  table?: { head: string[]; rows: string[][] };
  charts?: { title: string; labels: string[]; values: number[] }[];
  photos?: { caption: string }[];
};

const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? String(v[k]) : m));
const tag = (l: string) => (l === "en" ? "en-GB" : `${l}-BE`);

/** "+12" or "-3", "+4 pts" for a rate; "" without a previous season. */
export function delta(now: number | null, before: number | null, unit = "") {
  if (now === null || before === null) return "";
  const d = now - before;
  return `${d > 0 ? "+" : d < 0 ? "-" : "±"}${Math.abs(d)}${unit}`;
}

/** The thanks suggested from the active partners and the grants of the season. */
export function suggestedThanks(r: ActivityReport, t: ReportCopy) {
  if (!r.season || !("thanks" in r)) return "";
  const parts = [];
  if (r.thanks.partners.length) parts.push(`${t.partners} : ${r.thanks.partners.join(", ")}.`);
  if (r.thanks.funders.length) parts.push(`${t.funders} : ${r.thanks.funders.join(", ")}.`);
  return parts.join("\n");
}

export function buildSlides(r: ActivityReport, o: ReportOptions, t: ReportCopy, categories: Record<string, string>): Slide[] {
  if (!r.season || !("figures" in r)) return [];
  const want = (s: ReportSection) => o.sections.includes(s);
  const money = (c: number) => new Intl.NumberFormat(tag(o.locale), { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(c / 100);
  const date = (d: string) => new Intl.DateTimeFormat(tag(o.locale), { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z"));
  const title = fill(t.reportOf, { season: r.season.name });
  const slides: Slide[] = [];
  if (want("cover")) slides.push({ id: "cover", title, subtitle: [r.club.name, r.team].filter(Boolean).join(" · "), photos: [{ caption: t.photo }] });
  if (want("word") && o.word.trim()) slides.push({ id: "word", title: t.word, text: o.word.trim() });
  if (want("figures")) {
    const f = r.figures,
      p = r.previous?.figures ?? null;
    const note = (k: keyof typeof f, unit = "") => (p ? fill(t.versus, { delta: delta(f[k], p[k], unit), season: r.previous!.name }) : t.noPrevious);
    slides.push({
      id: "figures",
      title: t.sectionNames.figures,
      numbers: [
        { label: t.figures.members, value: String(f.members), note: note("members") },
        { label: t.figures.players, value: String(f.players), note: note("players") },
        { label: t.figures.teams, value: String(f.teams), note: note("teams") },
        { label: t.figures.trainings, value: String(f.trainings), note: note("trainings") },
        { label: t.figures.hours, value: String(f.hours), note: note("hours") },
        { label: t.figures.attendance, value: f.attendance === null ? "…" : `${f.attendance} %`, note: note("attendance", " pts") },
      ],
    });
  }
  if (want("results")) {
    const lines = [
      ...r.tournaments.map((x) =>
        [
          x.title,
          x.final_rank ? (x.teams_count ? fill(t.rank, { rank: x.final_rank, teams: x.teams_count }) : fill(t.rankAlone, { rank: x.final_rank })) : "",
          x.result_note,
          x.team ?? "",
          date(x.starts_on),
        ]
          .filter(Boolean)
          .join(" · "),
      ),
    ];
    slides.push({
      id: "results",
      title: t.sectionNames.results,
      lines: lines.length ? lines : r.matches.length ? undefined : [t.noResults],
      table: r.matches.length
        ? { head: [t.team, t.matches], rows: r.matches.map((m) => [m.team, fill(t.matchLine, { won: m.won, drawn: m.drawn, lost: m.lost, scored: m.scored, conceded: m.conceded })]) }
        : undefined,
    });
  }
  if (want("highlights"))
    slides.push({
      id: "highlights",
      title: t.sectionNames.highlights,
      lines: r.highlights.length ? undefined : [t.noHighlights],
      photos: r.highlights.slice(0, 6).map((h) => ({ caption: [h.title, date(h.day), h.place].filter(Boolean).join(" · ") })),
    });
  if (want("staff"))
    slides.push({
      id: "staff",
      title: t.sectionNames.staff,
      lines: [
        ...(r.staff.coaches.length ? [`${t.coaches} : ${r.staff.coaches.join(", ")}`] : []),
        ...(r.staff.volunteers ? [fill(t.volunteers, { n: r.staff.volunteers })] : []),
        ...(r.staff.courses.length ? [`${t.courses} : ${r.staff.courses.map((c) => (c.n > 1 ? `${c.title} (${c.n})` : c.title)).join(", ")}`] : []),
        // 6: « 2 joueurs sélectionnés en équipe nationale ».
        ...(r.national ? [fill(t.national, { n: r.national })] : []),
      ],
    });
  if (want("equipment"))
    slides.push({
      id: "equipment",
      title: t.sectionNames.equipment,
      lines: [
        fill(t.equipmentChairs, { n: r.equipment.chairs }),
        ...(r.equipment.purchases.length
          ? [`${t.purchases} :`, ...r.equipment.purchases.map((x) => [x.name, x.purchase_value_cents !== null ? money(x.purchase_value_cents) : "", x.funder ? fill(t.financedBy, { funder: x.funder }) : ""].filter(Boolean).join(" · "))]
          : []),
      ],
    });
  if (want("finances") && r.money && r.finances) {
    const side = (d: "in" | "out") => r.finances!.filter((x) => x.direction === d);
    slides.push({
      id: "finances",
      title: t.sectionNames.finances,
      charts: (
        [
          ["in", t.income],
          ["out", t.expenses],
        ] as const
      )
        .map(([d, label]) => ({ title: `${label} · ${money(side(d).reduce((n, x) => n + x.cents, 0))}`, labels: side(d).map((x) => categories[x.category] ?? x.category), values: side(d).map((x) => Math.round(x.cents / 100)) }))
        .filter((c) => c.values.length),
      lines: r.finances.length ? undefined : [t.noData],
    });
  }
  if (want("thanks") && o.thanks.trim()) slides.push({ id: "thanks", title: t.sectionNames.thanks, text: o.thanks.trim() });
  return slides;
}
