"use client";
import { useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import { goalsCopy } from "./fundraising-goals-copy";
import type { fundraisingView } from "@/domains/fundraising/service";
import { cssVars } from "./css-vars";
import { externalHref } from "@/lib/html";

/**
 * 9, part 3: a fundraising action's outside link, its goals per person
 * (« vendre 20 boîtes ») with their progress, and tasks given to players
 * and coaches in the central to-do.
 */
type View = Awaited<ReturnType<typeof fundraisingView>>;
type Pot = View["pots"][number];
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""));

export function PotExtras({ locale, pot, data, busy, send }: { locale: Locale; pot: Pot; data: View; busy: boolean; send: (b: Record<string, unknown>) => Promise<boolean> }) {
  const t = goalsCopy[locale];
  const [given, setGiven] = useState("");
  const manage = data.can.manage;
  const mine = pot.goals.filter((g) => data.ownProfiles.some((o) => o.id === g.profile_id));
  function goal(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void send({ action: "goal", potId: pot.id, profileId: String(f.get("profile")), target: Number(f.get("target") || 0), unit: String(f.get("unit") ?? "") });
  }
  function tasks(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const ids = f.getAll("who").map(String);
    void send({ action: "tasks", potId: pot.id, title: String(f.get("title") ?? ""), dueOn: String(f.get("due") ?? "") || null, profileIds: ids }).then((ok) => {
      if (ok) {
        setGiven(fill(t.given, { n: ids.length }));
        form.reset();
      }
    });
  }
  return (
    <div className="pot-extras">
      {pot.link_url && (
        <p>
          <a href={externalHref(pot.link_url)} target="_blank" rel="noopener noreferrer">
            {t.link}
            <span className="sr-only"> : {pot.name}</span>
          </a>
        </p>
      )}
      {pot.goals.length > 0 && (
        <>
          <h4 className="card-subtitle">{t.goals}</h4>
          <ul className="goal-list">
            {pot.goals.map((g) => (
              <li key={g.profile_id}>
                <span>{fill(t.goalLine, { name: g.full_name, done: g.done, target: g.target, unit: g.unit })}</span>
                <span className="goal-bar" aria-hidden="true">
                  <span style={cssVars({ value: Math.min(100, Math.round((g.done * 100) / g.target)) })} />
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {mine.map((g) => (
        <form
          key={g.profile_id}
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            void send({ action: "progress", potId: pot.id, profileId: g.profile_id, done: Number(new FormData(e.currentTarget).get("done") || 0) });
          }}
        >
          <label htmlFor={`progress-${pot.id}-${g.profile_id}`}>
            {fill(t.myProgress, { name: g.full_name })}
            <input id={`progress-${pot.id}-${g.profile_id}`} name="done" type="number" min={0} max={100000} defaultValue={g.done} />
          </label>
          <button type="submit" className="button secondary sm" disabled={busy}>
            {t.update}
          </button>
        </form>
      ))}
      {manage && data.helpers.length > 0 && (
        <details>
          <summary>{t.setGoal}</summary>
          <form className="inline-form" onSubmit={goal}>
            <label htmlFor={`goal-person-${pot.id}`}>
              {t.person}
              <select id={`goal-person-${pot.id}`} name="profile">
                {data.helpers.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.full_name}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor={`goal-target-${pot.id}`}>
              {t.target}
              <input id={`goal-target-${pot.id}`} name="target" type="number" min={0} max={100000} required />
            </label>
            <label htmlFor={`goal-unit-${pot.id}`}>
              {t.unit}
              <input id={`goal-unit-${pot.id}`} name="unit" maxLength={60} placeholder={t.unitHint} />
            </label>
            <button type="submit" className="button secondary sm" disabled={busy}>
              {t.save}
            </button>
          </form>
        </details>
      )}
      {manage && data.helpers.length > 0 && (
        <details>
          <summary>{t.tasks}</summary>
          <form className="pot-tasks" onSubmit={tasks}>
            <label htmlFor={`task-title-${pot.id}`}>
              {t.taskTitle}
              <input id={`task-title-${pot.id}`} name="title" required minLength={2} maxLength={200} placeholder={t.taskTitleHint} />
            </label>
            <label htmlFor={`task-due-${pot.id}`}>
              {t.due}
              <input id={`task-due-${pot.id}`} name="due" type="date" />
            </label>
            <fieldset>
              <legend>{t.who}</legend>
              <div className="pot-helpers">
                {data.helpers.map((h) => (
                  <label className="check" key={h.id} htmlFor={`task-who-${pot.id}-${h.id}`}>
                    <input id={`task-who-${pot.id}-${h.id}`} type="checkbox" name="who" value={h.id} />
                    {h.full_name}
                  </label>
                ))}
              </div>
            </fieldset>
            <button type="submit" className="button secondary sm" disabled={busy}>
              {t.give}
            </button>
          </form>
          <p role="status" className="muted">
            {given}
          </p>
        </details>
      )}
    </div>
  );
}
