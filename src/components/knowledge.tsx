"use client";
import Link from "next/link";
import { useEffect, useId, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import type { Locale } from "@/lib/locale";
import type { knowledgeView } from "@/domains/guide/knowledge";
import type { guideSearch } from "@/domains/guide/service";
import { findTerms, imageCategories, t3, type Quiz as QuizData, type Text3 } from "@/domains/guide/schema";
import { helpSheets, type HelpSheet } from "@/domains/guide/help";
import { knowledgeCopy } from "./knowledge-copy";
import { guideCopy } from "./guide-copy";
import { errors } from "./access-copy";
import { Badge, Button, Card, EmptyState, Field, PageHeader, describedBy } from "./ui";

/**
 * Knowledge centre around the guide: the lexicon and its tips (G12), the
 * gallery (G5), the chair catalogue (G4), the quizzes (G7), the how-to
 * sheets (G10) and the guide's search.
 */
type View = Awaited<ReturnType<typeof knowledgeView>>;
type Found = Awaited<ReturnType<typeof guideSearch>>;
export type Term = { id: string; term: Text3; definition: Text3 };
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""));
const dayText = (l: Locale, d: string) => new Intl.DateTimeFormat(l === "en" ? "en-GB" : `${l}-BE`, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(d.slice(0, 10) + "T12:00:00Z"));
const failure = (locale: Locale, code: string) => knowledgeCopy[locale].errors[code] ?? errors[code]?.[locale] ?? errors.INVALID_INPUT?.[locale] ?? code;

async function post(organizationId: string, body: Record<string, unknown>) {
  const r = await fetch("/api/guide/knowledge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId, ...body }) });
  const v = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(v.error ?? "UNAVAILABLE");
  return v as Record<string, unknown>;
}
function readFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(new Error("INVALID_FILE"));
    r.readAsDataURL(file);
  });
}
function useKnowledge(part: "lexicon" | "gallery" | "chairs" | "chair", locale: Locale, id?: string) {
  const [data, setData] = useState<View | null>(null),
    [version, setVersion] = useState(0),
    [missing, setMissing] = useState(false);
  useEffect(() => {
    let live = true;
    fetch(`/api/guide/knowledge?part=${part}&locale=${locale}${id ? `&id=${id}` : ""}`, { cache: "no-store" })
      .then(async (r) => {
        if (!live) return;
        if (!r.ok) return setMissing(true);
        setData((await r.json()) as View);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [part, locale, id, version]);
  return { data, missing, reload: () => setVersion((n) => n + 1) };
}

/* ---------- G12: the lexicon's tips ---------- */
function subscribeLexicon(change: () => void) {
  window.addEventListener("pfm-display", change);
  return () => window.removeEventListener("pfm-display", change);
}
/** The tips are on unless the reader switched them off (Réglages › Mon compte). */
export function useLexiconOn() {
  return useSyncExternalStore(
    subscribeLexicon,
    () => document.documentElement.dataset.lexicon !== "off",
    () => true,
  );
}
export function LexiconChoice({ locale }: { locale: Locale }) {
  const t = knowledgeCopy[locale].lexicon;
  const on = useLexiconOn();
  function change(next: boolean) {
    const d = document.documentElement.dataset;
    if (next) delete d.lexicon;
    else d.lexicon = "off";
    try {
      window.localStorage.setItem("pfm-lexicon", next ? "on" : "off");
    } catch {
      /* Kept for this page only. */
    }
    window.dispatchEvent(new Event("pfm-display"));
  }
  const id = useId();
  return (
    <>
      <label className="check" htmlFor={id}>
        <input id={id} type="checkbox" checked={on} onChange={(e) => change(e.target.checked)} aria-describedby={`${id}-help`} /> {t.setting}
      </label>
      <p className="small muted" id={`${id}-help`}>
        {t.settingHelp}
      </p>
    </>
  );
}

/** A term with its definition, on hover and on keyboard focus; Escape hides it. */
export function Tip({ children, definition }: { children: ReactNode; definition: string }) {
  const id = useId();
  const [hidden, setHidden] = useState(false);
  return (
    <span className="lex-tip" data-hidden={hidden || undefined} onMouseLeave={() => setHidden(false)}>
      <button type="button" className="tip-term" aria-describedby={id} onKeyDown={(e) => e.key === "Escape" && setHidden(true)} onBlur={() => setHidden(false)}>
        {children}
      </button>
      <span role="tooltip" id={id} className="tip-bubble">
        {definition}
      </span>
    </span>
  );
}

/** A text with the first occurrence of each lexicon term (not yet seen on the page) as a Tip. */
export function LexText({ text, terms, seen, locale }: { text: string; terms: Term[]; seen: Set<string>; locale: Locale }) {
  const on = useLexiconOn();
  if (!on || !terms.length) return <>{text}</>;
  const parts = findTerms(
    text,
    terms.map((t) => ({ id: t.id, term: t3(t.term, locale) })),
    seen,
  );
  return (
    <>
      {parts.map((p, i) =>
        "id" in p ? (
          <Tip key={i} definition={t3(terms.find((t) => t.id === p.id)?.definition, locale)}>
            {p.text}
          </Tip>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

/* ---------- 2: search ---------- */
export function GuideSearch({ locale }: { locale: Locale }) {
  const t = knowledgeCopy[locale].search;
  const [found, setFound] = useState<Found | null>(null);
  async function search(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = String(new FormData(e.currentTarget).get("q") ?? "").trim();
    if (q.length < 2) return setFound(null);
    const r = await fetch(`/api/guide?search=${encodeURIComponent(q)}&locale=${locale}`, { cache: "no-store" });
    setFound(r.ok ? ((await r.json()) as Found) : null);
  }
  return (
    <section className="guide-search" aria-labelledby="guide-search-title">
      <h2 id="guide-search-title" className="sr-only">
        {t.label}
      </h2>
      <form role="search" className="inline-form" onSubmit={(e) => void search(e)}>
        <Field id="guide-search-q" label={t.label}>
          <input id="guide-search-q" name="q" type="search" minLength={2} maxLength={80} placeholder={t.placeholder} />
        </Field>
        <Button type="submit" variant="secondary">
          {t.go}
        </Button>
      </form>
      <div aria-live="polite">
        {found &&
          (!found.chapters.length && !found.terms.length ? (
            <p className="muted">{t.none}</p>
          ) : (
            <>
              {found.chapters.length > 0 && (
                <>
                  <h3>{t.chapters}</h3>
                  <ul className="plain-list guide-results">
                    {found.chapters.map((c) => (
                      <li key={c.slug}>
                        <Link href={`/${locale}/guide/${c.slug}`}>{c.title}</Link>
                        <p className="small muted">{c.snippet}</p>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {found.terms.length > 0 && (
                <>
                  <h3>{t.terms}</h3>
                  <dl className="guide-lexicon">
                    {found.terms.map((x) => (
                      <div key={x.id}>
                        <dt>{x.term}</dt>
                        <dd>{x.definition}</dd>
                      </div>
                    ))}
                  </dl>
                </>
              )}
            </>
          ))}
      </div>
    </section>
  );
}

/** The four other parts of the knowledge centre, as links on the guide's home. */
export function KnowledgeLinks({ locale }: { locale: Locale }) {
  const t = knowledgeCopy[locale].sections;
  const parts = [
    ["lexicon", "/guide/lexicon"],
    ["chairs", "/guide/chairs"],
    ["gallery", "/guide/gallery"],
    ["help", "/guide/help"],
  ] as const;
  return (
    <ul className="guide-list guide-parts">
      {parts.map(([k, route]) => (
        <li key={k}>
          <Link href={`/${locale}${route}`} className="guide-item">
            <strong>{t[k].title}</strong>
            <span className="muted">{t[k].intro}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
const back = (locale: Locale) => [{ label: guideCopy[locale].title, href: `/${locale}/guide` }];

/* ---------- G12: the lexicon page ---------- */
export function LexiconPage({ locale }: { locale: Locale }) {
  const k = knowledgeCopy[locale];
  const t = k.lexicon;
  const { data, reload } = useKnowledge("lexicon", locale);
  const [editing, setEditing] = useState<Term | "new" | null>(null),
    [status, setStatus] = useState(""),
    [failed, setFailed] = useState("");
  async function act(body: Record<string, unknown>, done: string) {
    if (!data) return;
    setFailed("");
    try {
      const v = await post(data.organization_id, body);
      setStatus(typeof v.added === "number" ? fill(t.adopted, { n: v.added }) : done);
      setEditing(null);
      reload();
    } catch (e) {
      setFailed(failure(locale, (e as Error).message));
    }
  }
  return (
    <main id="main" className="guide-page">
      <PageHeader title={k.sections.lexicon.title} subtitle={k.sections.lexicon.intro} crumbs={[...back(locale), { label: k.sections.lexicon.title }]} crumbsLabel={guideCopy[locale].title} />
      <p role="status" className="sr-only">
        {status}
      </p>
      {failed && <p role="alert">{failed}</p>}
      {data?.can.manage && (
        <p className="actions">
          {!data.terms.length && (
            <Button type="button" variant="secondary" onClick={() => void act({ action: "adoptTerms" }, t.saved)}>
              {t.adopt}
            </Button>
          )}
          <Button type="button" variant="secondary" icon="plus" onClick={() => setEditing("new")}>
            {t.add}
          </Button>
        </p>
      )}
      {editing && data && <TermEditor locale={locale} term={editing === "new" ? null : editing} save={(b) => void act(b, t.saved)} cancel={() => setEditing(null)} />}
      {!data ? null : !data.terms.length ? (
        <EmptyState title={data.federation ? t.empty : guideCopy[locale].noFederation} />
      ) : (
        <dl className="guide-lexicon">
          {data.terms.map((x) => (
            <div key={x.id}>
              <dt>{t3(x.term, locale)}</dt>
              <dd>
                {t3(x.definition, locale)}
                {data.can.manage && (
                  <span className="actions">
                    <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(x)}>
                      {guideCopy[locale].write.edit}
                      <span className="sr-only"> : {t3(x.term, locale)}</span>
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => void act({ action: "deleteTerm", id: x.id }, t.removed)}>
                      {t.remove}
                      <span className="sr-only"> : {t3(x.term, locale)}</span>
                    </Button>
                  </span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </main>
  );
}
function TermEditor({ locale, term, save, cancel }: { locale: Locale; term: Term | null; save: (b: Record<string, unknown>) => void; cancel: () => void }) {
  const t = knowledgeCopy[locale].lexicon;
  const [lang, setLang] = useState<"fr" | "nl" | "en">(locale);
  const [value, setValue] = useState<{ term: Text3; definition: Text3 }>({ term: term?.term ?? { fr: "", nl: "", en: "" }, definition: term?.definition ?? { fr: "", nl: "", en: "" } });
  const base = `term-${term?.id ?? "new"}`;
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    save({ action: "saveTerm", ...(term ? { id: term.id } : {}), term: { nl: "", en: "", ...value.term }, definition: { nl: "", en: "", ...value.definition } });
  }
  return (
    <form className="stack card-form" onSubmit={submit}>
      <Field id={`${base}-lang`} label={t.language}>
        <select id={`${base}-lang`} value={lang} onChange={(e) => setLang(e.target.value as "fr" | "nl" | "en")}>
          <option value="fr">Français</option>
          <option value="nl">Nederlands</option>
          <option value="en">English</option>
        </select>
      </Field>
      <Field id={`${base}-term`} label={t.term} required={lang === "fr"}>
        <input id={`${base}-term`} required={lang === "fr"} maxLength={60} value={value.term[lang] ?? ""} onChange={(e) => setValue((v) => ({ ...v, term: { ...v.term, [lang]: e.target.value } }))} />
      </Field>
      <Field id={`${base}-def`} label={t.definition} required={lang === "fr"}>
        <textarea id={`${base}-def`} required={lang === "fr"} minLength={3} maxLength={300} rows={2} value={value.definition[lang] ?? ""} onChange={(e) => setValue((v) => ({ ...v, definition: { ...v.definition, [lang]: e.target.value } }))} />
      </Field>
      <p className="actions">
        <Button type="button" variant="ghost" onClick={cancel}>
          {guideCopy[locale].write.close}
        </Button>
        <Button type="submit">{t.save}</Button>
      </p>
    </form>
  );
}

/* ---------- G5: the gallery ---------- */
export function GalleryPage({ locale }: { locale: Locale }) {
  const k = knowledgeCopy[locale];
  const t = k.gallery;
  const { data, reload } = useKnowledge("gallery", locale);
  const [adding, setAdding] = useState(false),
    [people, setPeople] = useState(false),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    [failed, setFailed] = useState("");
  async function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!data) return;
    const f = new FormData(e.currentTarget);
    const file = f.get("file");
    if (!(file instanceof File) || !file.size) return;
    setBusy(true);
    setFailed("");
    try {
      await post(data.organization_id, {
        action: "addImage",
        category: f.get("category"),
        conform: f.get("conform") ? f.get("conform") : null,
        alt: { fr: "", nl: "", en: "", [locale]: String(f.get("alt") ?? "") },
        caption: { [locale]: String(f.get("caption") ?? "") },
        peopleVisible: f.get("people") === "on",
        imageRights: f.get("rights") === "on",
        mediaType: file.type,
        data: await readFile(file),
      });
      setStatus(t.saved);
      setAdding(false);
      reload();
    } catch (err) {
      setFailed(failure(locale, (err as Error).message));
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    if (!data) return;
    try {
      await post(data.organization_id, { action: "deleteImage", id });
      reload();
    } catch (err) {
      setFailed(failure(locale, (err as Error).message));
    }
  }
  return (
    <main id="main" className="guide-page">
      <PageHeader title={k.sections.gallery.title} subtitle={k.sections.gallery.intro} crumbs={[...back(locale), { label: k.sections.gallery.title }]} crumbsLabel={guideCopy[locale].title} />
      <p role="status" className="sr-only">
        {status}
      </p>
      {failed && <p role="alert">{failed}</p>}
      {data?.can.manage && (
        <Card title={t.upload} labelledBy="gallery-upload" headingId="gallery-upload">
          {!adding ? (
            <Button type="button" variant="secondary" icon="plus" onClick={() => setAdding(true)}>
              {t.upload}
            </Button>
          ) : (
            <form className="stack" onSubmit={(e) => void upload(e)}>
              <Field id="gallery-file" label={t.file} required>
                <input id="gallery-file" name="file" type="file" required accept="image/png,image/jpeg,image/webp" />
              </Field>
              <Field id="gallery-category" label={t.category}>
                <select id="gallery-category" name="category" defaultValue="court">
                  {imageCategories.map((c) => (
                    <option key={c} value={c}>
                      {t.categories[c]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="gallery-conform" label={t.conform}>
                <select id="gallery-conform" name="conform" defaultValue="">
                  {(["", "yes", "no"] as const).map((c) => (
                    <option key={c} value={c}>
                      {t.conforms[c]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="gallery-alt" label={t.alt} help={t.altHelp} required>
                <input id="gallery-alt" name="alt" required minLength={5} maxLength={300} aria-describedby={describedBy("gallery-alt", true)} />
              </Field>
              <Field id="gallery-caption" label={t.caption}>
                <input id="gallery-caption" name="caption" maxLength={300} />
              </Field>
              <label className="check">
                <input type="checkbox" name="people" checked={people} onChange={(e) => setPeople(e.target.checked)} /> {t.people}
              </label>
              {people && (
                <label className="check">
                  <input type="checkbox" name="rights" required /> {t.rights}
                </label>
              )}
              <p className="actions">
                <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
                  {guideCopy[locale].write.close}
                </Button>
                <Button type="submit" loading={busy}>
                  {t.save}
                </Button>
              </p>
            </form>
          )}
        </Card>
      )}
      {!data ? null : !data.images.length ? (
        <EmptyState title={data.federation ? t.empty : guideCopy[locale].noFederation} />
      ) : (
        <ul className="guide-gallery">
          {data.images.map((img) => (
            <li key={img.id}>
              <figure>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/guide/image?id=${img.id}`} alt={t3(img.alt, locale)} loading="lazy" />
                <figcaption>
                  <Badge tone="neutral">{t.categories[img.category as keyof typeof t.categories]}</Badge>{" "}
                  {img.conform && <Badge tone={img.conform === "yes" ? "success" : "danger"}>{t.conforms[img.conform as "yes" | "no"]}</Badge>} {t3(img.caption as Text3, locale)}
                </figcaption>
              </figure>
              {data.can.manage && (
                <p className="small">
                  {fill(t.embed, { code: `[[image:${img.id}]]` })}{" "}
                  <Button type="button" size="sm" variant="ghost" onClick={() => void remove(img.id)}>
                    {t.remove}
                    <span className="sr-only"> : {t3(img.alt, locale)}</span>
                  </Button>
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

/* ---------- G4: the chair catalogue ---------- */
const euros = (l: Locale, cents: number) => new Intl.NumberFormat(l === "en" ? "en-GB" : `${l}-BE`, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(cents / 100);
export function ChairCatalogue({ locale }: { locale: Locale }) {
  const k = knowledgeCopy[locale];
  const { data } = useKnowledge("chairs", locale);
  return (
    <main id="main" className="guide-page">
      <PageHeader title={k.sections.chairs.title} subtitle={k.sections.chairs.intro} crumbs={[...back(locale), { label: k.sections.chairs.title }]} crumbsLabel={guideCopy[locale].title} />
      {!data ? null : !data.models.length ? (
        <EmptyState title={data.federation ? k.chairs.empty : guideCopy[locale].noFederation} />
      ) : (
        <ul className="guide-list guide-models">
          {data.models.map((m) => (
            <li key={m.id}>
              <Link href={`/${locale}/guide/chairs/${m.id}`} className="guide-item guide-model">
                {m.photo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/guide/image?kind=photo&id=${m.photo}`} alt={t3(m.photo_alt, locale)} loading="lazy" />
                )}
                <strong>{[m.brand, m.name].filter(Boolean).join(" ")}</strong>
                <span className="small muted">
                  {[m.manufacturer, m.speed_kmh ? `${Number(m.speed_kmh)} km/h` : "", m.price_cents !== null ? `${euros(locale, m.price_cents)} ${m.price_on ? fill(k.chairs.priceOn, { date: dayText(locale, m.price_on) }) : ""}` : ""].filter(Boolean).join(" · ")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

export function ChairModelPage({ locale, id }: { locale: Locale; id: string }) {
  const k = knowledgeCopy[locale];
  const t = k.chairs;
  const { data, missing, reload } = useKnowledge("chair", locale, id);
  const [editing, setEditing] = useState(false),
    [status, setStatus] = useState(""),
    [failed, setFailed] = useState("");
  if (missing)
    return (
      <main id="main">
        <EmptyState title={t.empty} action={<Link href={`/${locale}/guide/chairs`}>{t.back}</Link>} />
      </main>
    );
  const m = data?.model;
  if (!data || !m) return <main id="main" />;
  const s = m.sheet;
  async function act(body: Record<string, unknown>, done: string) {
    if (!data) return;
    setFailed("");
    try {
      await post(data.organization_id, body);
      setStatus(done);
      setEditing(false);
      reload();
    } catch (e) {
      setFailed(failure(locale, (e as Error).message));
    }
  }
  async function addPhoto(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const file = f.get("photo");
    if (!(file instanceof File) || !file.size || !m) return;
    try {
      await act({ action: "addPhoto", modelId: m.id, alt: { fr: "", nl: "", en: "", [locale]: String(f.get("alt") ?? "") }, mediaType: file.type, data: await readFile(file) }, t.saved);
    } catch (err) {
      setFailed(failure(locale, (err as Error).message));
    }
  }
  return (
    <main id="main" className="guide-page guide-chapter">
      <PageHeader title={m.title} crumbs={[...back(locale), { label: t.back, href: `/${locale}/guide/chairs` }, { label: m.title }]} crumbsLabel={guideCopy[locale].title} />
      <p role="status" className="sr-only">
        {status}
      </p>
      {failed && <p role="alert">{failed}</p>}
      {m.photos.length > 0 && (
        <ul className="guide-gallery" aria-label={t.photos}>
          {m.photos.map((ph) => (
            <li key={ph.id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/guide/image?kind=photo&id=${ph.id}`} alt={t3(ph.alt, locale)} loading="lazy" />
              {data.can.manage && (
                <Button type="button" size="sm" variant="ghost" onClick={() => void act({ action: "deletePhoto", id: ph.id }, t.saved)}>
                  {t.remove}
                  <span className="sr-only"> : {t3(ph.alt, locale)}</span>
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!s ? (
        <p className="muted">{t.noSheet}</p>
      ) : (
        <dl className="chair-facts guide-sheet">
          {s.manufacturer && (
            <>
              <dt>{t.manufacturer}</dt>
              <dd>{s.manufacturer}</dd>
            </>
          )}
          {s.price_cents !== null && (
            <>
              <dt>{t.price}</dt>
              <dd>
                {euros(locale, s.price_cents)} {s.price_on && fill(t.priceOn, { date: dayText(locale, s.price_on) })}
              </dd>
            </>
          )}
          {s.speed_kmh && (
            <>
              <dt>{t.speed}</dt>
              <dd>{Number(s.speed_kmh)} km/h</dd>
            </>
          )}
          {s.weight_kg && (
            <>
              <dt>{t.weight}</dt>
              <dd>{Number(s.weight_kg)} kg</dd>
            </>
          )}
          {(["protections", "strengths", "limits"] as const).map((key) =>
            t3(s[key] as Text3, locale) ? (
              <div key={key} className="guide-sheet-row">
                <dt>{t[key]}</dt>
                <dd className="pre-line">{t3(s[key] as Text3, locale)}</dd>
              </div>
            ) : null,
          )}
          {m.suppliers.length > 0 && (
            <>
              <dt>{t.suppliers}</dt>
              <dd>
                <ul className="plain-list">
                  {m.suppliers.map((c) => (
                    <li key={c.id}>
                      {[c.organization_name, c.full_name].filter(Boolean).join(" · ")} {c.email && <a href={`mailto:${c.email}`}>{c.email}</a>} {c.phone && <a href={`tel:${c.phone.replace(/\s/g, "")}`}>{c.phone}</a>}
                    </li>
                  ))}
                </ul>
              </dd>
            </>
          )}
        </dl>
      )}
      {s && <p className="small muted">{fill(t.updated, { date: dayText(locale, String(s.updated_at)) })}</p>}
      {data.can.manage && (
        <Card title={guideCopy[locale].write.title} labelledBy="model-write" headingId="model-write" className="no-print">
          <p className="actions">
            <Button type="button" variant="secondary" onClick={() => setEditing((v) => !v)} aria-expanded={editing}>
              {editing ? guideCopy[locale].write.close : t.edit}
            </Button>
          </p>
          {editing && <SheetEditor locale={locale} model={m} save={(b) => void act(b, t.saved)} />}
          <form className="stack" onSubmit={(e) => void addPhoto(e)}>
            <h3>{t.addPhoto}</h3>
            <Field id="model-photo" label={k.gallery.file} required>
              <input id="model-photo" name="photo" type="file" required accept="image/png,image/jpeg,image/webp" />
            </Field>
            <Field id="model-photo-alt" label={k.gallery.alt} help={k.gallery.altHelp} required>
              <input id="model-photo-alt" name="alt" required minLength={5} maxLength={300} aria-describedby={describedBy("model-photo-alt", true)} />
            </Field>
            <p className="actions">
              <Button type="submit" variant="secondary">
                {t.addPhoto}
              </Button>
            </p>
          </form>
        </Card>
      )}
    </main>
  );
}
type Model = NonNullable<View["model"]>;
function SheetEditor({ locale, model, save }: { locale: Locale; model: Model; save: (b: Record<string, unknown>) => void }) {
  const t = knowledgeCopy[locale].chairs;
  const s = model.sheet;
  const [lang, setLang] = useState<"fr" | "nl" | "en">(locale);
  const [texts, setTexts] = useState({ protections: (s?.protections ?? {}) as Partial<Text3>, strengths: (s?.strengths ?? {}) as Partial<Text3>, limits: (s?.limits ?? {}) as Partial<Text3> });
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const num = (k: string) => (String(f.get(k) ?? "").trim() ? Number(String(f.get(k)).replace(",", ".")) : null);
    const price = num("price");
    save({
      action: "saveSheet",
      modelId: model.id,
      manufacturer: f.get("manufacturer") ?? "",
      priceCents: price === null ? null : Math.round(price * 100),
      priceOn: f.get("priceOn") || null,
      speedKmh: num("speed"),
      weightKg: num("weight"),
      ...texts,
      suppliers: f.getAll("suppliers"),
    });
  }
  return (
    <form className="stack" onSubmit={submit}>
      <Field id="sheet-maker" label={t.manufacturer}>
        <input id="sheet-maker" name="manufacturer" maxLength={120} defaultValue={s?.manufacturer ?? ""} />
      </Field>
      <div className="form-grid">
        <Field id="sheet-price" label={`${t.price} (€)`}>
          <input id="sheet-price" name="price" inputMode="decimal" defaultValue={s?.price_cents !== null && s?.price_cents !== undefined ? String(s.price_cents / 100) : ""} />
        </Field>
        <Field id="sheet-price-on" label={fill(t.priceOn, { date: "" }).trim()}>
          <input id="sheet-price-on" name="priceOn" type="date" defaultValue={s?.price_on ?? ""} />
        </Field>
        <Field id="sheet-speed" label={`${t.speed} (km/h)`}>
          <input id="sheet-speed" name="speed" inputMode="decimal" defaultValue={s?.speed_kmh ?? ""} />
        </Field>
        <Field id="sheet-weight" label={`${t.weight} (kg)`}>
          <input id="sheet-weight" name="weight" inputMode="decimal" defaultValue={s?.weight_kg ?? ""} />
        </Field>
      </div>
      <Field id="sheet-lang" label={t.language}>
        <select id="sheet-lang" value={lang} onChange={(e) => setLang(e.target.value as "fr" | "nl" | "en")}>
          <option value="fr">Français</option>
          <option value="nl">Nederlands</option>
          <option value="en">English</option>
        </select>
      </Field>
      {(["protections", "strengths", "limits"] as const).map((key) => (
        <Field key={key} id={`sheet-${key}`} label={t[key]}>
          <textarea id={`sheet-${key}`} rows={3} maxLength={300} value={texts[key][lang] ?? ""} onChange={(e) => setTexts((v) => ({ ...v, [key]: { ...v[key], [lang]: e.target.value } }))} />
        </Field>
      ))}
      {model.contacts.length > 0 && (
        <fieldset>
          <legend>{t.suppliers}</legend>
          {model.contacts.map((c) => (
            <label className="check" key={c.id}>
              <input type="checkbox" name="suppliers" value={c.id} defaultChecked={model.suppliers.some((x) => x.id === c.id)} /> {[c.organization_name, c.full_name].filter(Boolean).join(" · ")}
            </label>
          ))}
        </fieldset>
      )}
      <p className="actions">
        <Button type="submit">{t.save}</Button>
      </p>
    </form>
  );
}

/* ---------- G7: the quiz under a rules chapter ---------- */
export function ChapterQuiz({ locale, quiz, chapterId, organizationId, passed }: { locale: Locale; quiz: QuizData; chapterId: string; organizationId: string; passed: boolean }) {
  const t = knowledgeCopy[locale].quiz;
  const [step, setStep] = useState(0),
    [choice, setChoice] = useState<number | null>(null),
    [checked, setChecked] = useState(false),
    [answers, setAnswers] = useState<number[]>([]),
    [result, setResult] = useState<{ passed: boolean; right: number } | null>(null),
    [failed, setFailed] = useState("");
  const q = quiz[step];
  const name = `quiz-${chapterId}-${step}`;
  async function finish(all: number[]) {
    try {
      const v = await post(organizationId, { action: "answerQuiz", chapterId, answers: all });
      setResult({ passed: !!v.passed, right: (v.right as boolean[]).filter(Boolean).length });
    } catch (e) {
      setFailed(failure(locale, (e as Error).message));
    }
  }
  function next() {
    const all = [...answers, choice ?? -1];
    setAnswers(all);
    setChoice(null);
    setChecked(false);
    if (step + 1 < quiz.length) setStep(step + 1);
    else void finish(all);
  }
  function retry() {
    setStep(0);
    setAnswers([]);
    setChoice(null);
    setChecked(false);
    setResult(null);
  }
  return (
    <section className="guide-quiz no-print" aria-labelledby={`quiz-${chapterId}`}>
      <h2 id={`quiz-${chapterId}`}>{t.title}</h2>
      <p className="muted">{t.intro}</p>
      {passed && !result && <p>{t.already}</p>}
      {failed && <p role="alert">{failed}</p>}
      {result ? (
        <div role="status">
          <p>
            <strong>{fill(result.passed ? t.passed : t.failed, { n: result.right, total: quiz.length })}</strong>
          </p>
          <Button type="button" variant="secondary" onClick={retry}>
            {t.retry}
          </Button>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!checked) setChecked(true);
            else next();
          }}
        >
          <fieldset>
            <legend>
              <span className="small muted">{fill(t.question, { n: step + 1, total: quiz.length })}</span>
              <br />
              {t3(q.question, locale)}
            </legend>
            {q.choices.map((c, i) => (
              <label className="check" key={i}>
                <input type="radio" name={name} value={i} checked={choice === i} disabled={checked} onChange={() => setChoice(i)} required /> {t3(c, locale)}
              </label>
            ))}
          </fieldset>
          {checked && (
            <p role="status" className={choice === q.answer ? "notice success" : "notice"}>
              <strong>{choice === q.answer ? t.right : t.wrong}</strong> {t3(q.explanation, locale)}
            </p>
          )}
          <p className="actions">
            <Button type="submit" disabled={choice === null}>
              {!checked ? t.check : step + 1 < quiz.length ? t.next : t.finish}
            </Button>
          </p>
        </form>
      )}
    </section>
  );
}

/* ---------- G10: the how-to sheets ---------- */
export function HelpIndex({ locale }: { locale: Locale }) {
  const t = knowledgeCopy[locale].help;
  const roles = Object.keys(t.roles) as HelpSheet["roles"];
  return (
    <main id="main" className="guide-page">
      <PageHeader title={t.title} subtitle={t.intro} crumbs={[...back(locale), { label: t.title }]} crumbsLabel={guideCopy[locale].title} />
      {roles.map((role) => {
        const sheets = helpSheets.filter((s) => s.roles.includes(role));
        if (!sheets.length) return null;
        return (
          <section key={role} aria-labelledby={`help-${role}`}>
            <h2 id={`help-${role}`}>{t.roles[role]}</h2>
            <ul className="plain-list link-list">
              {sheets.map((s) => (
                <li key={s.id}>
                  <Link href={`/${locale}/guide/help/${s.id}`}>{t3(s.title, locale)}</Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </main>
  );
}
export function HelpSheetPage({ locale, id, capture }: { locale: Locale; id: string; capture: boolean }) {
  const t = knowledgeCopy[locale].help;
  const s = helpSheets.find((x) => x.id === id);
  if (!s) return <main id="main" />;
  const title = t3(s.title, locale);
  return (
    <main id="main" className="guide-page guide-chapter">
      <PageHeader title={title} crumbs={[...back(locale), { label: t.back, href: `/${locale}/guide/help` }, { label: title }]} crumbsLabel={guideCopy[locale].title} actions={<Link className="button secondary" href={`/${locale}${s.route}`}>{t.open}</Link>} />
      <p className="small muted">{s.roles.map((r) => t.roles[r]).join(", ")}</p>
      <ol className="guide-steps">
        {s.steps.map((st, i) => (
          <li key={i}>{t3(st, locale)}</li>
        ))}
      </ol>
      {capture && (
        <figure className="guide-figure">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="guide-capture" src={`/help/${s.id}.png`} alt={fill(t.capture, { title })} loading="lazy" />
        </figure>
      )}
    </main>
  );
}

/** The federation's quiz editor: five questions, one language at a time (the others kept). */
const blankQuestion = (): QuizData[number] => ({
  question: { fr: "", nl: "", en: "" },
  choices: [0, 1, 2].map(() => ({ fr: "", nl: "", en: "" })),
  answer: 0,
  explanation: { fr: "", nl: "", en: "" },
});
export function QuizEditor({ locale, chapterId, organizationId, quiz, onSaved }: { locale: Locale; chapterId: string; organizationId: string; quiz: QuizData | null; onSaved: () => void }) {
  const t = knowledgeCopy[locale];
  const [lang, setLang] = useState<"fr" | "nl" | "en">(locale),
    [qs, setQs] = useState<QuizData>(() => quiz ?? [0, 1, 2, 3, 4].map(blankQuestion)),
    [failed, setFailed] = useState("");
  const set = (i: number, f: (q: QuizData[number]) => QuizData[number]) => setQs((all) => all.map((q, j) => (j === i ? f(q) : q)));
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFailed("");
    try {
      await post(organizationId, { action: "saveQuiz", chapterId, questions: qs });
      onSaved();
    } catch (err) {
      setFailed(failure(locale, (err as Error).message));
    }
  }
  const base = `quiz-edit-${chapterId}`;
  return (
    <form className="stack" onSubmit={(e) => void save(e)}>
      <h3>{t.quiz.title}</h3>
      {failed && <p role="alert">{failed}</p>}
      <Field id={`${base}-lang`} label={t.lexicon.language}>
        <select id={`${base}-lang`} value={lang} onChange={(e) => setLang(e.target.value as "fr" | "nl" | "en")}>
          <option value="fr">Français</option>
          <option value="nl">Nederlands</option>
          <option value="en">English</option>
        </select>
      </Field>
      {qs.map((q, i) => (
        <fieldset key={i}>
          <legend>{fill(t.quiz.question, { n: i + 1, total: qs.length })}</legend>
          <Field id={`${base}-${i}-q`} label={t.quiz.questionLabel} required={lang === "fr"}>
            <input id={`${base}-${i}-q`} required={lang === "fr"} maxLength={300} value={q.question[lang] ?? ""} onChange={(e) => set(i, (x) => ({ ...x, question: { ...x.question, [lang]: e.target.value } }))} />
          </Field>
          {q.choices.map((c, j) => (
            <div key={j} className="quiz-edit-choice">
              <input
                type="radio"
                name={`${base}-${i}-answer`}
                checked={q.answer === j}
                onChange={() => set(i, (x) => ({ ...x, answer: j }))}
                aria-label={fill(t.quiz.correct, { n: j + 1 })}
              />
              <input
                aria-label={`${fill(t.quiz.question, { n: i + 1, total: qs.length })} · ${fill(t.quiz.choice, { n: j + 1 })}`}
                required={lang === "fr"}
                maxLength={300}
                value={c[lang] ?? ""}
                onChange={(e) => set(i, (x) => ({ ...x, choices: x.choices.map((cc, k) => (k === j ? { ...cc, [lang]: e.target.value } : cc)) }))}
              />
            </div>
          ))}
          <Field id={`${base}-${i}-x`} label={t.quiz.explanation} required={lang === "fr"}>
            <input id={`${base}-${i}-x`} required={lang === "fr"} maxLength={300} value={q.explanation[lang] ?? ""} onChange={(e) => set(i, (x) => ({ ...x, explanation: { ...x.explanation, [lang]: e.target.value } }))} />
          </Field>
        </fieldset>
      ))}
      <p className="actions">
        <Button type="submit">{guideCopy[locale].write.save}</Button>
      </p>
    </form>
  );
}
