"use client";
import { useCallback, useEffect, useState, type DragEvent, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";
import type { documentDrive } from "@/domains/documents/service";
import { categories, folderVisibilities, offeredCategories, retiredCategories } from "@/domains/documents/schema";
import { categoryLabels, documentCopy, documentStatuses } from "./documents-copy";
import { driveCopy } from "./drive-copy";
import { errors } from "./access-copy";
import { Badge, Button, EmptyState, Segmented } from "./ui";
import { Modal } from "./modal";

type View = Awaited<ReturnType<typeof documentDrive>>;
type Doc = View["documents"][number];
/** Where one is in the drive: the root, a type, the club's documents or a free folder, and a season. */
type Place = { area: "root" } | { area: "type"; category: string; seasonId?: string } | { area: "club"; seasonId?: string } | { area: "folder"; id: string };
type Drop = { category: string; seasonId: string; folderId: string | null; profile: boolean; file: File | null };
const tag = (l: Locale) => (l === "en" ? "en-GB" : `${l}-BE`);
const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/** Where a document lives: its free folder, else the club's documents, else its type. */
const homeOf = (d: Doc) => (d.folder_id ? "folder" : d.profile_id ? "type" : "club");
const pending = (d: Doc) => d.status === "uploaded" || d.status === "review";
const expired = (d: Doc, today: string) => d.status === "expired" || (!!d.expires_on && d.expires_on < today);

/** A folder tile: name, number of files, what needs a look. */
function Tile({ name, docs, today, onOpen, onDrop, label }: { name: string; docs: Doc[]; today: string; onOpen: () => void; onDrop?: (id: string) => void; label: (typeof driveCopy)["fr"] }) {
  const [over, setOver] = useState(false);
  const check = docs.filter(pending).length,
    late = docs.filter((d) => expired(d, today)).length;
  return (
    <li>
      <button
        type="button"
        className={over ? "drive-folder is-over" : "drive-folder"}
        aria-label={`${label.open(name)}, ${label.files(docs.length)}`}
        onClick={onOpen}
        onDragOver={(e) => {
          if (onDrop && e.dataTransfer.types.includes("application/x-document")) {
            e.preventDefault();
            setOver(true);
          }
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          setOver(false);
          const id = e.dataTransfer.getData("application/x-document");
          if (onDrop && id) {
            e.preventDefault();
            onDrop(id);
          }
        }}
      >
        <span className="drive-folder-icon" aria-hidden="true" />
        <strong>{name}</strong>
        <span className="muted small">{label.files(docs.length)}</span>
        <span className="exercise-badges">
          {check > 0 && <Badge tone="warning">{label.toCheck(check)}</Badge>}
          {late > 0 && <Badge tone="danger">{label.expired(late)}</Badge>}
        </span>
      </button>
    </li>
  );
}

/**
 * 10: Documents as a « drive ». A folder per type and one for the club's
 * own documents, sub-folders by season (the latest first), the free folders
 * of the club with their visibility; breadcrumb, list or thumbnails, global
 * search, « Déplacer vers… » (keyboard) or drag, and a file dropped in a
 * folder comes with its type and season already filled in. A folder is a
 * view: the server filters every document by the same rights as the list.
 */
export function DocumentsDrive({ locale, onDetails }: { locale: Locale; onDetails: (name: string) => void }) {
  const t = driveCopy[locale],
    dc = documentCopy[locale];
  const cl = categoryLabels[locale] as Record<string, string>,
    sl = documentStatuses[locale] as Record<string, string>;
  const [data, setData] = useState<View | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [place, setPlace] = useState<Place>({ area: "root" }),
    [layout, setLayout] = useState<"grid" | "list">("list"),
    [query, setQuery] = useState(""),
    [folderForm, setFolderForm] = useState<{ id?: string; parentId: string | null; name: string; visibility: string } | null>(null),
    [drop, setDrop] = useState<Drop | null>(null),
    [moving, setMoving] = useState<Record<string, string>>({});
  const load = useCallback(
    () =>
      fetch("/api/documents/drive", { cache: "no-store" })
        .then(async (r) => {
          const v = await r.json();
          if (!r.ok) throw new Error(v.error);
          setData(v);
        })
        .catch((e: Error) => setError(errors[e.message]?.[locale] ?? t.failed)),
    [locale, t.failed],
  );
  useEffect(() => {
    void load();
  }, [load]);
  async function post(body: Record<string, unknown>) {
    const r = await fetch("/api/documents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, organizationId: data?.organization_id }) });
    const v = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(v.error ?? "UNAVAILABLE");
    return v as { id: string };
  }
  async function run(fn: () => Promise<string>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      setMessage(await fn());
      await load();
    } catch (e) {
      const code = (e as Error).message;
      setError(code === "FOLDER_NOT_EMPTY" ? t.notEmpty : (errors[code]?.[locale] ?? t.failed));
    } finally {
      setBusy(false);
    }
  }
  if (!data) return <p role={error ? "alert" : "status"}>{error || t.loading}</p>;
  const today = data.today;
  const docs = data.documents;
  const folders = data.folders;
  const folderName = (id: string) => folders.find((f) => f.id === id)?.name ?? "";
  const shownCategories = categories.filter((c) => !retiredCategories.includes(c) || docs.some((d) => d.category === c && homeOf(d) === "type"));
  const seasonsOf = (list: Doc[]) => [...new Map(list.map((d) => [d.season_id, { id: d.season_id, name: d.season_name, start: d.season_start }])).values()].sort((a, b) => b.start.localeCompare(a.start));
  const inType = (c: string) => docs.filter((d) => homeOf(d) === "type" && d.category === c);
  const inClub = docs.filter((d) => homeOf(d) === "club");
  const inFolder = (id: string) => docs.filter((d) => d.folder_id === id);
  const move = (id: string, folderId: string | null) =>
    void run(async () => {
      await post({ action: "move", id, folderId });
      return t.moved;
    });

  /* The breadcrumb: Documents › Assurance › 2026-2027, or the chain of free folders. */
  const crumbs: { label: string; to: Place }[] = [{ label: t.root, to: { area: "root" } }];
  if (place.area === "type") {
    crumbs.push({ label: cl[place.category] ?? place.category, to: { area: "type", category: place.category } });
    if (place.seasonId) crumbs.push({ label: docs.find((d) => d.season_id === place.seasonId)?.season_name ?? "", to: place });
  } else if (place.area === "club") {
    crumbs.push({ label: t.club, to: { area: "club" } });
    if (place.seasonId) crumbs.push({ label: docs.find((d) => d.season_id === place.seasonId)?.season_name ?? "", to: place });
  } else if (place.area === "folder") {
    const chain: typeof folders = [];
    for (let f = folders.find((x) => x.id === place.id); f; f = f.parent_id ? folders.find((x) => x.id === f!.parent_id) : undefined) chain.unshift(f);
    for (const f of chain) crumbs.push({ label: f.name, to: { area: "folder", id: f.id } });
  }

  /* The files of the current place, or of the search. */
  const searching = query.trim().length > 0;
  const files: Doc[] = searching
    ? docs.filter((d) => fold(`${d.name} ${d.owner_name ?? ""} ${cl[d.category] ?? ""} ${d.season_name}`).includes(fold(query)))
    : place.area === "type" && place.seasonId
      ? inType(place.category).filter((d) => d.season_id === place.seasonId)
      : place.area === "club" && place.seasonId
        ? inClub.filter((d) => d.season_id === place.seasonId)
        : place.area === "folder"
          ? inFolder(place.id)
          : [];
  const dropTarget: Drop | null = !data.manage
    ? null
    : place.area === "type" && place.seasonId
      ? { category: place.category, seasonId: place.seasonId, folderId: null, profile: true, file: null }
      : place.area === "club" && place.seasonId
        ? { category: "contract", seasonId: place.seasonId, folderId: null, profile: false, file: null }
        : place.area === "folder" && data.seasons[0]
          ? { category: "contract", seasonId: data.seasons[0].id, folderId: place.id, profile: false, file: null }
          : null;
  function onFileDrop(e: DragEvent<HTMLElement>) {
    if (!dropTarget) return;
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    e.preventDefault();
    setDrop({ ...dropTarget, file });
  }
  async function addDocument(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!drop) return;
    const f = new FormData(e.currentTarget);
    const file = f.get("file");
    await run(async () => {
      const category = String(f.get("category"));
      const { id } = await post({
        action: "request",
        name: String(f.get("name") ?? "").trim(),
        category,
        seasonId: String(f.get("season")),
        sensitive: f.has("sensitive") || category === "fitness",
        ...(f.get("profile") ? { profileId: String(f.get("profile")) } : {}),
        ...(drop.folderId ? { folderId: drop.folderId } : {}),
      });
      if (file instanceof File && file.size) {
        const body = new FormData();
        body.set("file", file);
        body.set("version", "1");
        body.set("organizationId", data!.organization_id);
        const r = await fetch(`/api/documents/file/${id}`, { method: "POST", body });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "INVALID_FILE");
      }
      setDrop(null);
      return t.added;
    });
  }
  const childFolders = (parent: string | null) => folders.filter((f) => f.parent_id === parent);
  const moveTargets = folders.map((f) => ({ id: f.id, name: f.name }));

  return (
    <div className="drive">
      {error && !drop && !folderForm && <p role="alert">{error}</p>}
      <p role="status" className="sr-only">
        {message}
      </p>
      <div className="drive-bar">
        <label className="compact-field drive-search">
          {t.search}
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        {(searching || files.length > 0) && (
          <Segmented
            label={t.view}
            value={layout}
            onChange={(v) => setLayout(v === "grid" ? "grid" : "list")}
            items={[
              { id: "list", label: t.list },
              { id: "grid", label: t.grid },
            ]}
          />
        )}
      </div>
      {!searching && (
        <nav aria-label={t.breadcrumb} className="drive-crumbs">
          <ol>
            {crumbs.map((c, i) => (
              <li key={i}>
                {i === crumbs.length - 1 ? (
                  <span aria-current="page">{c.label}</span>
                ) : (
                  <button type="button" className="text-button" onClick={() => setPlace(c.to)}>
                    {c.label}
                  </button>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}
      {searching && <p className="muted">{t.results(files.length)}</p>}

      {/* The folders of the current place. */}
      {!searching && place.area === "root" && (
        <>
          <ul className="drive-grid">
            {shownCategories.map((c) => (
              <Tile key={c} name={cl[c] ?? c} docs={inType(c)} today={today} label={t} onOpen={() => setPlace({ area: "type", category: c })} />
            ))}
            <Tile name={t.club} docs={inClub} today={today} label={t} onOpen={() => setPlace({ area: "club" })} onDrop={data.manage ? (id) => move(id, null) : undefined} />
          </ul>
          {(childFolders(null).length > 0 || data.manage) && <h3>{t.freeFolders}</h3>}
          <ul className="drive-grid">
            {childFolders(null).map((f) => (
              <Tile key={f.id} name={f.name} docs={inFolder(f.id)} today={today} label={t} onOpen={() => setPlace({ area: "folder", id: f.id })} onDrop={data.manage ? (id) => move(id, f.id) : undefined} />
            ))}
          </ul>
        </>
      )}
      {!searching && (place.area === "type" || place.area === "club") && !place.seasonId && (
        <ul className="drive-grid">
          {seasonsOf(place.area === "type" ? inType(place.category) : inClub).map((s) => (
            <Tile
              key={s.id}
              name={s.name}
              docs={(place.area === "type" ? inType(place.category) : inClub).filter((d) => d.season_id === s.id)}
              today={today}
              label={t}
              onOpen={() => setPlace(place.area === "type" ? { area: "type", category: place.category, seasonId: s.id } : { area: "club", seasonId: s.id })}
            />
          ))}
          {data.manage &&
            data.seasons
              .filter((s) => !(place.area === "type" ? inType(place.category) : inClub).some((d) => d.season_id === s.id))
              .slice(0, 1)
              .map((s) => (
                <Tile
                  key={s.id}
                  name={s.name}
                  docs={[]}
                  today={today}
                  label={t}
                  onOpen={() => setPlace(place.area === "type" ? { area: "type", category: place.category, seasonId: s.id } : { area: "club", seasonId: s.id })}
                />
              ))}
        </ul>
      )}
      {!searching && place.area === "folder" && childFolders(place.id).length > 0 && (
        <ul className="drive-grid">
          {childFolders(place.id).map((f) => (
            <Tile key={f.id} name={f.name} docs={inFolder(f.id)} today={today} label={t} onOpen={() => setPlace({ area: "folder", id: f.id })} onDrop={data.manage ? (id) => move(id, f.id) : undefined} />
          ))}
        </ul>
      )}

      {/* Managing the free folders. */}
      {!searching && data.manage && (place.area === "root" || place.area === "folder") && (
        <p className="exercise-actions">
          <Button variant="secondary" icon="plus" onClick={() => setFolderForm({ parentId: place.area === "folder" ? place.id : null, name: "", visibility: "presidency" })}>
            {place.area === "folder" ? t.newSubfolder : t.newFolder}
          </Button>
          {place.area === "folder" && (
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  const f = folders.find((x) => x.id === place.id)!;
                  setFolderForm({ id: f.id, parentId: f.parent_id, name: f.name, visibility: f.visibility });
                }}
              >
                {t.editFolder}
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const parent = folders.find((x) => x.id === place.id)?.parent_id ?? null;
                    await post({ action: "folderDelete", id: place.id });
                    setPlace(parent ? { area: "folder", id: parent } : { area: "root" });
                    return t.saved;
                  })
                }
              >
                {t.deleteFolder}
              </Button>
            </>
          )}
        </p>
      )}

      {/* The files, where a file may also be dropped. */}
      {(searching || place.area === "folder" || ((place.area === "type" || place.area === "club") && place.seasonId)) && (
        <section className={dropTarget ? "drive-files drive-drop" : "drive-files"} onDragOver={(e) => dropTarget && e.dataTransfer.types.includes("Files") && e.preventDefault()} onDrop={onFileDrop}>
          {dropTarget && !searching && (
            <p className="drive-drop-hint">
              <span className="muted small">{t.drop}</span>
              <Button size="sm" variant="secondary" icon="plus" onClick={() => setDrop(dropTarget)}>
                {t.dropButton}
              </Button>
            </p>
          )}
          {!files.length ? (
            !searching && place.area !== "folder" ? <EmptyState icon="document" title={t.empty} /> : !childFolders(place.area === "folder" ? place.id : null).length || searching ? <p className="muted">{t.empty}</p> : null
          ) : layout === "list" ? (
            <div className="table-wrap">
              <table className="data-table drive-table">
                <thead>
                  <tr>
                    <th scope="col">{t.columns.name}</th>
                    <th scope="col">{t.columns.owner}</th>
                    <th scope="col">{t.columns.status}</th>
                    <th scope="col">{t.columns.expires}</th>
                    {searching && <th scope="col">{t.columns.season}</th>}
                    {data.manage && <th scope="col">{t.moveTo}</th>}
                  </tr>
                </thead>
                <tbody>
                  {files.map((d) => (
                    <tr
                      key={d.id}
                      draggable={data.manage}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("application/x-document", d.id);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                    >
                      <th scope="row">
                        {d.current_version_id ? <a href={`/api/documents/file/${d.current_version_id}?organizationId=${data.organization_id}`} aria-label={t.download(d.name)}>{d.name}</a> : d.name}{" "}
                        <button type="button" className="text-button small" onClick={() => onDetails(d.name)}>
                          {t.details}
                        </button>
                      </th>
                      <td>{d.owner_name ?? t.club_owner}</td>
                      <td>
                        <Badge tone={d.status === "valid" ? "success" : expired(d, today) || d.status === "refused" ? "danger" : pending(d) ? "warning" : "neutral"}>{sl[d.status] ?? d.status}</Badge>
                        {d.sensitive && <span className="sr-only">{dc.sensitiveHint}</span>}
                      </td>
                      <td>{d.expires_on ? new Intl.DateTimeFormat(tag(locale), { dateStyle: "medium", timeZone: "UTC" }).format(new Date(d.expires_on + "T12:00:00Z")) : ""}</td>
                      {searching && <td>{d.season_name}</td>}
                      {data.manage && (
                        <td>
                          <span className="drive-move">
                            <select aria-label={t.move(d.name)} value={moving[d.id] ?? d.folder_id ?? ""} onChange={(e) => setMoving((m) => ({ ...m, [d.id]: e.target.value }))}>
                              <option value="">{t.noFolder}</option>
                              {moveTargets.map((f) => (
                                <option key={f.id} value={f.id}>
                                  {f.name}
                                </option>
                              ))}
                            </select>
                            <Button size="sm" variant="secondary" disabled={busy || (moving[d.id] ?? d.folder_id ?? "") === (d.folder_id ?? "")} onClick={() => move(d.id, moving[d.id] || null)}>
                              {t.moveHere}
                            </Button>
                          </span>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <ul className="drive-thumbs">
              {files.map((d) => (
                <li key={d.id} className="card drive-thumb">
                  <span className="drive-file-icon" aria-hidden="true" />
                  {d.current_version_id ? <a href={`/api/documents/file/${d.current_version_id}?organizationId=${data.organization_id}`} aria-label={t.download(d.name)}>{d.name}</a> : <strong>{d.name}</strong>}
                  <span className="muted small">{d.owner_name ?? t.club_owner}</span>
                  <Badge tone={d.status === "valid" ? "success" : expired(d, today) ? "danger" : pending(d) ? "warning" : "neutral"}>{sl[d.status] ?? d.status}</Badge>
                  {d.folder_id && searching && <span className="muted small">{folderName(d.folder_id)}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {folderForm && (
        <Modal title={folderForm.id ? t.editFolder : place.area === "folder" ? t.newSubfolder : t.newFolder} close={() => setFolderForm(null)}>
          {error && <p role="alert">{error}</p>}
          <form
            className="federation-form"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await post({ action: "folderSave", ...(folderForm.id ? { id: folderForm.id } : {}), parentId: folderForm.parentId, name: folderForm.name.trim(), visibility: folderForm.visibility });
                setFolderForm(null);
                return t.saved;
              });
            }}
          >
            <label>
              {t.folderName}
              <input value={folderForm.name} required maxLength={80} onChange={(e) => setFolderForm({ ...folderForm, name: e.target.value })} />
            </label>
            <label>
              {t.visibility}
              <select value={folderForm.visibility} onChange={(e) => setFolderForm({ ...folderForm, visibility: e.target.value })} aria-describedby="drive-visibility-hint">
                {folderVisibilities.map((v) => (
                  <option key={v} value={v}>
                    {t.visibilities[v]}
                  </option>
                ))}
              </select>
            </label>
            <p className="muted small" id="drive-visibility-hint">
              {t.visibilityHint}
            </p>
            <Button type="submit" disabled={busy}>
              {folderForm.id ? t.saveFolder : t.createFolder}
            </Button>
          </form>
        </Modal>
      )}
      {drop && (
        <Modal title={t.dropTitle} close={() => setDrop(null)}>
          {error && <p role="alert">{error}</p>}
          <form className="federation-form" onSubmit={(e) => void addDocument(e)}>
            <label>
              {t.docName}
              <input name="name" required minLength={2} maxLength={120} defaultValue={drop.file ? drop.file.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 120) : ""} />
            </label>
            <div className="form-pair">
              <label>
                {t.category}
                <select name="category" defaultValue={drop.category}>
                  {offeredCategories.map((c) => (
                    <option key={c} value={c}>
                      {cl[c] ?? c}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t.season}
                <select name="season" defaultValue={drop.seasonId}>
                  {data.seasons.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {drop.profile && (
              <label>
                {t.owner}
                <select name="profile" defaultValue="">
                  <option value="">{t.club_owner}</option>
                  {data.profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {data.sensitiveGrant && (
              <label className="check">
                <input type="checkbox" name="sensitive" />
                {t.sensitive}
              </label>
            )}
            {drop.file ? (
              <DroppedFile file={drop.file} label={t.file} />
            ) : (
              <label>
                {t.file}
                <input name="file" type="file" accept="application/pdf,image/png,image/jpeg" />
              </label>
            )}
            <Button type="submit" disabled={busy}>
              {t.add}
            </Button>
          </form>
        </Modal>
      )}
    </div>
  );
}
/** The file dropped on the folder, carried by the form. */
function DroppedFile({ file, label }: { file: File; label: string }) {
  return (
    <p>
      <strong>{label}</strong> : {file.name}
      <input
        type="file"
        name="file"
        hidden
        ref={(el) => {
          if (el && !el.files?.length) {
            const list = new DataTransfer();
            list.items.add(file);
            el.files = list.files;
          }
        }}
      />
    </p>
  );
}
