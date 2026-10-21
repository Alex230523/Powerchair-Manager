"use client";
import { useMemo, useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import { qrMatrix, qrPath } from "@/lib/qr";
import { subscribeLinks } from "@/domains/calendar/planner";
import { plannerCopy } from "./calendar-planner-copy";
import { Badge, Button } from "./ui";
import { Icon } from "./icons";

type Feed = { id: string; name: string; team_id: string | null; only_mine?: boolean; include_money?: boolean; expires_at: string; revoked_at: string | null };
type Follow = "all" | "team" | "mine";

/**
 * Calendar subscription (wave 15, C9): what to follow (the whole club, a
 * team, my events), then one button per calendar service, the link to copy
 * and a QR code for the phone; the links can be renewed or revoked.
 */
export function SubscribePanel({
  locale,
  teams,
  feeds,
  money,
  busy,
  url,
  create,
  renew,
  revoke,
}: {
  locale: Locale;
  teams: { id: string; name: string }[];
  feeds: Feed[];
  money: boolean;
  busy: boolean;
  /** The address of the link just created or renewed (shown once). */
  url: string;
  create: (body: { name: string; teamId: string | null; mine: boolean; includeMoney?: boolean }) => Promise<unknown>;
  renew: (id: string) => Promise<unknown>;
  revoke: (id: string) => Promise<unknown>;
}) {
  const p = plannerCopy[locale];
  const [follow, setFollow] = useState<Follow>("all"),
    [teamId, setTeamId] = useState(teams[0]?.id ?? ""),
    [name, setName] = useState(""),
    [copied, setCopied] = useState(false);
  const label = (f: Follow, team: string | null) => (f === "team" ? (teams.find((x) => x.id === team)?.name ?? p.followTeam) : f === "mine" ? p.followMine : p.followAll);
  const links = url ? subscribeLinks(url, name || label(follow, teamId)) : null;
  const webcal = links?.webcal ?? "";
  const qr = useMemo(() => {
    const m = webcal ? qrMatrix(webcal) : null;
    return m ? qrPath(m) : null;
  }, [webcal]);
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    setCopied(false);
    void create({
      name: (name.trim() || label(follow, teamId)).slice(0, 80),
      teamId: follow === "team" ? teamId || null : null,
      mine: follow === "mine",
      ...(money ? { includeMoney: d.has("includeMoney") } : {}),
    });
  }
  return (
    <div className="subscribe-panel">
      <p>{p.subscribeIntro}</p>
      <form onSubmit={submit} className="subscribe-form">
        <fieldset className="subscribe-follow">
          <legend>{p.follow}</legend>
          {(["all", "team", "mine"] as Follow[])
            .filter((f) => f !== "team" || teams.length > 0)
            .map((f) => (
              <label className="check" key={f}>
                <input type="radio" name="follow" value={f} checked={follow === f} onChange={() => setFollow(f)} aria-describedby={f === "mine" ? "follow-mine-hint" : undefined} />
                {f === "all" ? p.followAll : f === "team" ? p.followTeam : p.followMine}
              </label>
            ))}
          <p id="follow-mine-hint" className="muted small">{p.followMineHint}</p>
        </fieldset>
        {follow === "team" && (
          <label>
            {p.followTeam}
            <select name="team" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              {teams.map((x) => (
                <option key={x.id} value={x.id}>{x.name}</option>
              ))}
            </select>
          </label>
        )}
        <label>
          {p.linkName}
          <input name="name" maxLength={80} value={name} placeholder={label(follow, teamId)} onChange={(e) => setName(e.target.value)} />
        </label>
        {money && (
          <label className="check">
            <input type="checkbox" name="includeMoney" />
            {p.money}
          </label>
        )}
        <Button disabled={busy}>{p.createLink}</Button>
      </form>
      {links && (
        <section className="subscribe-result" aria-labelledby="subscribe-result-title">
          <h3 id="subscribe-result-title" className="sr-only">{p.link}</h3>
          <ul className="subscribe-services">
            {(
              [
                ["google", links.google, p.google, p.googleHint],
                ["apple", links.webcal, p.apple, p.appleHint],
                ["outlook", links.outlook, p.outlook, p.outlookHint],
              ] as const
            ).map(([id, href, text, hint]) => (
              <li key={id}>
                <a className="button secondary" href={href} target={id === "apple" ? undefined : "_blank"} rel="noopener noreferrer" aria-describedby={`subscribe-${id}-hint`}>
                  <Icon name="calendar" size={16} /> {text}
                </a>
                <p id={`subscribe-${id}-hint`} className="muted small">{hint}</p>
              </li>
            ))}
          </ul>
          <div className="subscribe-link">
            <label htmlFor="feed-url">{p.link}</label>
            <span className="subscribe-copy">
              <input id="feed-url" readOnly value={url} onFocus={(e) => e.target.select()} />
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  void navigator.clipboard?.writeText(url).then(() => setCopied(true));
                }}
              >
                {p.copy}
              </Button>
            </span>
          </div>
          <p role="status" className="small">{copied ? p.copied : ""}</p>
          {qr && (
            <figure className="subscribe-qr">
              <svg viewBox={`0 0 ${qr.size} ${qr.size}`} width={176} height={176} role="img" aria-label={p.qrLabel} shapeRendering="crispEdges">
                <rect width={qr.size} height={qr.size} fill="var(--qr-paper)" />
                <path d={qr.d} fill="var(--qr-ink)" />
              </svg>
              <figcaption className="muted small">{p.qr}</figcaption>
            </figure>
          )}
        </section>
      )}
      <p className="notice small">{p.privacy}</p>
      {feeds.length > 0 && (
        <section aria-labelledby="subscribe-links-title">
          <h3 id="subscribe-links-title">{p.yourLinks}</h3>
          <ul className="plain-list subscribe-feeds">
            {feeds.map((f) => (
              <li key={f.id}>
                <span>
                  <strong>{f.name}</strong>
                  <span className="muted small">
                    {" "}
                    · {label(f.only_mine ? "mine" : f.team_id ? "team" : "all", f.team_id)} · {p.validUntil} {f.expires_at.slice(0, 10)}
                  </span>
                </span>
                {f.revoked_at ? (
                  <Badge tone="neutral">{p.revoked}</Badge>
                ) : (
                  <span className="row-actions">
                    <Button size="sm" variant="secondary" disabled={busy} onClick={() => void renew(f.id)}>
                      {p.renew}<span className="sr-only"> : {f.name}</span>
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => void revoke(f.id)}>
                      {p.revoke}<span className="sr-only"> : {f.name}</span>
                    </Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
