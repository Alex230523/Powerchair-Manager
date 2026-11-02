"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import type { staffRolesView } from "@/domains/access/staff-roles";
import type { Grant } from "@/domains/access/rights";
import { staffRolesCopy } from "./staff-roles-copy";
import { settingsCopy } from "./settings-copy";
import { ModuleRights } from "./governance";
import { errors } from "./access-copy";
import { Badge, Button, Card, EmptyState, Field } from "./ui";

/**
 * 7: Réglages › Membres et droits › Rôles. The roles (models of rights)
 * with their plain description and the number of people, the editor with
 * the module grid, the confirmation listing who gains or loses what, and
 * each person's roles.
 */
type View = Awaited<ReturnType<typeof staffRolesView>>;
type Role = View["roles"][number];
type Change = { mandateId: string; name: string; gained: string[]; lost: string[] };
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""));
const t3 = (x: { fr: string; nl?: string; en?: string } | null | undefined, l: Locale) => (x ? (l === "fr" ? x.fr : x[l] || x.fr) : "");

/** « Peut : gérer les présences, lire le calendrier… » from the grants. */
export function canText(locale: Locale, grants: readonly string[]) {
  const s = settingsCopy[locale].grants as Record<string, string>;
  const t = staffRolesCopy[locale];
  const list = grants.map((g) => s[g] ?? g);
  return list.length ? fill(t.can, { list: list.join(", ") }) : t.nothing;
}

export function StaffRoles({ locale }: { locale: Locale }) {
  const t = staffRolesCopy[locale];
  const [data, setData] = useState<View | null>(null),
    [version, setVersion] = useState(0),
    [editing, setEditing] = useState<Role | "new" | null>(null),
    [pending, setPending] = useState<{ body: Record<string, unknown>; changes: Change[] } | null>(null),
    [status, setStatus] = useState(""),
    [failed, setFailed] = useState("");
  useEffect(() => {
    let live = true;
    fetch("/api/staff-roles", { cache: "no-store" })
      .then(async (r) => (r.ok ? ((await r.json()) as View) : null))
      .then((v) => {
        if (live) setData(v);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [version]);
  const send = useCallback(
    async (body: Record<string, unknown>, done: string) => {
      if (!data) return null;
      setFailed("");
      try {
        const r = await fetch("/api/staff-roles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId: data.organization_id, ...body }) });
        const v = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(v.error ?? "UNAVAILABLE");
        // 2: a role used by people: first the list of what changes, then the confirmation.
        if (v.confirmed === false) {
          setPending({ body, changes: v.changes as Change[] });
          return v;
        }
        setPending(null);
        setEditing(null);
        setStatus(done);
        setVersion((n) => n + 1);
        return v;
      } catch (e) {
        const code = (e as Error).message;
        setFailed(errors[code]?.[locale] ?? errors.INVALID_INPUT?.[locale] ?? code);
        return null;
      }
    },
    [data, locale],
  );
  if (!data?.can.manage) return null;
  const grantText = (g: string) => (settingsCopy[locale].grants as Record<string, string>)[g] ?? g;
  return (
    <Card title={t.title} labelledBy="settings-roles" headingId="settings-roles">
      <p className="muted">{t.intro}</p>
      <p role="status" className="sr-only">
        {status}
      </p>
      {failed && <p role="alert">{failed}</p>}
      <ul className="plain-list staff-roles">
        {data.roles.map((r) => (
          <li key={r.id}>
            <p>
              <strong>{t3(r.name, locale)}</strong> <Badge tone="neutral">{fill(t.people, { n: r.people })}</Badge> <Badge tone="info">{t.scopes[r.scope]}</Badge>{" "}
              {r.archived && <Badge tone="warning">{t.archived}</Badge>}
            </p>
            {t3(r.description, locale) && <p className="small">{t3(r.description, locale)}</p>}
            <p className="small muted">{canText(locale, r.grants)}</p>
            <p className="actions">
              <Button type="button" size="sm" variant="secondary" onClick={() => setEditing(r)}>
                {t.edit}
                <span className="sr-only"> : {t3(r.name, locale)}</span>
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => void send({ action: "archive", id: r.id, archived: !r.archived }, t.saved)}>
                {r.archived ? t.restore : t.archive}
                <span className="sr-only"> : {t3(r.name, locale)}</span>
              </Button>
            </p>
            {editing !== "new" && editing?.id === r.id && <RoleEditor key={r.id + r.version} locale={locale} role={r} own={data.mine} save={(b) => void send(b, t.saved)} close={() => setEditing(null)} />}
          </li>
        ))}
      </ul>
      <p className="actions">
        <Button type="button" variant="secondary" icon="plus" onClick={() => setEditing("new")}>
          {t.create}
        </Button>
      </p>
      {editing === "new" && <RoleEditor locale={locale} role={null} own={data.mine} save={(b) => void send(b, t.saved)} close={() => setEditing(null)} />}
      {pending && (
        <section className="notice staff-confirm" role="alertdialog" aria-labelledby="staff-confirm-title" aria-describedby="staff-confirm-intro">
          <h3 id="staff-confirm-title">{t.confirmTitle}</h3>
          <p id="staff-confirm-intro">{t.confirmIntro}</p>
          <ul>
            {pending.changes.map((c) => (
              <li key={c.mandateId}>
                <strong>{c.name}</strong>
                {c.gained.length > 0 && <> · {fill(t.gains, { list: c.gained.map(grantText).join(", ") })}</>}
                {c.lost.length > 0 && <> · {fill(t.loses, { list: c.lost.map(grantText).join(", ") })}</>}
              </li>
            ))}
          </ul>
          <p className="actions">
            <Button type="button" variant="ghost" onClick={() => setPending(null)}>
              {t.cancel}
            </Button>
            <Button type="button" onClick={() => void send({ ...pending.body, confirm: true }, t.saved)}>
              {t.confirm}
            </Button>
          </p>
        </section>
      )}
      <h3>{t.staff}</h3>
      <p className="small muted">{t.staffIntro}</p>
      {!data.staff.length ? (
        <EmptyState title={t.noStaff} />
      ) : (
        <ul className="plain-list staff-people">
          {data.staff.map((s) => (
            <li key={s.id}>
              <PersonRoles locale={locale} person={s} roles={data.roles.filter((r) => !r.archived)} save={(b) => void send(b, t.assigned)} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function PersonRoles({ locale, person, roles, save }: { locale: Locale; person: View["staff"][number]; roles: Role[]; save: (b: Record<string, unknown>) => void }) {
  const t = staffRolesCopy[locale];
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    save({ action: "assign", mandateId: person.id, roleIds: new FormData(e.currentTarget).getAll("role") });
  }
  return (
    <form className="stack" onSubmit={submit}>
      <fieldset>
        <legend>
          {fill(t.roles, { name: person.name })} {person.custom && <Badge tone="warning">{t.custom}</Badge>}
        </legend>
        {roles.map((r) => (
          <label className="check" key={r.id}>
            <input type="checkbox" name="role" value={r.id} defaultChecked={person.roles.includes(r.id)} /> {t3(r.name, locale)}
          </label>
        ))}
      </fieldset>
      <p className="small muted">{canText(locale, person.grants)}</p>
      <p className="actions">
        <Button type="submit" size="sm" variant="secondary">
          {t.assign}
          <span className="sr-only"> : {person.name}</span>
        </Button>
      </p>
    </form>
  );
}

function RoleEditor({ locale, role, own, save, close }: { locale: Locale; role: Role | null; own: string[]; save: (b: Record<string, unknown>) => void; close: () => void }) {
  const t = staffRolesCopy[locale];
  const [grants, setGrants] = useState<Grant[]>((role?.grants ?? []) as Grant[]),
    [scope, setScope] = useState<"all" | "own_teams">(role?.scope ?? "all");
  const base = `role-${role?.id ?? "new"}`;
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const keep = (x: { fr: string; nl?: string; en?: string } | undefined, v: string) => ({ fr: x?.fr ?? "", nl: x?.nl ?? "", en: x?.en ?? "", [locale]: v });
    const name = keep(role?.name, String(f.get("name") ?? ""));
    save({
      action: "save",
      ...(role ? { id: role.id } : {}),
      name: { ...name, fr: name.fr || String(f.get("name") ?? "") },
      description: keep(role?.description, String(f.get("description") ?? "")),
      icon: role?.icon ?? "team",
      grants,
      scope,
    });
  }
  return (
    <form className="stack card-form" onSubmit={submit}>
      <Field id={`${base}-name`} label={t.name} required>
        <input id={`${base}-name`} name="name" required minLength={2} maxLength={80} defaultValue={t3(role?.name, locale)} />
      </Field>
      <Field id={`${base}-desc`} label={t.description}>
        <input id={`${base}-desc`} name="description" maxLength={200} defaultValue={t3(role?.description, locale)} />
      </Field>
      <fieldset>
        <legend>{t.scope}</legend>
        {(["all", "own_teams"] as const).map((s) => (
          <label className="check" key={s}>
            <input type="radio" name={`${base}-scope`} checked={scope === s} onChange={() => setScope(s)} /> {t.scopes[s]}
          </label>
        ))}
        <p className="small muted">{t.scopeHelp}</p>
      </fieldset>
      <ModuleRights locale={locale} grants={grants} own={new Set(own)} onChange={setGrants} id={base} />
      <p className="small">{canText(locale, grants)}</p>
      <p className="actions">
        <Button type="button" variant="ghost" onClick={close}>
          {t.close}
        </Button>
        <Button type="submit">{t.save}</Button>
      </p>
    </form>
  );
}

/** 4: in the invitation form, a staff role chosen first prefills the rights (still adjustable). */
export function InviteRoleRights({ locale, labels, allowed, club, legend }: { locale: Locale; labels: [string, string][]; allowed: (g: string) => boolean; club: boolean; legend: string }) {
  const t = staffRolesCopy[locale];
  const [roles, setRoles] = useState<Role[]>([]),
    [roleId, setRoleId] = useState("");
  useEffect(() => {
    if (!club) return;
    let live = true;
    fetch("/api/staff-roles", { cache: "no-store" })
      .then(async (r) => (r.ok ? ((await r.json()) as View) : null))
      .then((v) => {
        if (live && v) setRoles(v.roles.filter((r) => !r.archived));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [club]);
  const chosen = roles.find((r) => r.id === roleId);
  const preset = chosen ? (chosen.scope === "own_teams" ? chosen.grants.filter((g) => !["calendar.manage", "calendar.read", "attendance.manage", "people.read"].includes(g)) : chosen.grants) : [];
  return (
    <>
      {club && roles.length > 0 && (
        <label>
          {t.chooseRole}
          <select name="staffRoleIds" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
            <option value="">{t.noRole}</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {t3(r.name, locale)}
              </option>
            ))}
          </select>
        </label>
      )}
      {chosen && <p className="small muted">{canText(locale, chosen.grants)}</p>}
      <fieldset key={roleId}>
        <legend>{legend}</legend>
        {labels
          .filter(([value]) => allowed(value))
          .map(([value, label]) => (
            <label className="check" key={value}>
              <input type="checkbox" name="grants" value={value} defaultChecked={preset.includes(value)} />
              {label}
            </label>
          ))}
      </fieldset>
    </>
  );
}
