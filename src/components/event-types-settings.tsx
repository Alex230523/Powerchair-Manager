"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import type { eventTypesView } from "@/domains/calendar/service";
import { kinds } from "@/domains/calendar/schema";
import { eventCopy } from "./calendar-event-copy";
import { calendarErrors, kindLabels } from "./calendar-copy";
import { Badge, Button, Card } from "./ui";
import { Icon, type IconName } from "./icons";
import { Modal } from "./modal";

type View = Awaited<ReturnType<typeof eventTypesView>>;
type Type = View["types"][number];
const icons = ["attendance", "trophy", "players", "document", "landmark", "calendar", "whistle", "bus", "megaphone", "handshake"] as const satisfies readonly IconName[];
const groups = ["team", "teamCoaches", "players", "guardians", "coaches", "staff"] as const;

/** Settings > Activities (wave 16, E1): the club's event types, in the form's order. */
export function EventTypesSettings({ locale }: { locale: Locale }) {
  const t = eventCopy[locale].types,
    g = eventCopy[locale].groups,
    kl = kindLabels[locale] as Record<string, string>;
  const [view, setView] = useState<View | null>(null),
    [hidden, setHidden] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [editing, setEditing] = useState<Type | "new" | null>(null);
  const load = useCallback(
    () =>
      fetch("/api/calendar/types", { cache: "no-store" })
        .then(async (r) => {
          if (r.status === 403) return setHidden(true);
          const v = await r.json();
          if (!r.ok) throw new Error(v.error);
          setView(v);
        })
        .catch(() => setError(t.failed)),
    [t.failed],
  );
  useEffect(() => {
    void load();
  }, [load]);
  const text = (code: string) => (code === "TYPE_EXISTS" ? t.exists : (calendarErrors[code]?.[locale === "fr" ? 0 : locale === "nl" ? 1 : 2] ?? t.failed));
  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/calendar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, organizationId: view?.organization_id }) });
      const v = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(v.error ?? "UNAVAILABLE");
      await load();
      setMessage(t.saved);
      return true;
    } catch (e) {
      setError(text((e as Error).message));
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const row = editing === "new" ? null : editing;
    const ok = await send({
      action: "eventType",
      ...(row ? { id: row.id, expectedVersion: row.version } : {}),
      name: String(f.get("name") ?? "").trim(),
      family: f.get("family"),
      color: f.get("color"),
      icon: f.get("icon"),
      askResponse: f.has("ask"),
      defaultGroups: f.getAll("groups"),
      register: f.has("register"),
      archived: f.has("archived"),
    });
    if (ok) setEditing(null);
  }
  const move = (i: number, d: number) => {
    const live = view!.types.filter((x) => !x.archived);
    const ids = live.map((x) => x.id);
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    void send({ action: "eventTypeOrder", ids });
  };
  if (hidden) return null;
  const row = editing && editing !== "new" ? editing : null;
  const live = view?.types.filter((x) => !x.archived) ?? [];
  return (
    <Card title={t.title} labelledBy="settings-event-types" headingId="settings-event-types">
      <p className="muted">{t.intro}</p>
      {error && !editing && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {view && (
        <>
          <ol className="event-types">
            {view.types.map((x) => {
              const i = live.indexOf(x);
              return (
                <li key={x.id}>
                  <span className="team-chip" data-kind={x.color}>
                    <span className="team-dot" aria-hidden="true" />
                    <Icon name={((icons as readonly string[]).includes(x.icon) ? x.icon : "calendar") as IconName} size={16} />
                    {x.name}
                  </span>
                  <span className="muted small">
                    {t.families[x.family]} · {t.used(x.used)}
                  </span>
                  {x.archived && <Badge>{t.archivedBadge}</Badge>}
                  <span className="event-type-actions">
                    {!x.archived && i > 0 && (
                      <Button size="sm" variant="ghost" disabled={busy} aria-label={`${t.up} : ${x.name}`} onClick={() => move(i, -1)}>
                        ↑
                      </Button>
                    )}
                    {!x.archived && i < live.length - 1 && (
                      <Button size="sm" variant="ghost" disabled={busy} aria-label={`${t.down} : ${x.name}`} onClick={() => move(i, 1)}>
                        ↓
                      </Button>
                    )}
                    <Button size="sm" variant="secondary" disabled={busy} aria-label={`${t.edit} : ${x.name}`} onClick={() => setEditing(x)}>
                      {t.edit}
                    </Button>
                  </span>
                </li>
              );
            })}
          </ol>
          <Button icon="plus" size="sm" disabled={busy} onClick={() => setEditing("new")}>
            {t.add}
          </Button>
        </>
      )}
      {editing && (
        <Modal title={row ? row.name : t.add} close={() => setEditing(null)}>
          {error && <p role="alert">{error}</p>}
          <form className="federation-form" onSubmit={(e) => void save(e)}>
            <label>
              {t.name}
              <input name="name" required minLength={2} maxLength={60} defaultValue={row?.name ?? ""} />
            </label>
            <label>
              {t.family}
              <select name="family" defaultValue={row?.family ?? "training"}>
                {(["training", "match", "meeting", "other"] as const).map((f) => (
                  <option key={f} value={f}>
                    {t.families[f]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t.color}
              <select name="color" defaultValue={row?.color ?? "training"}>
                {kinds.map((k) => (
                  <option key={k} value={k}>
                    {kl[k]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t.icon}
              <select name="icon" defaultValue={row?.icon ?? "calendar"}>
                {icons.map((k) => (
                  <option key={k} value={k}>
                    {t.icons[k as keyof typeof t.icons]}
                  </option>
                ))}
              </select>
            </label>
            <label className="check">
              <input type="checkbox" name="ask" defaultChecked={row?.ask_response ?? false} />
              {t.askDefault}
            </label>
            <fieldset className="event-chips">
              <legend>{t.groupsDefault}</legend>
              {groups.map((k) => (
                <label key={k} className="chip-check">
                  <input type="checkbox" name="groups" value={k} defaultChecked={row?.default_groups.includes(k) ?? false} />
                  {g[k]}
                </label>
              ))}
            </fieldset>
            <label className="check">
              <input type="checkbox" name="register" defaultChecked={row?.register ?? false} />
              {t.registerDefault}
            </label>
            {row && (
              <label className="check">
                <input type="checkbox" name="archived" defaultChecked={row.archived} />
                {t.archived}
              </label>
            )}
            <Button type="submit" loading={busy}>
              {t.save}
            </Button>
          </form>
        </Modal>
      )}
    </Card>
  );
}
