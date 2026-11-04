import { pdfDocument, type PdfLine } from "../../lib/pdf";

/**
 * A5: the printable match sheet (PDF): the match, our team with numbers,
 * positions and classifications, the staff, the referees, the score and
 * the day's events. Pure.
 */
type Sheet = {
  club: string;
  locale: "fr" | "nl" | "en";
  match: { team: string; opponent: string; home: boolean; competition: string; kind: string; starts_at: string; venue: string; status: string; our_score: number | null; their_score: number | null; validated_at: string | null };
  lineup: { full_name: string; starter: boolean; position: string; jersey_number: number | null; classification: string; goals: number; yellow_cards: number; red_card: boolean }[];
  staff: { full_name: string; role: string }[];
  referees: { name: string; role: string }[];
  live: { kind: string; name: string; minute: number | null }[];
};
const words = {
  fr: {
    title: "Feuille de match",
    when: "Date : {date}",
    where: "Lieu : {venue}",
    competition: "Compétition : {name}",
    kinds: { league: "Championnat", cup: "Coupe", tournament: "Tournoi", friendly: "Amical" } as Record<string, string>,
    score: "Score : {home} {hs} - {as} {away}",
    noScore: "Score : à compléter",
    validated: "Résultat validé le {date}",
    players: "Joueurs",
    starter: "titulaire",
    sub: "remplaçant",
    classification: { PF1: "PF1", PF2: "PF2", pending: "classification en cours", not_classified: "non classifié" } as Record<string, string>,
    staff: "Staff",
    roles: { coach: "Coach", assistant: "Assistant", volunteer: "Accompagnateur" } as Record<string, string>,
    referees: "Arbitres",
    refRoles: { main: "Arbitre principal", assistant: "Arbitre assistant", table: "Table" } as Record<string, string>,
    noReferee: "Aucun arbitre désigné",
    events: "Faits du match",
    live: { goal: "But", goal_against: "But adverse", yellow: "Carton jaune", red: "Carton rouge", sub_in: "Entrée", sub_out: "Sortie", corner: "Corner", corner_against: "Corner adverse" } as Record<string, string>,
    signatures: "Signatures : capitaine ______________   coach ______________   arbitre ______________",
  },
  nl: {
    title: "Wedstrijdblad",
    when: "Datum: {date}",
    where: "Plaats: {venue}",
    competition: "Competitie: {name}",
    kinds: { league: "Competitie", cup: "Beker", tournament: "Tornooi", friendly: "Vriendschappelijk" } as Record<string, string>,
    score: "Uitslag: {home} {hs} - {as} {away}",
    noScore: "Uitslag: in te vullen",
    validated: "Uitslag bevestigd op {date}",
    players: "Spelers",
    starter: "basis",
    sub: "wissel",
    classification: { PF1: "PF1", PF2: "PF2", pending: "classificatie lopend", not_classified: "niet geclassificeerd" } as Record<string, string>,
    staff: "Staf",
    roles: { coach: "Coach", assistant: "Assistent", volunteer: "Begeleider" } as Record<string, string>,
    referees: "Scheidsrechters",
    refRoles: { main: "Hoofdscheidsrechter", assistant: "Assistent-scheidsrechter", table: "Tafel" } as Record<string, string>,
    noReferee: "Geen scheidsrechter aangeduid",
    events: "Feiten van de wedstrijd",
    live: { goal: "Doelpunt", goal_against: "Doelpunt tegenstander", yellow: "Gele kaart", red: "Rode kaart", sub_in: "In", sub_out: "Uit", corner: "Hoekschop", corner_against: "Hoekschop tegenstander" } as Record<string, string>,
    signatures: "Handtekeningen: kapitein ______________   coach ______________   scheidsrechter ______________",
  },
};
const fill = (x: string, v: Record<string, string | number>) => x.replace(/\{(\w+)\}/g, (k, n: string) => (n in v ? String(v[n]) : k));

export function matchSheetPdf(s: Sheet) {
  const w = words[s.locale === "nl" ? "nl" : "fr"];
  const tag = s.locale === "nl" ? "nl-BE" : "fr-BE";
  const when = new Intl.DateTimeFormat(tag, { dateStyle: "full", timeStyle: "short", timeZone: "Europe/Brussels" }).format(new Date(s.match.starts_at));
  const [home, away] = s.match.home ? [s.match.team, s.match.opponent] : [s.match.opponent, s.match.team];
  const played = s.match.our_score !== null && s.match.their_score !== null;
  const [hs, as] = s.match.home ? [s.match.our_score, s.match.their_score] : [s.match.their_score, s.match.our_score];
  const lines: PdfLine[] = [
    { text: `${w.title} · ${s.club}`, size: 16, bold: true },
    { text: `${home} - ${away}`, size: 13, bold: true, gap: 4 },
    { text: fill(w.when, { date: when }), gap: 6 },
    ...(s.match.venue ? [{ text: fill(w.where, { venue: s.match.venue }) }] : []),
    { text: fill(w.competition, { name: [w.kinds[s.match.kind] ?? s.match.kind, s.match.competition].filter(Boolean).join(" · ") }) },
    { text: played ? fill(w.score, { home, away, hs: hs ?? "", as: as ?? "" }) : w.noScore, bold: true, size: 12, gap: 8 },
    ...(s.match.validated_at ? [{ text: fill(w.validated, { date: new Intl.DateTimeFormat(tag, { dateStyle: "long", timeZone: "Europe/Brussels" }).format(new Date(s.match.validated_at)) }) }] : []),
    { text: `${w.players} (${s.match.team})`, bold: true, gap: 12 },
    ...s.lineup.map((p) => ({
      text: `${p.jersey_number ?? "  "}  ${p.full_name} · ${p.starter ? w.starter : w.sub}${p.position ? ` · ${p.position}` : ""} · ${w.classification[p.classification] ?? p.classification}${p.goals ? ` · ${w.live.goal} ×${p.goals}` : ""}${p.yellow_cards ? ` · ${w.live.yellow} ×${p.yellow_cards}` : ""}${p.red_card ? ` · ${w.live.red}` : ""}`,
      indent: 8,
    })),
    { text: w.staff, bold: true, gap: 12 },
    ...s.staff.map((x) => ({ text: `${x.full_name} · ${w.roles[x.role] ?? x.role}`, indent: 8 })),
    { text: w.referees, bold: true, gap: 12 },
    ...(s.referees.length ? s.referees.map((r) => ({ text: `${r.name} · ${w.refRoles[r.role] ?? r.role}`, indent: 8 })) : [{ text: w.noReferee, indent: 8 }]),
    ...(s.live.length ? [{ text: w.events, bold: true, gap: 12 }, ...s.live.map((e) => ({ text: `${e.minute !== null ? `${e.minute}'  ` : ""}${w.live[e.kind] ?? e.kind}${e.name ? ` · ${e.name}` : ""}`, indent: 8 }))] : []),
    { text: w.signatures, size: 10, gap: 24 },
  ];
  return pdfDocument(lines, `${w.title} ${home} - ${away}`);
}
