"use client";
import { useState } from "react";
import type { Locale } from "@/lib/locale";
import { designCopy } from "./design-copy";
import { Badge, Button, Card, DataTable, EmptyState, Field, IconTile, KpiCard, PageHeader, Segmented, Tabs, describedBy } from "./ui";

/** The gallery of shared components, rendered once per theme (development only). */
export function DesignGallery({ locale }: { locale: Locale }) {
  const t = designCopy[locale];
  return (
    <main id="main" className="access design-gallery">
      <PageHeader title={t.title} subtitle={t.subtitle} />
      <div className="design-themes">
        {(["light", "dark"] as const).map((theme) => (
          <section key={theme} className="theme-scope design-theme" style={{ colorScheme: theme }} aria-label={t[theme]}>
            <h2 className="design-theme-title">{t[theme]}</h2>
            <Samples locale={locale} theme={theme} />
          </section>
        ))}
      </div>
    </main>
  );
}

function Samples({ locale, theme }: { locale: Locale; theme: "light" | "dark" }) {
  const t = designCopy[locale];
  const [tab, setTab] = useState("0"),
    [view, setView] = useState("0");
  const id = (k: string) => `${theme}-${k}`;
  return (
    <div className="design-samples">
      <section aria-labelledby={id("h-header")}>
        <h3 id={id("h-header")}>{t.sections.header}</h3>
        <PageHeader
          crumbs={t.header.crumbs.map((label, i) => ({ label, href: i ? undefined : "#" }))}
          crumbsLabel={t.header.crumbsLabel}
          title={t.header.title}
          subtitle={t.header.subtitle}
          actions={
            <>
              <Button variant="secondary">{t.header.secondary}</Button>
              <Button>{t.header.primary}</Button>
            </>
          }
        />
      </section>
      <section aria-labelledby={id("h-buttons")}>
        <h3 id={id("h-buttons")}>{t.sections.buttons}</h3>
        <div className="design-row">
          <Button>{t.buttons.primary}</Button>
          <Button variant="secondary">{t.buttons.secondary}</Button>
          <Button variant="ghost">{t.buttons.ghost}</Button>
          <Button variant="danger">{t.buttons.danger}</Button>
          <Button icon="players">{t.buttons.icon}</Button>
          <Button loading>{t.buttons.loading}</Button>
          <Button disabled>{t.buttons.disabled}</Button>
          <Button size="sm" variant="secondary">{t.buttons.small}</Button>
        </div>
      </section>
      <section aria-labelledby={id("h-badges")}>
        <h3 id={id("h-badges")}>{t.sections.badges}</h3>
        <div className="design-row">
          <Badge>{t.badges.neutral}</Badge>
          <Badge tone="primary">{t.badges.primary}</Badge>
          <Badge tone="success" dot>{t.badges.success}</Badge>
          <Badge tone="warning" dot>{t.badges.warning}</Badge>
          <Badge tone="danger" dot>{t.badges.danger}</Badge>
          <Badge tone="info">{t.badges.info}</Badge>
        </div>
        <div className="design-row">
          <IconTile icon="players" />
          <IconTile icon="check" tone="success" />
          <IconTile icon="alert" tone="warning" />
          <IconTile icon="alert" tone="danger" />
          <IconTile icon="bell" tone="info" />
          <IconTile icon="settings" tone="neutral" />
          <IconTile icon="team" size={44} />
        </div>
      </section>
      <section aria-labelledby={id("h-kpi")}>
        <h3 id={id("h-kpi")}>{t.sections.kpi}</h3>
        <ul className="stat-row-grid" data-cols="2">
          <li>
            <KpiCard label={t.kpi.label} value={t.kpi.value} description={t.kpi.description} icon="players" delta={{ direction: "up", text: t.kpi.delta }} href="#" />
          </li>
          <li>
            <KpiCard label={t.kpi.late} value={t.kpi.lateValue} icon="dues" tone="danger" delta={{ direction: "down", text: t.kpi.down, tone: "success" }} />
          </li>
        </ul>
      </section>
      <section aria-labelledby={id("h-cards")}>
        <h3 id={id("h-cards")}>{t.sections.cards}</h3>
        <Card title={t.cards.title} subtitle={t.cards.description} actions={<Button variant="secondary" size="sm">{t.cards.action}</Button>} footer={t.cards.footer}>
          <p>{t.cards.body}</p>
          <Card flat title={t.cards.flat}>
            <p>{t.cards.body}</p>
          </Card>
        </Card>
        <Card title={t.cards.interactive} href="#">
          <p>{t.cards.interactiveBody}</p>
        </Card>
        <Card title={t.cards.divided} className="flush">
          <DataTable label={t.table.label} caption={t.table.caption}>
            <thead>
              <tr>
                <th scope="col">{t.table.name}</th>
                <th scope="col">{t.table.team}</th>
                <th scope="col" className="num">{t.table.amount}</th>
              </tr>
            </thead>
            <tbody>
              {t.table.rows.map((r) => (
                <tr key={r[0]}>
                  <th scope="row">{r[0]}</th>
                  <td>{r[1]}</td>
                  <td className="num">{r[2]}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Card>
      </section>
      <section aria-labelledby={id("h-tabs")}>
        <h3 id={id("h-tabs")}>{t.sections.tabs}</h3>
        <Tabs label={t.tabs.label} items={t.tabs.items.map((label, i) => ({ id: String(i), label, count: i === 0 ? 12 : undefined }))} value={tab} onChange={setTab} panelId={id("panel")} />
        <div id={id("panel")} role="tabpanel" className="design-panel">
          {t.tabs.panel} : {t.tabs.items[Number(tab)]}
        </div>
        <Segmented label={t.tabs.segmentedLabel} items={t.tabs.segmented.map((label, i) => ({ id: String(i), label }))} value={view} onChange={setView} />
      </section>
      <section aria-labelledby={id("h-empty")}>
        <h3 id={id("h-empty")}>{t.sections.empty}</h3>
        <Card>
          <EmptyState icon="players" title={t.empty.title} text={t.empty.text} action={<Button>{t.empty.action}</Button>} />
        </Card>
      </section>
      <section aria-labelledby={id("h-fields")}>
        <h3 id={id("h-fields")}>{t.sections.fields}</h3>
        <form className="design-form" onSubmit={(e) => e.preventDefault()}>
          <Field id={id("name")} label={t.fields.name} help={t.fields.help} required>
            <input id={id("name")} aria-describedby={describedBy(id("name"), true)} defaultValue="Camille Dubois" />
          </Field>
          <Field id={id("email")} label={t.fields.email} error={t.fields.error}>
            <input id={id("email")} type="email" aria-invalid="true" aria-describedby={describedBy(id("email"), false, true)} defaultValue="camille@" />
          </Field>
          <Field id={id("team")} label={t.fields.team}>
            <select id={id("team")} defaultValue="1">
              {t.fields.teams.map((o, i) => (
                <option key={o} value={String(i)}>{o}</option>
              ))}
            </select>
          </Field>
        </form>
      </section>
    </div>
  );
}
