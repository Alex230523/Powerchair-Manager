"use client";
import { useMemo, useState, type ReactNode } from "react";
import type { Locale } from "@/lib/locale";
import type { Field } from "@/domains/registrations/schema";
import { platformTemplate, platformTemplates, type PlatformTemplate } from "@/domains/registrations/templates";
import { qrMatrix, qrPath } from "@/lib/qr";
import { Badge, Button, Tabs } from "./ui";
import { Icon, type IconName } from "./icons";
import { Modal } from "./modal";
import { DataGrid } from "./data-grid";
import { fill, formsCopy } from "./registration-forms-copy";
import { MoreMenu } from "./more-menu";
import { escapeHtml } from "@/lib/html";
export { MoreMenu };

/** Wave 17 (F1): one form of the club, as the list shows it. */
export type FormRow = {
  id: string;
  organization_id: string;
  season_id: string;
  title: string;
  description: string;
  fields: Field[];
  published: boolean;
  capacity: number | null;
  version: number;
  archived?: boolean;
  opens_on?: string | null;
  closes_on?: string | null;
  open?: boolean;
  applications?: number;
  season_name?: string;
  created_at?: string;
  organization_name?: string;
  logo_version?: string | null;
};
export type ClubTemplate = { id: string; name: string; description: string; fields: Field[]; capacity: number | null };

const day = (locale: Locale, d: string) =>
  new Intl.DateTimeFormat(locale === "en" ? "en-GB" : `${locale}-BE`, { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(new Date(d.slice(0, 10) + "T12:00:00Z"));
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

/** Open, closed, archived, or the date it opens or closed. */
export function FormState({ locale, form }: { locale: Locale; form: FormRow }) {
  const t = formsCopy[locale];
  if (form.archived) return <Badge tone="neutral">{t.archived}</Badge>;
  if (form.open)
    return (
      <Badge tone="success" dot>
        {t.open}
      </Badge>
    );
  const now = today();
  if (form.published && form.opens_on && form.opens_on > now)
    return (
      <Badge tone="info" dot>
        {fill(t.opensOn, { date: day(locale, form.opens_on) })}
      </Badge>
    );
  if (form.published && form.closes_on && form.closes_on < now)
    return (
      <Badge tone="neutral" dot>
        {fill(t.closedSince, { date: day(locale, form.closes_on) })}
      </Badge>
    );
  return (
    <Badge tone="neutral" dot>
      {t.closed}
    </Badge>
  );
}

/** A round icon button whose name is also its tooltip. */
function IconAction({ icon, label, onClick, className = "" }: { icon: IconName; label: string; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      className={`icon-button sm ${className}`.trim()}
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <Icon name={icon} size={16} />
    </button>
  );
}

/** The forms of the club: a click on a row shows its questions in the editor below. */
export function FormsList({
  locale,
  forms,
  selected,
  onSelect,
  onPreview,
  onReuse,
  onShare,
  onArchive,
  onSaveTemplate,
}: {
  locale: Locale;
  forms: FormRow[];
  selected: string;
  onSelect: (f: FormRow) => void;
  onPreview: (f: FormRow) => void;
  onReuse: (f: FormRow) => void;
  onShare: (f: FormRow) => void;
  onArchive: (f: FormRow) => void;
  onSaveTemplate: (f: FormRow) => void;
}) {
  const t = formsCopy[locale];
  const [archived, setArchived] = useState(false);
  const rows = forms.filter((f) => archived || !f.archived);
  const count = forms.filter((f) => f.archived).length;
  return (
    <>
      {count > 0 && (
        <label className="check forms-archived">
          <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
          {t.showArchived} ({count})
        </label>
      )}
      <DataGrid
        locale={locale}
        label={t.forms}
        className="forms-grid"
        sortKey="formSort"
        rows={rows}
        rowId={(f) => f.id}
        rowName={(f) => f.title}
        rowClassName={(f) => (f.id === selected ? "selected-row" : undefined)}
        columns={[
          {
            key: "name",
            header: t.name,
            rowHeader: true,
            hideable: false,
            sort: (f) => f.title,
            cell: (f) => (
              <button type="button" className="text-button name-link form-open" aria-pressed={f.id === selected} aria-label={fill(t.select, { form: f.title })} onClick={() => onSelect(f)}>
                {f.title}
              </button>
            ),
          },
          { key: "created", header: t.created, sort: (f) => f.created_at ?? "", cell: (f) => (f.created_at ? new Date(f.created_at).getFullYear() : "") },
          { key: "season", header: t.season, sort: (f) => f.season_name ?? "", cell: (f) => f.season_name ?? "" },
          { key: "applications", header: t.applications, sort: (f) => f.applications ?? 0, cell: (f) => f.applications ?? 0, className: "numeric" },
          { key: "status", header: t.status, sort: (f) => (f.archived ? 2 : f.open ? 0 : 1), cell: (f) => <FormState locale={locale} form={f} /> },
          {
            key: "actions",
            header: t.actions,
            hideable: false,
            cell: (f) => (
              <div className="row-actions icon-actions">
                <IconAction icon="eye" label={fill(t.previewOf, { form: f.title })} onClick={() => onPreview(f)} />
                <IconAction icon="copy" label={fill(t.reuseOf, { form: f.title })} onClick={() => onReuse(f)} />
                {!f.archived && <IconAction icon="share" label={fill(t.shareOf, { form: f.title })} onClick={() => onShare(f)} />}
                <MoreMenu
                  label={fill(t.more, { form: f.title })}
                  items={[
                    { label: f.archived ? t.restore : t.archive, run: () => onArchive(f) },
                    { label: t.saveTemplate, run: () => onSaveTemplate(f) },
                  ]}
                />
              </div>
            ),
          },
        ]}
      />
    </>
  );
}

export type TemplateChoice = { kind: "scratch" } | { kind: "platform"; id: PlatformTemplate } | { kind: "club"; template: ClubTemplate };

/** « Nouveau formulaire »: from scratch, or from a platform or club template. */
export function NewFormDialog({
  locale,
  templates,
  pick,
  remove,
  close,
}: {
  locale: Locale;
  templates: ClubTemplate[];
  pick: (c: TemplateChoice) => void;
  remove: (t: ClubTemplate) => void;
  close: () => void;
}) {
  const t = formsCopy[locale];
  return (
    <Modal title={t.newForm} close={close} className="player-dialog new-form-dialog">
      <p>{t.newFormIntro}</p>
      <section aria-labelledby="new-scratch" className="template-choice">
        <h3 id="new-scratch">{t.fromScratch}</h3>
        <p className="muted">{t.fromScratchHint}</p>
        <Button icon="plus" onClick={() => pick({ kind: "scratch" })}>
          {t.fromScratch}
        </Button>
      </section>
      <section aria-labelledby="new-templates" className="template-choice">
        <h3 id="new-templates">{t.fromTemplate}</h3>
        <h4>{t.platformTemplates}</h4>
        <ul className="template-list">
          {platformTemplates.map((id) => (
            <li key={id}>
              <div>
                <strong>{t.templateNames[id]}</strong>
                <p className="muted">{t.templateHints[id]}</p>
                <p className="muted small">{fill(t.questionsCount, { n: platformTemplate(id, locale).fields.length })}</p>
              </div>
              <Button variant="secondary" size="sm" aria-label={fill(t.useOf, { name: t.templateNames[id] })} onClick={() => pick({ kind: "platform", id })}>
                {t.use}
              </Button>
            </li>
          ))}
        </ul>
        <h4>{t.clubTemplates}</h4>
        {templates.length ? (
          <ul className="template-list">
            {templates.map((tpl) => (
              <li key={tpl.id}>
                <div>
                  <strong>{tpl.name}</strong>
                  <p className="muted small">{fill(t.questionsCount, { n: tpl.fields.length })}</p>
                </div>
                <div className="row-actions">
                  <Button variant="secondary" size="sm" aria-label={fill(t.useOf, { name: tpl.name })} onClick={() => pick({ kind: "club", template: tpl })}>
                    {t.use}
                  </Button>
                  <IconAction icon="trash" label={fill(t.deleteTemplate, { name: tpl.name })} onClick={() => remove(tpl)} />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">{t.noClubTemplates}</p>
        )}
      </section>
    </Modal>
  );
}

/** The name of a club template made from a form. */
export function SaveTemplateDialog({ locale, form, save, close, busy }: { locale: Locale; form: FormRow; save: (name: string) => void; close: () => void; busy: boolean }) {
  const t = formsCopy[locale];
  return (
    <Modal title={fill(t.saveTemplateTitle, { form: form.title })} close={close}>
      <form
        className="stack-form"
        onSubmit={(e) => {
          e.preventDefault();
          save(String(new FormData(e.currentTarget).get("name") ?? ""));
        }}
      >
        <p className="muted">{t.saveTemplateHint}</p>
        <label htmlFor="template-name">
          {t.templateName}
          <input id="template-name" name="name" required minLength={2} maxLength={120} defaultValue={form.title} />
        </label>
        <div className="actions">
          <Button disabled={busy}>{t.saveTemplate}</Button>
          <Button type="button" variant="secondary" onClick={close}>
            {t.cancel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** A read-only code with its « Copier » button and the result, said aloud. */
function CopyField({ locale, id, label, value, rows = 1 }: { locale: Locale; id: string; label: string; value: string; rows?: number }) {
  const t = formsCopy[locale];
  const [state, setState] = useState<"" | "copied" | "failed">("");
  return (
    <div className="embed-block">
      <label htmlFor={id}>{label}</label>
      {rows > 1 ? <textarea id={id} readOnly value={value} rows={rows} /> : <input id={id} readOnly value={value} onFocus={(e) => e.currentTarget.select()} />}
      <button
        type="button"
        className="button secondary"
        aria-label={fill(t.copyWhat, { what: label })}
        onClick={() =>
          void (navigator.clipboard?.writeText(value) ?? Promise.reject(new Error("clipboard")))
            .then(() => setState("copied"))
            .catch(() => setState("failed"))
        }
      >
        <Icon name="copy" size={16} />
        {t.copy}
      </button>
      <span role="status" className="muted small">
        {state === "copied" ? t.copied : state === "failed" ? t.copyFailed : ""}
      </span>
    </div>
  );
}

/** The QR code drawn as a PNG (10 pixels per module), in the page's QR colours. */
function downloadQr(matrix: boolean[][], name: string) {
  const scale = 10,
    size = (matrix.length + 8) * scale;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const style = getComputedStyle(document.documentElement);
  ctx.fillStyle = style.getPropertyValue("--qr-paper").trim() || "white";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = style.getPropertyValue("--qr-ink").trim() || "black";
  matrix.forEach((row, y) => row.forEach((dark, x) => dark && ctx.fillRect((x + 4) * scale, (y + 4) * scale, scale, scale)));
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = name.replace(/[^\p{L}\p{N} _-]/gu, "").trim().replace(/\s+/g, "-") + "-qr.png";
  a.click();
}

/**
 * « Partager »: open to the public (with optional dates), then three ways to
 * share, each explained: the link and its QR code, the code for a website,
 * an announcement for social networks (plain share links, no account).
 */
export function ShareDialog({
  locale,
  form,
  club,
  busy,
  save,
  close,
}: {
  locale: Locale;
  form: FormRow;
  club: string;
  busy: boolean;
  save: (v: { published: boolean; opensOn: string | null; closesOn: string | null }) => Promise<void>;
  close: () => void;
}) {
  const t = formsCopy[locale];
  const [tab, setTab] = useState("link");
  const [published, setPublished] = useState(form.published);
  const [invalid, setInvalid] = useState(false);
  const site = typeof window === "undefined" ? "" : window.location.origin;
  const url = `${site}/${locale}/inscription/${form.id}`;
  const matrix = useMemo(() => qrMatrix(url), [url]);
  const qr = matrix ? qrPath(matrix) : null;
  const iframe = `<iframe title="${escapeHtml(form.title)}" src="${escapeHtml(`${site}/${locale}/registration-widget/${form.id}`)}" width="100%" height="260" style="border:0"></iframe>`;
  const popup = `<button type="button" onclick="window.open('${escapeHtml(url)}','inscription','width=720,height=860')">${escapeHtml(t.button)}</button>`;
  const announcement = fill(t.announcementText, { club, form: form.title, url });
  const panel = "share-panel";
  return (
    <Modal title={fill(t.shareTitle, { form: form.title })} close={close} className="player-dialog share-dialog">
      <form
        className="share-opening"
        onSubmit={(e) => {
          e.preventDefault();
          const d = new FormData(e.currentTarget);
          const opensOn = String(d.get("opens") ?? "") || null,
            closesOn = String(d.get("closes") ?? "") || null;
          if (opensOn && closesOn && closesOn < opensOn) return setInvalid(true);
          setInvalid(false);
          void save({ published, opensOn, closesOn });
        }}
      >
        <label className="check switch">
          <input type="checkbox" role="switch" checked={published} onChange={(e) => setPublished(e.target.checked)} aria-describedby="share-public-hint" />
          {t.publicSwitch}
        </label>
        <p id="share-public-hint" className="muted small">
          {t.publicHint}
        </p>
        <div className="share-dates">
          <label htmlFor="share-opens">
            {t.opens}
            <input id="share-opens" name="opens" type="date" defaultValue={form.opens_on ?? ""} />
          </label>
          <label htmlFor="share-closes">
            {t.closes}
            <input id="share-closes" name="closes" type="date" defaultValue={form.closes_on ?? ""} aria-invalid={invalid || undefined} />
          </label>
        </div>
        {invalid && <p role="alert">{t.datesInvalid}</p>}
        <Button disabled={busy}>{t.saveOpening}</Button>
        {!form.open && <p className="notice">{t.notOpenYet}</p>}
      </form>
      <Tabs
        label={t.ways}
        value={tab}
        onChange={setTab}
        panelId={panel}
        idPrefix="share-tab"
        items={[
          { id: "link", label: t.tabLink },
          { id: "site", label: t.tabSite },
          { id: "social", label: t.tabSocial },
        ]}
      />
      <div id={panel} role="tabpanel" aria-labelledby={`share-tab-${tab}`} className="share-panel" tabIndex={0}>
        {tab === "link" && (
          <>
            <p>{t.linkHint}</p>
            <CopyField locale={locale} id="share-link" label={t.link} value={url} />
            <p>
              <a href={url} target="_blank" rel="noopener noreferrer">
                {t.openTab} <span className="sr-only">{t.newTab}</span>↗
              </a>
            </p>
            {qr && matrix && (
              <figure className="subscribe-qr">
                <svg viewBox={`0 0 ${qr.size} ${qr.size}`} width={176} height={176} role="img" aria-label={fill(t.qrLabel, { form: form.title })} shapeRendering="crispEdges">
                  <rect width={qr.size} height={qr.size} fill="var(--qr-paper)" />
                  <path d={qr.d} fill="var(--qr-ink)" />
                </svg>
                <figcaption>
                  <Button type="button" variant="secondary" icon="download" onClick={() => downloadQr(matrix, form.title)}>
                    {t.downloadQr}
                  </Button>
                </figcaption>
              </figure>
            )}
          </>
        )}
        {tab === "site" && (
          <>
            <p>{t.siteHint}</p>
            <CopyField locale={locale} id="share-iframe" label={t.iframe} value={iframe} rows={3} />
            <CopyField locale={locale} id="share-popup" label={t.popup} value={popup} rows={2} />
          </>
        )}
        {tab === "social" && (
          <>
            <p>{t.socialHint}</p>
            <CopyField locale={locale} id="share-announcement" label={t.announcement} value={announcement} rows={3} />
            <ul className="share-links">
              <li>
                <a className="button secondary" href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`} target="_blank" rel="noopener noreferrer">
                  {t.facebook} <span className="sr-only">{t.newTab}</span>
                </a>
              </li>
              <li>
                <a className="button secondary" href={`https://wa.me/?text=${encodeURIComponent(announcement)}`} target="_blank" rel="noopener noreferrer">
                  {t.whatsapp} <span className="sr-only">{t.newTab}</span>
                </a>
              </li>
              <li>
                <a className="button secondary" href={`mailto:?subject=${encodeURIComponent(fill(t.emailSubject, { club }))}&body=${encodeURIComponent(announcement)}`}>
                  {t.email}
                </a>
              </li>
            </ul>
          </>
        )}
      </div>
    </Modal>
  );
}

/** V and X, round, 36 px; « … » for the waiting list and a request for more information. */
export function DecisionButtons({
  locale,
  name,
  status,
  busy,
  labelled = false,
  onAccept,
  onRefuse,
  onWaiting,
  onComplement,
}: {
  locale: Locale;
  name: string;
  status: string;
  busy: boolean;
  /** In the application's sheet: the words next to the icons. */
  labelled?: boolean;
  onAccept: () => void;
  onRefuse: () => void;
  onWaiting: () => void;
  onComplement: () => void;
}) {
  const t = formsCopy[locale];
  return (
    <div className={`decision-buttons ${labelled ? "labelled" : ""}`.trim()} onClick={(e) => e.stopPropagation()}>
      <button type="button" className="decision-button accept" aria-label={fill(t.acceptOf, { name })} title={labelled ? undefined : t.accept} disabled={busy} onClick={onAccept}>
        <Icon name="check" size={18} />
        {labelled && <span aria-hidden="true">{t.accept}</span>}
      </button>
      {status !== "refused" && (
        <button type="button" className="decision-button refuse" aria-label={fill(t.refuseOf, { name })} title={labelled ? undefined : t.refuse} disabled={busy} onClick={onRefuse}>
          <Icon name="close" size={18} />
          {labelled && <span aria-hidden="true">{t.refuse}</span>}
        </button>
      )}
      <MoreMenu
        label={fill(t.moreOf, { name })}
        items={[
          { label: t.waiting, run: onWaiting, hidden: status === "waiting" },
          { label: t.complement, run: onComplement, hidden: status === "incomplete" },
        ]}
      />
    </div>
  );
}

type Team = { id: string; name: string; capacity: number | null; players: number };
const places = (locale: Locale, team: Team) => {
  const t = formsCopy[locale];
  if (team.capacity === null) return t.noLimit;
  const left = Math.max(0, team.capacity - team.players);
  return left === 0 ? t.full : left === 1 ? t.onePlace : fill(t.freePlaces, { n: left });
};

/** Several teams for the season: which one, with the places left. */
export function TeamDialog({ locale, name, teams, busy, accept, close }: { locale: Locale; name: string; teams: Team[]; busy: boolean; accept: (team: string) => void; close: () => void }) {
  const t = formsCopy[locale];
  const first = teams.find((x) => x.capacity === null || x.players < x.capacity)?.id ?? "";
  return (
    <Modal title={fill(t.chooseTeam, { name })} close={close}>
      <form
        className="stack-form"
        onSubmit={(e) => {
          e.preventDefault();
          accept(String(new FormData(e.currentTarget).get("team") ?? ""));
        }}
      >
        <fieldset className="team-choice">
          <legend>{fill(t.chooseTeam, { name })}</legend>
          <p className="muted small">{t.chooseTeamHint}</p>
          {teams.map((team) => (
            <label key={team.id} className="check">
              <input type="radio" name="team" value={team.id} defaultChecked={team.id === first} />
              <span>
                {team.name} · <span className="muted">{places(locale, team)}</span>
              </span>
            </label>
          ))}
          <label className="check">
            <input type="radio" name="team" value="" defaultChecked={!first} />
            {t.noTeam}
          </label>
        </fieldset>
        <div className="actions">
          <Button disabled={busy} icon="check">
            {t.confirmAccept}
          </Button>
          <Button type="button" variant="secondary" onClick={close}>
            {t.cancel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** The chosen team has no place left: accept anyway, or the waiting list. */
export function FullDialog({ locale, team, busy, anyway, waiting, close }: { locale: Locale; team: string; busy: boolean; anyway: () => void; waiting: () => void; close: () => void }) {
  const t = formsCopy[locale];
  return (
    <Modal title={fill(t.teamFullTitle, { team })} close={close}>
      <p>{t.teamFullText}</p>
      <div className="actions">
        <Button disabled={busy} onClick={anyway}>
          {t.acceptAnyway}
        </Button>
        <Button variant="secondary" disabled={busy} onClick={waiting}>
          {t.toWaiting}
        </Button>
        <Button variant="ghost" onClick={close}>
          {t.cancel}
        </Button>
      </div>
    </Modal>
  );
}

/** A refusal (optional reason) or a request for more information (what is missing). */
export function MessageDialog({
  locale,
  kind,
  name,
  busy,
  send,
  close,
}: {
  locale: Locale;
  kind: "refuse" | "complement";
  name: string;
  busy: boolean;
  send: (message: string) => void;
  close: () => void;
}) {
  const t = formsCopy[locale];
  const refuse = kind === "refuse";
  return (
    <Modal title={fill(refuse ? t.refuseTitle : t.complementTitle, { name })} close={close}>
      <form
        className="stack-form"
        onSubmit={(e) => {
          e.preventDefault();
          send(String(new FormData(e.currentTarget).get("message") ?? "").trim());
        }}
      >
        <label htmlFor="decision-reason">
          {refuse ? t.reason : t.complementText}
          <textarea id="decision-reason" name="message" maxLength={3000} required={!refuse} minLength={refuse ? undefined : 5} aria-describedby="decision-reason-hint" />
        </label>
        <p id="decision-reason-hint" className="muted small">
          {refuse ? t.reasonHint : t.complementHint}
        </p>
        <div className="actions">
          <Button disabled={busy} variant={refuse ? "danger" : "primary"}>
            {refuse ? t.confirmRefuse : t.send}
          </Button>
          <Button type="button" variant="secondary" onClick={close}>
            {t.cancel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** The public form as it will be seen, in a dialog. */
export function PreviewDialog({ locale, form, close, children }: { locale: Locale; form: FormRow; close: () => void; children: ReactNode }) {
  const t = formsCopy[locale];
  return (
    <Modal title={fill(t.previewOf, { form: form.title })} close={close} className="player-dialog preview-dialog">
      <div className="registration-preview">
        <h3>{form.title}</h3>
        {form.description && <p className="message-text">{form.description}</p>}
        {children}
      </div>
    </Modal>
  );
}
