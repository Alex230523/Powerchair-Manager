"use client";
import Link from "next/link";
import {
  useId,
  type ButtonHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Icon, type IconName } from "./icons";

/*
 * Shared components of the "minimalisme chaleureux" design (wave 13): every
 * page is built from these. Texts come in as props, colours and sizes come
 * from the tokens of globals.css; nothing here is hard-coded.
 */

export type Tone = "neutral" | "primary" | "brand" | "success" | "warning" | "danger" | "info";
const tones: readonly string[] = ["neutral", "primary", "success", "warning", "danger", "info"];
/** "brand" is the former name of the primary tone; anything unknown (an empty string, say) is neutral. */
const toneName = (tone: Tone | string | undefined): Tone => (tone === "brand" ? "primary" : tones.includes(tone ?? "") ? (tone as Tone) : "neutral");

/* ---------- Button ---------- */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export function Button({
  variant = "primary",
  size = "md",
  icon,
  loading = false,
  className = "",
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: "sm" | "md";
  icon?: IconName;
  /** Shows a small spinner and marks the button busy; the click is ignored meanwhile. */
  loading?: boolean;
}) {
  return (
    <button
      className={`button ${variant === "primary" ? "" : variant} ${size === "sm" ? "sm" : ""} ${className}`.replace(/\s+/g, " ").trim()}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className="button-spinner" aria-hidden="true" />
      ) : (
        icon && (
          <span className="button-icon" aria-hidden="true">
            <Icon name={icon} size={16} />
          </span>
        )
      )}
      {children}
    </button>
  );
}

/* ---------- Page header ---------- */
export type Crumb = { label: string; href?: string };
export function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow,
  crumbs,
  crumbsLabel,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Page actions, the primary button last. */
  actions?: ReactNode;
  eyebrow?: ReactNode;
  /** Optional breadcrumb above the title. */
  crumbs?: Crumb[];
  /** Accessible name of the breadcrumb navigation. */
  crumbsLabel?: string;
  children?: ReactNode;
}) {
  return (
    <header className="page-header">
      {crumbs && crumbs.length > 0 && (
        <nav className="crumbs" aria-label={crumbsLabel}>
          <ol>
            {crumbs.map((c, i) => (
              <li key={i} aria-current={i === crumbs.length - 1 ? "page" : undefined}>
                {c.href && i < crumbs.length - 1 ? <Link href={c.href}>{c.label}</Link> : <span>{c.label}</span>}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="page-header-row">
        <div className="page-header-text">
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h1>{title}</h1>
          {subtitle && <p className="page-subtitle">{subtitle}</p>}
        </div>
        {actions && <div className="page-actions">{actions}</div>}
      </div>
      {children}
    </header>
  );
}

/* ---------- Card ---------- */
export function CardHeader({
  title,
  description,
  action,
  icon,
  id,
  divider,
  level = 2,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: IconName;
  id?: string;
  /** A fine line under the header: only when the body is a table or a chart. */
  divider?: boolean;
  level?: 2 | 3;
}) {
  const Heading = level === 3 ? "h3" : "h2";
  return (
    <div className="card-header" data-divider={divider || undefined}>
      <div className="card-heading">
        {icon && (
          <span className="card-icon" aria-hidden="true">
            <Icon name={icon} />
          </span>
        )}
        <div>
          <Heading id={id}>{title}</Heading>
          {description && <p className="card-subtitle">{description}</p>}
        </div>
      </div>
      {action && <div className="card-actions">{action}</div>}
    </div>
  );
}
export function CardFooter({ children }: { children: ReactNode }) {
  return <div className="card-footer">{children}</div>;
}
export function Card({
  title,
  subtitle,
  actions,
  icon,
  id,
  className = "",
  children,
  labelledBy,
  flat,
  href,
  onClick,
  divider,
  footer,
  as,
  headingId,
  label,
  data,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  icon?: IconName;
  id?: string;
  className?: string;
  children: ReactNode;
  labelledBy?: string;
  /** No shadow: for a card nested in another card. */
  flat?: boolean;
  /** Interactive card: the whole card is a link. */
  href?: string;
  /** Interactive card: the whole card is a button. */
  onClick?: () => void;
  divider?: boolean;
  footer?: ReactNode;
  as?: "section" | "article" | "div" | "li";
  /** Explicit id of the title heading (when something else points at it). */
  headingId?: string;
  /** Accessible name of a card without a visible title. */
  label?: string;
  /** data-* attributes of the card element (a status the styles react to, say). */
  data?: Record<string, string | number | boolean | undefined>;
}) {
  const dataAttrs = Object.fromEntries(Object.entries(data ?? {}).map(([k, v]) => ["data-" + k, v === undefined || v === false ? undefined : String(v)]));
  const titleId = headingId ?? (title && id ? id + "-title" : undefined);
  const classes = `card ${flat ? "flat" : ""} ${href || onClick ? "interactive" : ""} ${className}`.replace(/\s+/g, " ").trim();
  const body = (
    <>
      {(title || actions) && (
        <CardHeader title={title} description={subtitle} action={actions} icon={icon} id={titleId} divider={divider ?? className.includes("flush")} />
      )}
      <div className="card-body">{children}</div>
      {footer && <CardFooter>{footer}</CardFooter>}
    </>
  );
  if (href)
    return (
      <Link className={classes} href={href} aria-labelledby={labelledBy ?? titleId}>
        {body}
      </Link>
    );
  if (onClick)
    return (
      <button type="button" className={classes} onClick={onClick} aria-labelledby={labelledBy ?? titleId}>
        {body}
      </button>
    );
  const Tag = as ?? "section";
  return (
    <Tag id={id} className={classes} aria-labelledby={labelledBy ?? titleId} aria-label={label} {...dataAttrs}>
      {body}
    </Tag>
  );
}
/** The former Panel: a titled card. */
export function Panel({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return (
    <Card title={title} headingId={id} labelledBy={id}>
      {children}
    </Card>
  );
}

/* ---------- Toast (wave 15, C10) ---------- */
/**
 * A short dark message after an action, bottom right (above the mobile bar
 * on a phone), with an optional text button such as "Annuler". Hovering or
 * focusing it pauses its timer; the region around it is a status, so screen
 * readers announce it.
 */
export function Toast({
  message,
  icon = "check",
  actionLabel,
  onAction,
  busy,
  closeLabel,
  onClose,
  onPause,
  onResume,
}: {
  message: string;
  icon?: IconName;
  actionLabel?: string;
  onAction?: () => void;
  busy?: boolean;
  closeLabel: string;
  onClose: () => void;
  onPause: () => void;
  onResume: () => void;
}) {
  return (
    <div className="toast" onMouseEnter={onPause} onMouseLeave={onResume} onFocus={onPause} onBlur={onResume}>
      <Icon name={icon} size={18} />
      <span className="toast-text">{message}</span>
      {actionLabel && onAction && (
        <button type="button" className="toast-action" disabled={busy} onClick={onAction}>
          {actionLabel}
        </button>
      )}
      <button type="button" className="toast-close" aria-label={closeLabel} onClick={onClose}>
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}

/* ---------- Icon tile, badge ---------- */
export function IconTile({ icon, tone = "primary", size = 36 }: { icon: IconName; tone?: Tone; size?: 28 | 36 | 44 }) {
  return (
    <span className="icon-tile" data-tone={toneName(tone)} data-size={size === 44 ? "lg" : size === 28 ? "sm" : undefined} aria-hidden="true">
      <Icon name={icon} size={size === 44 ? 22 : size === 28 ? 16 : 18} />
    </span>
  );
}
export function Badge({ tone = "neutral", dot, children }: { tone?: Tone | string; dot?: boolean; children: ReactNode }) {
  return (
    <span className="badge" data-tone={toneName(tone)}>
      {dot && <span className="badge-dot" aria-hidden="true" />}
      {children}
    </span>
  );
}

/* ---------- KPI card ---------- */
export function KpiCard({
  label,
  value,
  description,
  hint,
  icon,
  tone = "primary",
  href,
  delta,
}: {
  label: string;
  value: ReactNode;
  description?: ReactNode;
  /** Former name of description. */
  hint?: ReactNode;
  icon?: IconName;
  tone?: Tone;
  href?: string;
  /** A change, always with a text: the arrow and colour never carry the meaning alone. */
  delta?: { direction: "up" | "down" | "flat"; text: string; tone?: "success" | "danger" | "neutral" };
}) {
  const body = (
    <>
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        {icon && <IconTile icon={icon} tone={tone === "neutral" ? "primary" : tone} />}
      </div>
      <span className="stat-value">{value}</span>
      {(description ?? hint) && <span className="stat-hint">{description ?? hint}</span>}
      {delta && (
        <span className="stat-delta" data-tone={delta.tone ?? (delta.direction === "up" ? "success" : delta.direction === "down" ? "danger" : "neutral")}>
          <span aria-hidden="true">{delta.direction === "up" ? "↑" : delta.direction === "down" ? "↓" : "→"}</span> {delta.text}
        </span>
      )}
    </>
  );
  return href ? (
    <Link className="stat-card stat-link" href={href}>
      {body}
    </Link>
  ) : (
    <div className="stat-card">{body}</div>
  );
}
/** Former name of KpiCard. */
export const StatCard = KpiCard;

/* ---------- Tabs and segmented control ---------- */
export type TabItem = { id: string; label: ReactNode; count?: number; disabled?: boolean };
/** Arrow keys, Home and End move the focus between the enabled items of the list and select the one reached. */
function roving(e: KeyboardEvent<HTMLDivElement>) {
  const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
  if (!keys.includes(e.key)) return;
  const items = [...e.currentTarget.querySelectorAll<HTMLButtonElement>("[data-roving]:not([disabled])")];
  const at = items.findIndex((b) => b === document.activeElement);
  if (at < 0) return;
  e.preventDefault();
  const next = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : (at + (e.key === "ArrowRight" ? 1 : items.length - 1)) % items.length;
  items[next].focus();
  items[next].click();
}
/** Page tabs: tablist/tab roles, arrow keys move and select. */
export function Tabs({
  items,
  value,
  onChange,
  label,
  panelId,
  idPrefix,
}: {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  /** Accessible name of the tab list. */
  label: string;
  /** Id of the panel the tabs control, or a function of the tab id (only the selected tab points at it: the other panels are not in the page). */
  panelId?: string | ((id: string) => string);
  /** Prefix of the tab ids (default: a generated one), for panels that point back at their tab. */
  idPrefix?: string;
}) {
  const generated = useId();
  const base = idPrefix ?? generated;
  return (
    <div className="tabs" role="tablist" aria-label={label} onKeyDown={roving}>
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          role="tab"
          id={`${base}-${it.id}`}
          data-roving=""
          aria-selected={value === it.id}
          aria-controls={value === it.id ? (typeof panelId === "function" ? panelId(it.id) : panelId) : undefined}
          tabIndex={value === it.id ? 0 : -1}
          disabled={it.disabled}
          onClick={() => onChange(it.id)}
        >
          {it.label}
          {it.count !== undefined && <span className="tab-count">{it.count}</span>}
        </button>
      ))}
    </div>
  );
}
/** Compact choice between a few values (view, period...): a group of pressed buttons. */
export function Segmented({
  items,
  value,
  onChange,
  label,
}: {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={label} onKeyDown={roving}>
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          data-roving=""
          aria-pressed={value === it.id}
          tabIndex={value === it.id ? 0 : -1}
          disabled={it.disabled}
          onClick={() => onChange(it.id)}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- Empty state ---------- */
export function EmptyState({
  title,
  text,
  icon,
  action,
  tone = "primary",
}: {
  title: string;
  text?: ReactNode;
  icon?: IconName;
  action?: ReactNode;
  tone?: Tone;
}) {
  return (
    <div className="empty-state">
      {icon && <IconTile icon={icon} tone={tone} size={44} />}
      <p className="empty-title">{title}</p>
      {text && <p className="empty-text">{text}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

/* ---------- Data table ---------- */
/**
 * Dresses an existing <table>: sticky muted header, 44 px rows, hover, numeric
 * columns (.num) right-aligned in tabular figures, and an accessible
 * horizontal scroll (a labelled, focusable region).
 */
export function DataTable({
  label,
  caption,
  className = "",
  children,
}: {
  /** Accessible name of the scrolling region. */
  label: string;
  /** Visible or screen-reader caption of the table. */
  caption?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`data-table table-scroll ${className}`.trim()} role="region" aria-label={label} tabIndex={0}>
      <table>
        {caption && <caption className="sr-only">{caption}</caption>}
        {children}
      </table>
    </div>
  );
}

/* ---------- Field ---------- */
export function Field({
  id,
  label,
  help,
  error,
  required,
  children,
  className = "",
}: {
  id: string;
  label: ReactNode;
  help?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  /** The control, carrying the same id (and aria-describedby when help or error are given). */
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`field ${error ? "has-error" : ""} ${className}`.replace(/\s+/g, " ").trim()}>
      <label htmlFor={id}>
        {label}
        {required && (
          <span className="field-required" aria-hidden="true">
            {" "}
            *
          </span>
        )}
      </label>
      {children}
      {help && (
        <p className="field-help" id={id + "-help"}>
          {help}
        </p>
      )}
      {error && (
        <p className="field-error" id={id + "-error"}>
          <Icon name="alert" size={14} /> {error}
        </p>
      )}
    </div>
  );
}
/** The aria-describedby value a control inside Field should carry. */
export const describedBy = (id: string, help?: unknown, error?: unknown) =>
  [help ? id + "-help" : "", error ? id + "-error" : ""].filter(Boolean).join(" ") || undefined;

/* ---------- Toolbar ---------- */
/** Search, filters and the page's own buttons, in that order, on one line. */
export function Toolbar({ children, actions, label }: { children?: ReactNode; actions?: ReactNode; label?: string }) {
  return (
    <div className="toolbar" role="group" aria-label={label}>
      <div className="toolbar-filters">{children}</div>
      {actions && <div className="toolbar-actions">{actions}</div>}
    </div>
  );
}
export { ExportButton, downloadExport, type ExportColumnDef } from "./export-button";
