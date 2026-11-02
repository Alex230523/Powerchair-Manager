"use client";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import type { guideChapter, guideIndex, guidePublic } from "@/domains/guide/service";
import { guideAudiences, inLocale, parseBody, t3, type ChapterContent, type GuideAudience, type Text3 } from "@/domains/guide/schema";
import { ChapterQuiz, GuideSearch, KnowledgeLinks, LexText, QuizEditor, type Term } from "./knowledge";
import { knowledgeCopy } from "./knowledge-copy";
import { guideCopy } from "./guide-copy";
import { GuideFigure } from "./guide-figures";
import { errors } from "./access-copy";
import { Badge, Button, Card, EmptyState, Field, PageHeader, Segmented, describedBy } from "./ui";

/**
 * Guide du powerchair football: the table of contents (the reader's
 * chapters first, « Tout voir » for the rest), a chapter with its figures,
 * sources, date and the club's note « Chez nous », printable on A4; for the
 * federation, the writing tools (drafts, versions, publication, public page).
 */
type Index = Awaited<ReturnType<typeof guideIndex>>;
type Chapter = Awaited<ReturnType<typeof guideChapter>>;
type Public = Awaited<ReturnType<typeof guidePublic>>;
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""));
const dayText = (l: Locale, d: string) => new Intl.DateTimeFormat(l === "en" ? "en-GB" : `${l}-BE`, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(d.slice(0, 10) + "T12:00:00Z"));

async function post(organizationId: string, body: Record<string, unknown>) {
  const r = await fetch("/api/guide", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId, ...body }) });
  const v = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(v.error ?? "UNAVAILABLE");
  return v as Record<string, unknown>;
}
function message(locale: Locale, code: string) {
  return guideCopy[locale].errors[code] ?? errors[code]?.[locale] ?? errors.INVALID_INPUT?.[locale] ?? code;
}

export function GuideIndex({ locale }: { locale: Locale }) {
  const t = guideCopy[locale];
  const [data, setData] = useState<Index | null>(null),
    [version, setVersion] = useState(0),
    [scope, setScope] = useState<"mine" | "all">("mine"),
    [creating, setCreating] = useState(false),
    [status, setStatus] = useState(""),
    [failed, setFailed] = useState("");
  useEffect(() => {
    let live = true;
    fetch(`/api/guide?locale=${locale}`, { cache: "no-store" })
      .then(async (r) => (r.ok ? ((await r.json()) as Index) : null))
      .then((v) => {
        if (live) setData(v);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [locale, version]);
  async function adopt() {
    if (!data) return;
    setFailed("");
    try {
      const v = await post(data.organization_id, { action: "adopt" });
      setStatus(fill(t.write.adopted, { n: Number(v.added ?? 0) }));
      setVersion((n) => n + 1);
    } catch (e) {
      setFailed(message(locale, (e as Error).message));
    }
  }
  const shown = data ? (scope === "mine" && !data.can.manage ? data.chapters.filter((c) => c.forMe) : data.chapters) : [];
  return (
    <main id="main" className="guide-page">
      <PageHeader title={t.title} subtitle={t.intro} />
      <p role="status" className="sr-only">
        {status}
      </p>
      {failed && <p role="alert">{failed}</p>}
      {!data ? null : !data.federation ? (
        <EmptyState title={t.noFederation} />
      ) : (
        <>
          {data.can.manage && (
            <Card title={t.write.title} labelledBy="guide-write" headingId="guide-write">
              <p className="muted">{t.write.toCheck}</p>
              <p className="actions">
                <Button type="button" variant="secondary" onClick={() => void adopt()}>
                  {t.write.adopt}
                </Button>
                <Button type="button" variant="secondary" icon="plus" onClick={() => setCreating((v) => !v)} aria-expanded={creating}>
                  {t.write.newChapter}
                </Button>
              </p>
              {creating && (
                <ChapterEditor
                  locale={locale}
                  organizationId={data.organization_id}
                  onSaved={() => {
                    setCreating(false);
                    setStatus(t.write.saved);
                    setVersion((n) => n + 1);
                  }}
                />
              )}
            </Card>
          )}
          <GuideSearch locale={locale} />
          <KnowledgeLinks locale={locale} />
          {!data.can.manage && data.chapters.some((c) => !c.forMe) && (
            <Segmented
              label={t.title}
              value={scope}
              onChange={(v) => setScope(v as "mine" | "all")}
              items={[
                { id: "mine", label: t.forMe },
                { id: "all", label: t.all },
              ]}
            />
          )}
          {!shown.length ? (
            <EmptyState title={data.can.manage ? t.emptyManage : t.empty} />
          ) : (
            <ul className="guide-list">
              {shown.map((c) => (
                <li key={c.id}>
                  <Link href={`/${locale}/guide/${c.slug}`} className="guide-item">
                    <strong>{c.title}</strong>
                    {c.summary && <span className="muted">{c.summary}</span>}
                    <span className="guide-badges">
                      {c.status === "draft" && <Badge tone="warning">{t.draft}</Badge>}
                      {c.changed && <Badge tone="info">{t.changed}</Badge>}
                      {c.public && <Badge tone="neutral">{t.publicBadge}</Badge>}
                      {c.read && <Badge tone="success">{t.read}</Badge>}
                      {c.updated_on && <span className="small muted">{fill(t.updated, { date: dayText(locale, c.updated_on) })}</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  );
}

/** The chapter's text, read as blocks (never as HTML), with its figures, its gallery images and the lexicon's tips. */
type ChapterImage = { id: string; alt: Text3; caption: Partial<Text3> };
export function ChapterBody({ locale, content, terms = [], images = [] }: { locale: Locale; content: ChapterContent; terms?: Term[]; images?: ChapterImage[] }) {
  const text = inLocale(content, locale);
  const blocks = parseBody(text.body);
  // G12: one tip per term on the page, at its first occurrence.
  const seen = new Set<string>();
  const lex = (x: string) => <LexText text={x} terms={terms} seen={seen} locale={locale} />;
  const headings = blocks.flatMap((b, i) => (b.type === "heading" ? [{ i, text: b.text }] : []));
  return (
    <div className="guide-body">
      {/* 2: the table of contents of a longer chapter. */}
      {headings.length >= 4 && (
        <nav className="guide-toc no-print" aria-label={knowledgeCopy[locale].toc}>
          <p className="small muted">{knowledgeCopy[locale].toc}</p>
          <ol>
            {headings.map((h) => (
              <li key={h.i}>
                <a href={`#part-${h.i}`}>{h.text}</a>
              </li>
            ))}
          </ol>
        </nav>
      )}
      {blocks.map((b, i) => {
        if (b.type === "heading")
          return (
            <h2 key={i} id={`part-${i}`}>
              {b.text}
            </h2>
          );
        if (b.type === "paragraph") return <p key={i}>{lex(b.text)}</p>;
        if (b.type === "list")
          return (
            <ul key={i}>
              {b.items.map((x, j) => (
                <li key={j}>{lex(x)}</li>
              ))}
            </ul>
          );
        if (b.type === "note")
          return (
            <aside key={i} className="guide-note">
              {lex(b.text)}
            </aside>
          );
        if (b.type === "figure") return <GuideFigure key={i} locale={locale} figure={b.figure} />;
        if (b.type === "image") {
          const img = images.find((x) => x.id === b.id);
          if (!img) return null;
          return (
            <figure key={i} className="guide-figure">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="guide-photo" src={`/api/guide/image?id=${img.id}`} alt={t3(img.alt, locale)} loading="lazy" />
              {t3(img.caption as Text3, locale) && <figcaption>{t3(img.caption as Text3, locale)}</figcaption>}
            </figure>
          );
        }
        const [head, ...rows] = b.rows;
        return (
          <div key={i} className="table-wrap">
            <table className="guide-table">
              <thead>
                <tr>
                  {head.map((h, j) => (
                    <th key={j} scope="col">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, j) => (
                  <tr key={j}>
                    {r.map((cell, k) =>
                      k === 0 ? (
                        <th key={k} scope="row">
                          {lex(cell)}
                        </th>
                      ) : (
                        <td key={k}>{lex(cell)}</td>
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

export function GuideChapterPage({ locale, slug }: { locale: Locale; slug: string }) {
  const t = guideCopy[locale];
  const [data, setData] = useState<Chapter | null>(null),
    [missing, setMissing] = useState(false),
    [version, setVersion] = useState(0),
    [editing, setEditing] = useState(false),
    [status, setStatus] = useState(""),
    [failed, setFailed] = useState("");
  useEffect(() => {
    let live = true;
    fetch(`/api/guide?slug=${encodeURIComponent(slug)}&draft=1`, { cache: "no-store" })
      .then(async (r) => {
        if (!live) return;
        if (!r.ok) return setMissing(true);
        const v = (await r.json()) as Chapter;
        setData(v);
        // Read: a welcome journey's « À lire » step pointing here ticks.
        if (v.chapter.status === "published") void post(v.organization_id, { action: "read", id: v.chapter.id }).catch(() => undefined);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [slug, version]);
  const act = useCallback(
    async (body: Record<string, unknown>, done: string) => {
      if (!data) return;
      setFailed("");
      try {
        const v = await post(data.organization_id, body);
        setStatus(typeof v.told === "number" && v.told > 0 ? fill(t.write.told, { n: v.told }) : done);
        setVersion((n) => n + 1);
      } catch (e) {
        setFailed(message(locale, (e as Error).message));
      }
    },
    [data, locale, t],
  );
  if (missing)
    return (
      <main id="main">
        <EmptyState title={t.empty} action={<Link href={`/${locale}/guide`}>{t.back}</Link>} />
      </main>
    );
  if (!data) return <main id="main" />;
  const c = data.chapter;
  const text = inLocale(c.content, locale);
  return (
    <main id="main" className="guide-page guide-chapter">
      <PageHeader
        title={text.title}
        subtitle={text.summary}
        crumbs={[{ label: t.title, href: `/${locale}/guide` }, { label: text.title }]}
        crumbsLabel={t.title}
        actions={
          <Button type="button" variant="secondary" onClick={() => window.print()}>
            {t.print}
          </Button>
        }
      />
      <p role="status" className="sr-only">
        {status}
      </p>
      {failed && <p role="alert">{failed}</p>}
      <p className="guide-meta small muted">
        {c.status === "draft" && <Badge tone="warning">{t.draft}</Badge>} {c.draft && c.current_version !== c.published_version && c.status === "published" && <Badge tone="info">{t.changed}</Badge>}{" "}
        {c.updated_on && fill(t.updated, { date: dayText(locale, c.updated_on) })} · {c.audiences.map((a) => t.audiences[a as GuideAudience]).join(", ")}
      </p>
      {text.fallback && <p className="notice">{t.fallback}</p>}
      <ChapterBody locale={locale} content={c.content} terms={data.terms} images={data.images} />
      {data.quiz && c.status === "published" && <ChapterQuiz locale={locale} quiz={data.quiz} chapterId={c.id} organizationId={data.organization_id} passed={data.passed} />}
      {c.sources && (
        <p className="guide-sources small">
          <strong>{t.sources} :</strong> {c.sources}
        </p>
      )}
      {(data.note || data.can.note) && c.status === "published" && <ClubNote locale={locale} id={c.id} note={data.note} edit={data.can.note} act={act} />}
      {data.can.manage && (
        <Card title={t.write.title} labelledBy="guide-chapter-write" headingId="guide-chapter-write" className="guide-write no-print">
          <p className="actions">
            <Button type="button" variant="secondary" onClick={() => setEditing((v) => !v)} aria-expanded={editing}>
              {editing ? t.write.close : t.write.edit}
            </Button>
            {(c.status === "draft" || c.current_version !== c.published_version) && (
              <Button type="button" onClick={() => void act({ action: "publish", id: c.id }, t.write.published)}>
                {t.write.publish}
              </Button>
            )}
            {c.status === "published" && (
              <Button type="button" variant="ghost" onClick={() => void act({ action: "unpublish", id: c.id }, t.write.saved)}>
                {t.write.unpublish}
              </Button>
            )}
          </p>
          {c.status === "published" && (
            <label className="check">
              <input type="checkbox" checked={c.public} onChange={(e) => void act({ action: "public", id: c.id, public: e.target.checked }, t.write.saved)} /> {t.write.makePublic}
            </label>
          )}
          {c.public && c.status === "published" && (
            <p className="small">
              {t.write.publicLink} : <code>{`/${locale}/guide/public/${data.organization_id}/${c.slug}`}</code>
            </p>
          )}
          {editing && (
            <ChapterEditor
              locale={locale}
              organizationId={data.organization_id}
              initial={{ id: c.id, slug: c.slug, audiences: c.audiences as GuideAudience[], content: c.content, sources: c.sources }}
              onSaved={() => {
                setEditing(false);
                setStatus(t.write.saved);
                setVersion((n) => n + 1);
              }}
            />
          )}
          {/* G7: the chapter's quiz, written by the federation. */}
          <details>
            <summary>{knowledgeCopy[locale].quiz.title}</summary>
            <QuizEditor locale={locale} chapterId={c.id} organizationId={data.organization_id} quiz={data.quiz} onSaved={() => setVersion((n) => n + 1)} />
          </details>
          {data.versions.length > 0 && (
            <details>
              <summary>{t.write.versions}</summary>
              <ul className="plain-list small">
                {data.versions.map((v) => (
                  <li key={v.version}>{fill(t.write.version, { n: v.version, author: v.author, date: dayText(locale, String(v.created_at)) })}</li>
                ))}
              </ul>
            </details>
          )}
        </Card>
      )}
    </main>
  );
}

function ClubNote({ locale, id, note, edit, act }: { locale: Locale; id: string; note: string; edit: boolean; act: (b: Record<string, unknown>, done: string) => Promise<void> }) {
  const t = guideCopy[locale];
  function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void act({ action: "note", id, body: new FormData(e.currentTarget).get("note") ?? "" }, t.write.saved);
  }
  return (
    <section className="guide-ours" aria-labelledby={`ours-${id}`}>
      <h2 id={`ours-${id}`}>{t.ours}</h2>
      {note && <p className="pre-line">{note}</p>}
      {edit && (
        <form className="stack no-print" onSubmit={save}>
          <Field id={`ours-${id}-text`} label={t.ours} help={`${t.oursHelp} ${t.oursEmpty}`}>
            <textarea id={`ours-${id}-text`} name="note" maxLength={1000} rows={3} defaultValue={note} aria-describedby={describedBy(`ours-${id}-text`, true)} />
          </Field>
          <p className="actions">
            <Button type="submit" variant="secondary" size="sm">
              {t.oursSave}
            </Button>
          </p>
        </form>
      )}
    </section>
  );
}

type Initial = { id?: string; slug: string; audiences: GuideAudience[]; content: ChapterContent; sources: string };
const blank: Initial = { slug: "", audiences: [...guideAudiences], content: { fr: { title: "", summary: "", body: "" }, nl: {}, en: {} }, sources: "" };

/** The federation's editor: one language at a time, the others kept; every save is a new version (a draft). */
function ChapterEditor({ locale, organizationId, initial = blank, onSaved }: { locale: Locale; organizationId: string; initial?: Initial; onSaved: () => void }) {
  const t = guideCopy[locale];
  const [draft, setDraft] = useState<Initial>(initial),
    [lang, setLang] = useState<"fr" | "nl" | "en">(locale),
    [preview, setPreview] = useState(false),
    [busy, setBusy] = useState(false),
    [failed, setFailed] = useState("");
  const base = `guide-edit-${initial.id ?? "new"}`;
  const part = draft.content[lang] ?? {};
  const change = (k: "title" | "summary" | "body", v: string) => setDraft((d) => ({ ...d, content: { ...d.content, [lang]: { ...d.content[lang], [k]: v } } }));
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setFailed("");
    try {
      const clean = (x: { title?: string; summary?: string; body?: string }) => (x.title ? { title: x.title, summary: x.summary ?? "", body: x.body ?? "" } : {});
      await post(organizationId, {
        action: "save",
        ...(draft.id ? { id: draft.id } : {}),
        slug: draft.slug,
        audiences: draft.audiences,
        sources: draft.sources,
        content: { fr: { title: draft.content.fr.title, summary: draft.content.fr.summary ?? "", body: draft.content.fr.body ?? "" }, nl: clean(draft.content.nl), en: clean(draft.content.en) },
      });
      onSaved();
    } catch (err) {
      setFailed(message(locale, (err as Error).message));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="stack guide-editor" onSubmit={(e) => void save(e)}>
      {failed && <p role="alert">{failed}</p>}
      <Field id={`${base}-slug`} label={t.write.slug} help={t.write.slugHelp} required>
        <input id={`${base}-slug`} required pattern="[a-z0-9-]{2,40}" value={draft.slug} onChange={(e) => setDraft((d) => ({ ...d, slug: e.target.value }))} aria-describedby={describedBy(`${base}-slug`, true)} />
      </Field>
      <fieldset>
        <legend>{t.write.audiences}</legend>
        {guideAudiences.map((a) => (
          <label className="check" key={a}>
            <input
              type="checkbox"
              checked={draft.audiences.includes(a)}
              onChange={(e) => setDraft((d) => ({ ...d, audiences: e.target.checked ? [...d.audiences, a] : d.audiences.filter((x) => x !== a) }))}
            />{" "}
            {t.audiences[a]}
          </label>
        ))}
      </fieldset>
      <Field id={`${base}-lang`} label={t.write.language}>
        <select id={`${base}-lang`} value={lang} onChange={(e) => setLang(e.target.value as "fr" | "nl" | "en")}>
          <option value="fr">Français</option>
          <option value="nl">Nederlands</option>
          <option value="en">English</option>
        </select>
      </Field>
      <Field id={`${base}-title`} label={t.write.chapterTitle} required={lang === "fr"}>
        <input id={`${base}-title`} required={lang === "fr"} minLength={2} maxLength={120} value={part.title ?? ""} onChange={(e) => change("title", e.target.value)} />
      </Field>
      <Field id={`${base}-summary`} label={t.write.summary}>
        <input id={`${base}-summary`} maxLength={300} value={part.summary ?? ""} onChange={(e) => change("summary", e.target.value)} />
      </Field>
      <Field id={`${base}-body`} label={t.write.body} help={t.write.bodyHelp}>
        <textarea id={`${base}-body`} rows={14} maxLength={20000} value={part.body ?? ""} onChange={(e) => change("body", e.target.value)} aria-describedby={describedBy(`${base}-body`, true)} />
      </Field>
      <Field id={`${base}-sources`} label={t.write.sources}>
        <textarea id={`${base}-sources`} rows={2} maxLength={2000} value={draft.sources} onChange={(e) => setDraft((d) => ({ ...d, sources: e.target.value }))} />
      </Field>
      <p className="actions">
        <Button type="button" variant="ghost" onClick={() => setPreview((v) => !v)} aria-expanded={preview}>
          {t.write.preview}
        </Button>
        <Button type="submit" loading={busy} disabled={!draft.audiences.length}>
          {t.write.save}
        </Button>
      </p>
      {preview && draft.content.fr.title && <ChapterBody locale={lang} content={draft.content} />}
    </form>
  );
}

/** The public page of a chapter (no account): discovery days, new parents. */
export function GuidePublicPage({ locale, federation, slug }: { locale: Locale; federation: string; slug: string }) {
  const t = guideCopy[locale];
  const [data, setData] = useState<Public | null>(null),
    [missing, setMissing] = useState(false);
  useEffect(() => {
    let live = true;
    fetch(`/api/guide/public?federation=${encodeURIComponent(federation)}&slug=${encodeURIComponent(slug)}`, { cache: "no-store" })
      .then(async (r) => {
        if (!live) return;
        if (!r.ok) return setMissing(true);
        setData((await r.json()) as Public);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [federation, slug]);
  if (missing)
    return (
      <main id="main">
        <EmptyState title={t.empty} />
      </main>
    );
  if (!data) return <main id="main" />;
  const text = inLocale(data.content, locale);
  return (
    <main id="main" className="guide-page guide-chapter">
      <PageHeader
        eyebrow={data.federation}
        title={text.title}
        subtitle={text.summary}
        actions={
          <Button type="button" variant="secondary" onClick={() => window.print()}>
            {t.print}
          </Button>
        }
      />
      {data.updated_on && <p className="small muted">{fill(t.updated, { date: dayText(locale, data.updated_on) })}</p>}
      {text.fallback && <p className="notice">{t.fallback}</p>}
      <ChapterBody locale={locale} content={data.content} images={data.images} />
      {data.sources && (
        <p className="guide-sources small">
          <strong>{t.sources} :</strong> {data.sources}
        </p>
      )}
    </main>
  );
}
