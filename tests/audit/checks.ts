/**
 * Audit 23: the display checks, run inside the page (no framework, plain
 * DOM). Each finding marks its element with data-audit-id so the test can
 * take a cropped picture of it. Kept free of imports: the function is
 * serialised by Playwright.
 */
export type Finding = { rule: string; target: string; detail: string; mark: number | null };

export function displayChecks(start: number): Finding[] {
  const found: Finding[] = [];
  let mark = start;
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect(),
      s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && !el.closest("[hidden],[inert],.sr-only,[aria-hidden='true']");
  };
  // A short, stable path: up to three levels of tag, id or first class.
  const pathOf = (el: Element) => {
    const parts: string[] = [];
    for (let e: Element | null = el, i = 0; e && i < 3 && e !== document.body; e = e.parentElement, i++) {
      const id = e.id && !/\d{3,}|:/.test(e.id) ? `#${e.id}` : "";
      const cls = [...e.classList].filter((c) => !/^(is-|has-)|\d/.test(c))[0];
      parts.unshift(e.tagName.toLowerCase() + (id || (cls ? `.${cls}` : "")));
      if (id) break;
    }
    return parts.join(" > ");
  };
  const add = (rule: string, el: Element | null, detail: string) => {
    let m: number | null = null;
    if (el) {
      m = mark++;
      el.setAttribute("data-audit-id", String(m));
    }
    found.push({ rule, target: el ? pathOf(el) : "page", detail, mark: m });
  };
  const main = document.querySelector("main") ?? document.body;

  // 1. Horizontal scroll of the page.
  const doc = document.scrollingElement ?? document.documentElement;
  if (doc.scrollWidth > doc.clientWidth + 1) {
    // The widest culprit: an element reaching past the right edge.
    let culprit: Element | null = null;
    for (const el of main.querySelectorAll("*")) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.right > doc.clientWidth + 1 && !el.closest(".table-scroll,[role=region],pre,code") && (!culprit || r.right > culprit.getBoundingClientRect().right)) culprit = el;
    }
    add("horizontal-scroll", culprit, `${doc.scrollWidth} px for ${doc.clientWidth} px`);
  }

  // 2. Text running out of its box.
  for (const el of main.querySelectorAll("button,a,label,th,td,h1,h2,h3,h4,p,li,.badge,.chip,summary,legend,dt,dd")) {
    if (!visible(el) || el.closest(".table-scroll,[role=region]")) continue;
    const s = getComputedStyle(el);
    if (s.overflowX !== "visible" || s.textOverflow === "ellipsis") continue;
    if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0 && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim()))
      add("text-overflow", el, `${el.scrollWidth} px of text in ${el.clientWidth} px`);
  }

  // 3. Fields, menus and buttons of one row: same height (2 px).
  const controls = [...main.querySelectorAll("input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=file]),select,button:not(.icon-button),.button")].filter(visible);
  const rows = new Map<Element, Element[]>();
  for (const el of controls) {
    const row = el.closest(".toolbar,.actions,.field-row,.form-row,[role=toolbar],.filters,.check-row");
    if (!row) continue;
    rows.set(row, [...(rows.get(row) ?? []), el]);
  }
  for (const [row, items] of rows) {
    const lines = new Map<number, Element[]>();
    for (const el of items) {
      const r = el.getBoundingClientRect(),
        key = Math.round((r.top + r.bottom) / 2 / 8);
      lines.set(key, [...(lines.get(key) ?? []), el]);
    }
    for (const line of lines.values()) {
      if (line.length < 2) continue;
      const heights = line.map((el) => el.getBoundingClientRect().height);
      if (Math.max(...heights) - Math.min(...heights) > 2) add("row-heights", row, `heights ${heights.map(Math.round).join(", ")} px`);
    }
  }

  // 4. Check boxes: at most 24 px, centred on their label's first line.
  for (const box of main.querySelectorAll("input[type=checkbox],input[type=radio]")) {
    if (!visible(box)) continue;
    const r = box.getBoundingClientRect();
    if (r.width > 24.5 || r.height > 24.5) add("checkbox-size", box, `${Math.round(r.width)}×${Math.round(r.height)} px`);
    const label = box.closest("label") ?? (box.id ? document.querySelector(`label[for="${CSS.escape(box.id)}"]`) : null);
    if (!label) continue;
    const range = document.createRange();
    const text = [...label.childNodes].find((n) => n.nodeType === 3 && n.textContent!.trim());
    if (!text) continue;
    range.selectNodeContents(text);
    const first = range.getClientRects()[0];
    if (first && Math.abs((first.top + first.bottom) / 2 - (r.top + r.bottom) / 2) > 6) add("checkbox-align", box, `${Math.round((first.top + first.bottom) / 2 - (r.top + r.bottom) / 2)} px from its label`);
  }

  // 5. Cards of one grid row: same height.
  for (const grid of main.querySelectorAll("*")) {
    const s = getComputedStyle(grid);
    if (s.display !== "grid" || !visible(grid)) continue;
    const cards = [...grid.children].filter((c) => visible(c) && /card|stat|tile/.test(c.className));
    const lines = new Map<number, Element[]>();
    for (const c of cards) {
      const top = Math.round(c.getBoundingClientRect().top);
      lines.set(top, [...(lines.get(top) ?? []), c]);
    }
    for (const line of lines.values()) {
      if (line.length < 2) continue;
      const heights = line.map((c) => c.getBoundingClientRect().height);
      if (Math.max(...heights) - Math.min(...heights) > 2) add("card-heights", grid, `heights ${heights.map(Math.round).join(", ")} px`);
    }
  }

  // 6. Buttons without any effect: no handler of React (props on the node),
  //    not a form's submit, not a popover or summary, nothing above them.
  const props = (el: Element) => {
    const key = Object.keys(el).find((k) => k.startsWith("__reactProps$"));
    return key ? ((el as unknown as Record<string, Record<string, unknown>>)[key] ?? {}) : {};
  };
  const handles = (el: Element) => ["onClick", "onMouseDown", "onPointerDown", "onKeyDown", "onPointerUp", "onMouseUp"].some((h) => typeof props(el)[h] === "function");
  for (const b of main.querySelectorAll("button,[role=button]")) {
    if (!visible(b) || (b as HTMLButtonElement).disabled) continue;
    if ((b as HTMLButtonElement).type === "submit" && (b as HTMLButtonElement).form) continue;
    if (b.hasAttribute("popovertarget") || b.hasAttribute("commandfor") || b.closest("summary,label")) continue;
    let handled = false;
    for (let e: Element | null = b, i = 0; e && i < 5; e = e.parentElement, i++) if (handles(e)) handled = true;
    if (!handled) add("dead-button", b, (b.textContent ?? "").trim().slice(0, 60) || (b.getAttribute("aria-label") ?? ""));
  }

  // 7. Texts not translated: a raw key, a placeholder left, « undefined ».
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.textContent!.trim(),
      el = n.parentElement;
    if (!text || !el || el.closest("script,style,code,pre,textarea,noscript") || !visible(el)) continue;
    if (/^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9]+)+$/.test(text) || /^[a-z]+[A-Z][a-zA-Z]*$/.test(text) || /\{[a-zA-Z]+\}|\bundefined\b|\[object Object\]|\bNaN\b/.test(text))
      add("raw-text", el, text.slice(0, 80));
  }
  for (const el of main.querySelectorAll("[aria-label],[title],[placeholder]")) {
    for (const attr of ["aria-label", "title", "placeholder"]) {
      const v = el.getAttribute(attr);
      if (v && (/\{[a-zA-Z]+\}|\bundefined\b|\[object Object\]/.test(v) || /^[a-z]+[A-Z][a-zA-Z]*$/.test(v))) add("raw-text", el, `${attr}: ${v.slice(0, 80)}`);
    }
  }
  return found;
}
