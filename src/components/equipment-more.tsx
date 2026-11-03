"use client";
import { useId, useState, type KeyboardEvent } from "react";
import type { Locale } from "@/lib/locale";
import { available } from "@/domains/equipment/schema";
import { equipmentMoreCopy } from "./equipment-more-copy";
import { Badge, Button, Card, EmptyState } from "./ui";
import { Modal } from "./modal";
import { dayOf, brusselsToday, type Send, type View } from "./chair-sheet";

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/**
 * 11: « Prêter » a chair or small material, to another club of the
 * federation or to a player of the club, from a row, a sheet or « Nouveau
 * prêt ». Handed over at once; « Noter le retour » ends it.
 */
export function LendDialog({ locale, view, initial, busy, send, close }: { locale: Locale; view: View; initial: { chairId?: string; itemId?: string }; busy: boolean; send: Send; close: () => void }) {
  const t = equipmentMoreCopy[locale];
  const today = brusselsToday();
  const [what, setWhat] = useState<"chair" | "item">(initial.itemId ? "item" : "chair"),
    [chairId, setChair] = useState(initial.chairId ?? ""),
    [itemId, setItem] = useState(initial.itemId ?? ""),
    [to, setTo] = useState<"club" | "player">(view.partners.length ? "club" : "player");
  const items = view.items.filter((i) => !i.archived);
  const item = items.find((i) => i.id === itemId);
  const left = item ? available(item.quantity, item.lent ?? 0) : 0;
  return (
    <Modal title={t.lendTitle} close={close}>
      <form
        className="stack-form"
        onSubmit={(e) => {
          e.preventDefault();
          const d = new FormData(e.currentTarget);
          void send({
            action: "lendDirect",
            ...(what === "chair" ? { chairId } : { itemId, quantity: Number(d.get("quantity") || 1) }),
            ...(to === "club" ? { borrowerId: String(d.get("club")) } : { profileId: String(d.get("player")) }),
            startsOn: String(d.get("starts")),
            endsOn: String(d.get("ends")),
            conditions: String(d.get("conditions") ?? ""),
          }).then((r) => r && close());
        }}
      >
        <fieldset className="choice-row">
          <legend>{t.what}</legend>
          <label className="check">
            <input type="radio" name="what" checked={what === "chair"} onChange={() => setWhat("chair")} />
            {t.aChair}
          </label>
          <label className="check">
            <input type="radio" name="what" checked={what === "item"} onChange={() => setWhat("item")} disabled={!items.length} />
            {t.anItem}
          </label>
        </fieldset>
        {what === "chair" ? (
          <label>
            {t.chair}
            <select value={chairId} required onChange={(e) => setChair(e.target.value)}>
              <option value="">…</option>
              {view.chairs
                .filter((c) => c.status !== "retired")
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label ?? c.name}
                  </option>
                ))}
            </select>
          </label>
        ) : (
          <div className="form-grid">
            <label>
              {t.item}
              <select value={itemId} required onChange={(e) => setItem(e.target.value)}>
                <option value="">…</option>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} · {t.availableOf(available(i.quantity, i.lent ?? 0))}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t.quantity}
              <input name="quantity" type="number" min={1} max={Math.max(1, left)} required defaultValue={1} />
            </label>
          </div>
        )}
        <fieldset className="choice-row">
          <legend>{t.to}</legend>
          {view.partners.length > 0 && (
            <label className="check">
              <input type="radio" name="to" checked={to === "club"} onChange={() => setTo("club")} />
              {t.aClub}
            </label>
          )}
          <label className="check">
            <input type="radio" name="to" checked={to === "player"} onChange={() => setTo("player")} />
            {t.aPlayer}
          </label>
        </fieldset>
        {to === "club" ? (
          <label>
            {t.club}
            <select name="club" required defaultValue="">
              <option value="">…</option>
              {view.partners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label>
            {t.player}
            <select name="player" required defaultValue="">
              <option value="">…</option>
              {(view.players as { id: string; full_name: string }[]).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="form-grid">
          <label>
            {t.starts}
            <input type="date" name="starts" required defaultValue={today} />
          </label>
          <label>
            {t.ends}
            <input type="date" name="ends" required min={today} />
          </label>
        </div>
        <label>
          {t.conditions}
          <input name="conditions" maxLength={1000} />
        </label>
        <Button type="submit" disabled={busy}>
          {t.lendSubmit}
        </Button>
      </form>
    </Modal>
  );
}

/** The loans of small material and to the players, in the « Prêts » tab, with « Nouveau prêt ». */
export function DirectLoans({ locale, view, busy, send }: { locale: Locale; view: View; busy: boolean; send: Send }) {
  const t = equipmentMoreCopy[locale];
  const [lending, setLending] = useState(false);
  if (!view.manage) return null;
  return (
    <Card
      title={t.directTitle}
      labelledBy="loans-direct"
      headingId="loans-direct"
      actions={
        <Button icon="plus" onClick={() => setLending(true)}>
          {t.newLoan}
        </Button>
      }
    >
      {view.directLoans.length ? (
        <div className="table-scroll" role="region" aria-label={t.directTitle} tabIndex={0}>
          <table className="ledger">
            <thead>
              <tr>
                <th scope="col">{t.cols.what}</th>
                <th scope="col">{t.cols.to}</th>
                <th scope="col">{t.cols.dates}</th>
                <th scope="col">{t.cols.status}</th>
              </tr>
            </thead>
            <tbody>
              {view.directLoans.map((l) => {
                const name = l.chair ?? (l.quantity > 1 ? `${l.quantity} × ${l.item}` : (l.item ?? ""));
                return (
                  <tr key={l.id}>
                    <th scope="row">{name}</th>
                    <td>{l.borrower}</td>
                    <td>{t.range(dayOf(locale, l.starts_on), dayOf(locale, l.ends_on))}</td>
                    <td>
                      {l.status === "ongoing" ? (
                        <>
                          <Badge tone="warning">{t.ongoing}</Badge>{" "}
                          <Button size="sm" variant="secondary" disabled={busy} aria-label={t.giveBackOf(name)} onClick={() => void send({ action: "returnDirect", id: l.id, condition: "" })}>
                            {t.giveBack}
                          </Button>
                        </>
                      ) : (
                        <Badge tone="success">{t.returned}</Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title={t.directEmpty} />
      )}
      {lending && <LendDialog locale={locale} view={view} initial={{}} busy={busy} send={send} close={() => setLending(false)} />}
    </Card>
  );
}

/** The category of an item: one of the club's, or « + Créer « ‹texte› » » typed in the field. */
export function CategoryPicker({ locale, view, initial, send }: { locale: Locale; view: View; initial: string | null; send: Send }) {
  const t = equipmentMoreCopy[locale];
  const id = useId();
  const list = view.categories.filter((g) => !g.archived || g.id === initial);
  const [chosen, setChosen] = useState<string>(initial ?? list.find((g) => g.system_key === "other")?.id ?? ""),
    [text, setText] = useState(list.find((g) => g.id === (initial ?? ""))?.name ?? list.find((g) => g.system_key === "other")?.name ?? ""),
    [open, setOpen] = useState(false),
    [active, setActive] = useState(0),
    [created, setCreated] = useState<{ id: string; name: string }[]>([]);
  const all = [...list.map((g) => ({ id: g.id, name: g.name })), ...created];
  const typed = text.trim();
  const matches = all.filter((g) => !typed || fold(g.name).includes(fold(typed))).slice(0, 8);
  const exact = all.some((g) => fold(g.name) === fold(typed));
  const options = [...matches.map((g) => ({ ...g, create: false })), ...(typed && !exact ? [{ id: "", name: typed, create: true }] : [])];
  async function pick(o: (typeof options)[number]) {
    setOpen(false);
    if (!o.create) {
      setChosen(o.id);
      setText(o.name);
      return;
    }
    const r = await send({ action: "categoryCreate", name: o.name });
    if (r) {
      setCreated((c) => [...c, { id: r.id, name: o.name }]);
      setChosen(r.id);
      setText(o.name);
    }
  }
  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(options.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter" && open && options[active]) {
      e.preventDefault();
      void pick(options[active]);
    } else if (e.key === "Escape") setOpen(false);
  }
  return (
    <div className="tag-picker">
      <input type="hidden" name="categoryId" value={chosen} />
      <label htmlFor={`${id}-input`}>{t.category}</label>
      <input
        id={`${id}-input`}
        role="combobox"
        aria-expanded={open && options.length > 0}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={open && options[active] ? `${id}-o${active}` : undefined}
        aria-describedby={`${id}-hint`}
        value={text}
        maxLength={60}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKey}
      />
      <p id={`${id}-hint`} className="muted small">
        {t.categoryHint}
      </p>
      <ul id={`${id}-list`} role="listbox" aria-label={t.category} className="tag-options" hidden={!open || !options.length}>
        {options.map((o, i) => (
          <li
            key={o.create ? "new" : o.id}
            id={`${id}-o${i}`}
            role="option"
            aria-selected={i === active}
            className={i === active ? "tag-option is-active" : "tag-option"}
            onMouseDown={(e) => {
              e.preventDefault();
              void pick(o);
            }}
          >
            {o.create ? t.createCategory(o.name) : o.name}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One category: rename, merge into another, archive (never a system one). */
function CategoryRow({ locale, g, others, busy, send }: { locale: Locale; g: View["categories"][number]; others: View["categories"]; busy: boolean; send: Send }) {
  const t = equipmentMoreCopy[locale];
  const [name, setName] = useState(g.name),
    [into, setInto] = useState("");
  return (
    <li className="exercise-tag-row">
      <strong>{g.name}</strong>
      {g.system_key && <Badge>{t.system}</Badge>}
      {g.archived && <Badge tone="warning">{t.archivedCat}</Badge>}
      <span className="muted small">{t.itemsCount(g.items)}</span>
      <form
        className="exercise-tag-form"
        onSubmit={(e) => {
          e.preventDefault();
          void send({ action: "categoryRename", id: g.id, name: name.trim() });
        }}
      >
        <input aria-label={t.nameOf(g.name)} value={name} required maxLength={60} onChange={(e) => setName(e.target.value)} />
        <Button type="submit" size="sm" variant="secondary" disabled={busy || !name.trim() || name.trim() === g.name}>
          {t.rename}
        </Button>
      </form>
      {!g.system_key && (
        <>
          <form
            className="exercise-tag-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (into) void send({ action: "categoryMerge", id: g.id, into });
            }}
          >
            <select aria-label={t.mergeInto(g.name)} value={into} onChange={(e) => setInto(e.target.value)}>
              <option value="">{t.mergeInto(g.name)}…</option>
              {others.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
            <Button type="submit" size="sm" variant="secondary" disabled={busy || !into}>
              {t.merge}
            </Button>
          </form>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void send({ action: "categoryArchive", id: g.id, archived: !g.archived })}>
            {g.archived ? t.restore : t.archive}
          </Button>
        </>
      )}
    </li>
  );
}
/** 11: the club's categories (Matériel and Réglages › Activités). */
export function CategoriesCard({ locale, view, busy, send }: { locale: Locale; view: View; busy: boolean; send: Send }) {
  const t = equipmentMoreCopy[locale];
  if (!view.manage || !view.categories.length) return null;
  return (
    <Card title={t.categories} subtitle={t.categoriesIntro} labelledBy="equipment-categories" headingId="equipment-categories">
      <ul className="exercise-tag-rows">
        {view.categories.map((g) => (
          <CategoryRow key={`${g.id}-${g.name}-${g.archived}`} locale={locale} g={g} others={view.categories.filter((o) => o.id !== g.id && !o.archived)} busy={busy} send={send} />
        ))}
      </ul>
    </Card>
  );
}
