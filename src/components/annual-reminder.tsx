"use client";
import { useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import { annualCopy } from "./annual-reminder-copy";
import type { fundingView } from "@/domains/funding/service";

/**
 * 9, part 3: « Rappel annuel » on a grant or a sponsor: a task that comes
 * back every year on the chosen date (the call reopens, the contract
 * renews), with its person in charge. It outlives the year's file.
 */
type View = Awaited<ReturnType<typeof fundingView>>;
type Post = (body: Record<string, unknown>, done: string) => Promise<boolean>;
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);

export function AnnualReminder({ locale, data, grantId = null, partnerId = null, closed = false, busy, post }: { locale: Locale; data: View; grantId?: string | null; partnerId?: string | null; closed?: boolean; busy: boolean; post: Post }) {
  const t = annualCopy[locale];
  const [open, setOpen] = useState(false);
  const reminder = data.tasks.find((x) => x.source_kind === "annualReminder" && x.status !== "done" && (grantId ? x.grant_id === grantId : x.partner_id === partnerId));
  const id = grantId ?? partnerId ?? "x";
  function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void post(
      { organizationId: data.organization_id, action: "annualReminder", grantId, partnerId, title: String(f.get("title") ?? ""), dueOn: String(f.get("due") ?? ""), responsibleId: String(f.get("who") ?? "") || null },
      t.saved,
    ).then((ok) => ok && setOpen(false));
  }
  return (
    <section className="annual-reminder" aria-labelledby={`annual-${id}`}>
      <h3 id={`annual-${id}`}>{t.title}</h3>
      <p className={reminder ? "" : "muted"}>
        {reminder && reminder.due_on
          ? t.current
              .replace("{date}", new Intl.DateTimeFormat(tag(locale), { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(reminder.due_on + "T12:00:00Z")))
              .replace("{who}", reminder.responsible_name ?? t.nobody)
          : t.none}
      </p>
      {closed && grantId && <p className="muted">{t.renewHint}</p>}
      {data.can.manage &&
        (open ? (
          <form className="finance-form" onSubmit={save}>
            <label htmlFor={`annual-title-${id}`}>
              {t.label}
              <input id={`annual-title-${id}`} name="title" required minLength={2} maxLength={200} defaultValue={reminder?.title ?? (grantId ? t.grantDefault : t.partnerDefault)} />
            </label>
            <label htmlFor={`annual-due-${id}`}>
              {t.date}
              <input id={`annual-due-${id}`} name="due" type="date" required defaultValue={reminder?.due_on ?? ""} />
            </label>
            <label htmlFor={`annual-who-${id}`}>
              {t.who}
              <select id={`annual-who-${id}`} name="who" defaultValue={reminder?.responsible_id ?? ""}>
                <option value="">{t.nobody}</option>
                {data.people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                  </option>
                ))}
              </select>
            </label>
            <p className="actions">
              <button type="submit" className="button secondary sm" disabled={busy}>
                {t.save}
              </button>
            </p>
          </form>
        ) : (
          <button type="button" className="button secondary sm" onClick={() => setOpen(true)}>
            {t.title}
          </button>
        ))}
    </section>
  );
}
