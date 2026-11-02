/**
 * 19: a picture of the current screen, made in the browser without any
 * library: the page is copied, every piece of data is masked in the copy
 * (names, figures, fields, pictures; only titles, labels, buttons and menus
 * stay readable), then the copy is drawn as an SVG image onto a canvas.
 * Nothing leaves the device here; the person sees the result, may mask
 * more, or drop it.
 */
const KEEP = "h1,h2,h3,h4,h5,h6,label,legend,button,th,summary,nav,option,[role=tab],[role=menuitem],.sidebar,.topbar,.page-header,.badge";
/** Elements whose whole text is masked, even inside a label or a title. */
const SENSITIVE = "[data-sensitive],[data-private],.sensitive,input,textarea,select";

function maskText(t: string) {
  return t.replace(/[\p{L}\p{N}@]/gu, "•");
}

export function maskTree(root: Element) {
  root.querySelectorAll("script,noscript,dialog,iframe,[data-capture-skip]").forEach((n) => n.remove());
  // Pictures (an avatar shows a face) and their alternative texts go.
  root.querySelectorAll("img,picture,video,canvas").forEach((n) => n.replaceWith(Object.assign(n.ownerDocument.createElement("span"), { className: "capture-hidden" })));
  root.querySelectorAll("input,textarea").forEach((n) => {
    n.removeAttribute("value");
    n.setAttribute("placeholder", "");
    if (n.tagName === "TEXTAREA") n.textContent = "";
  });
  root.querySelectorAll("[title],[aria-label],[alt]").forEach((n) => {
    n.removeAttribute("title");
    n.removeAttribute("alt");
  });
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) texts.push(n as Text);
  for (const t of texts) {
    const parent = t.parentElement;
    if (!parent || !t.data.trim()) continue;
    if (parent.closest(SENSITIVE) || !parent.closest(KEEP)) t.data = maskText(t.data);
  }
}

/** The style sheets of the page as text (same origin only). */
function styles() {
  return [...document.styleSheets]
    .map((s) => {
      try {
        return [...s.cssRules].map((r) => r.cssText).join("\n");
      } catch {
        return "";
      }
    })
    .join("\n");
}

export async function captureScreen(): Promise<HTMLCanvasElement> {
  const w = window.innerWidth,
    h = window.innerHeight;
  const body = document.body.cloneNode(true) as HTMLElement;
  maskTree(body);
  const attrs = [...document.documentElement.attributes]
    .filter((a) => a.name.startsWith("data-") || a.name === "lang")
    .map((a) => `${a.name}="${a.value.replace(/"/g, "&quot;")}"`)
    .join(" ");
  // The copy is moved up by the page's scroll, so the picture is what the person sees.
  const css = `${styles()}\n.capture-root{width:${w}px;height:${h}px;overflow:hidden}.capture-shift{transform:translateY(-${Math.round(window.scrollY)}px)}`;
  const html = new XMLSerializer().serializeToString(body).replace(/^<body/, "<div").replace(/<\/body>$/, "</div>");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" ${attrs} width="${w}" height="${h}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" class="capture-root"><style>${css.replace(/<\/style/gi, "")}</style><div class="capture-shift">${html}</div></div></foreignObject></svg>`;
  const img = new Image();
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  return canvas;
}

/** A canvas as PNG in base64 (throws on a browser that refuses: the report then leaves without it). */
export function pngOf(canvas: HTMLCanvasElement) {
  return canvas.toDataURL("image/png").split(",")[1] ?? "";
}
