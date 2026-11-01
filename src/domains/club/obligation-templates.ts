/**
 * Wave 16 (A): the obligations proposed from the club's legal form. A
 * proposal only: the club edits, removes or adds lines, nothing is imposed.
 * Due dates stay for the club to enter (legal deadlines vary and are not
 * verified here).
 */
export type LegalForm = "asbl" | "de_facto" | "other";
export type AutoSource = "none" | "accounts_approved" | "accounts_filed" | "affiliation";
type Lang = "fr" | "nl" | "en";
export type Template = { key: string; auto: AutoSource; title: Record<Lang, string> };

const t = (key: string, fr: string, nl: string, en: string, auto: AutoSource = "none"): Template => ({ key, auto, title: { fr, nl, en } });
const federation = t("federation", "Affiliation fédération (BPCF) payée", "Aansluiting federatie (BPCF) betaald", "Federation affiliation (BPCF) paid");
const sportea = t("sportea", "Affiliation Sportéa payée", "Aansluiting Sportéa betaald", "Sportéa affiliation paid");
const insurance = t("insurance", "Assurance du club renouvelée", "Verzekering van de club vernieuwd", "Club insurance renewed");

export const obligationTemplates: Record<LegalForm, Template[]> = {
  asbl: [
    federation,
    sportea,
    insurance,
    t("assembly", "Assemblée générale tenue", "Algemene vergadering gehouden", "General assembly held"),
    t("accountsApproved", "Comptes approuvés par l'AG", "Rekeningen goedgekeurd door de AV", "Accounts approved by the assembly", "accounts_approved"),
    t("accountsFiled", "Comptes déposés", "Rekeningen neergelegd", "Accounts filed", "accounts_filed"),
    t("ubo", "Registre UBO confirmé ou mis à jour", "UBO-register bevestigd of bijgewerkt", "UBO register confirmed or updated"),
    t("board", "Conseil d'administration tenu", "Raad van bestuur gehouden", "Board meeting held"),
    t("members", "Liste des membres à jour", "Ledenlijst bijgewerkt", "Members list up to date"),
  ],
  de_facto: [
    federation,
    sportea,
    insurance,
    t("annualMeeting", "Réunion annuelle des membres tenue", "Jaarlijkse ledenvergadering gehouden", "Annual members' meeting held"),
    t("accountsPresented", "Comptes de l'année présentés aux membres", "Jaarrekening voorgesteld aan de leden", "Year's accounts presented to the members"),
  ],
  other: [federation, sportea, insurance],
};

export type ObligationState = "done" | "late" | "todo";
/** Done when ticked (or ticked by the accounts); late once the due date has passed. */
export function obligationState(o: { done_on: string | null; due_on: string | null }, today: string): ObligationState {
  if (o.done_on) return "done";
  if (o.due_on && o.due_on < today) return "late";
  return "todo";
}

/** The home's « Statut du club » square: progress and the next two lines to do. */
export function clubStatusSummary(rows: { title: string; done_on: string | null; due_on: string | null }[], today: string) {
  const open = rows
    .filter((r) => !r.done_on)
    .sort((a, b) => (a.due_on ?? "9999").localeCompare(b.due_on ?? "9999") || a.title.localeCompare(b.title));
  return {
    done: rows.length - open.length,
    total: rows.length,
    late: open.filter((r) => obligationState(r, today) === "late").length,
    next: open.slice(0, 2).map((r) => ({ title: r.title, due: r.due_on })),
  };
}

/** « Préparer l'année suivante »: the same date one year later (29 February becomes 28). */
export function nextYearDate(iso: string | null) {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const day = m === 2 && d === 29 ? 28 : d;
  return `${y + 1}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
