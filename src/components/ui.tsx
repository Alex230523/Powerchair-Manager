import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Icon, type IconName } from "./icons";

export function Button(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className="button" {...props} />;
}
export function Panel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

/*
 * Page skeleton shared by every module (wave 10, after PRÊT): a header with
 * the title, a one-line subtitle and the page actions on the right; cards
 * with a titled header and a body; figures as stat tiles; badges; an empty
 * state that never looks like an error.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="page-header">
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

export function Card({
  title,
  subtitle,
  actions,
  icon,
  id,
  className = "",
  children,
  labelledBy,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  icon?: IconName;
  id?: string;
  className?: string;
  children: ReactNode;
  labelledBy?: string;
}) {
  return (
    <section
      className={"card " + className}
      aria-labelledby={labelledBy ?? (title && id ? id + "-title" : undefined)}
    >
      {(title || actions) && (
        <div className="card-header">
          <div className="card-heading">
            {icon && (
              <span className="card-icon" aria-hidden="true">
                <Icon name={icon} />
              </span>
            )}
            <div>
              {title && <h2 id={id ? id + "-title" : undefined}>{title}</h2>}
              {subtitle && <p className="card-subtitle">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="card-actions">{actions}</div>}
        </div>
      )}
      <div className="card-body">{children}</div>
    </section>
  );
}

export type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";
export function Badge({
  tone = "neutral",
  dot,
  children,
}: {
  tone?: Tone;
  dot?: boolean;
  children: ReactNode;
}) {
  return (
    <span className="badge" data-tone={tone}>
      {dot && <span className="badge-dot" aria-hidden="true" />}
      {children}
    </span>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "neutral",
  href,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: IconName;
  tone?: Tone;
  href?: string;
}) {
  const body = (
    <>
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        {icon && (
          <span className="stat-icon" data-tone={tone} aria-hidden="true">
            <Icon name={icon} size={18} />
          </span>
        )}
      </div>
      <span className="stat-value">{value}</span>
      {hint && <span className="stat-hint">{hint}</span>}
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

export function EmptyState({
  title,
  text,
  icon,
  action,
}: {
  title: string;
  text?: string;
  icon?: IconName;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      {icon && (
        <span className="empty-icon" aria-hidden="true">
          <Icon name={icon} />
        </span>
      )}
      <p className="empty-title">{title}</p>
      {text && <p className="empty-text">{text}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

/** Search, filters and the page's own buttons, in that order, on one line. */
export function Toolbar({
  children,
  actions,
  label,
}: {
  children?: ReactNode;
  actions?: ReactNode;
  label?: string;
}) {
  return (
    <div className="toolbar" role="group" aria-label={label}>
      <div className="toolbar-filters">{children}</div>
      {actions && <div className="toolbar-actions">{actions}</div>}
    </div>
  );
}
