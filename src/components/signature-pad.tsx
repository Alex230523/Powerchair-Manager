"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Locale } from "@/lib/locale";

const copy = {
  fr: {
    title: "Signer électroniquement",
    intro:
      "Relisez le document téléchargeable ci-dessus, puis signez. Votre nom, la date, l'heure et une empreinte du texte sont ajoutés au document ; le club le vérifie ensuite.",
    name: "Nom et prénom du signataire",
    pad: "Signez dans le cadre (souris, doigt ou stylet)",
    clear: "Effacer",
    accept:
      "J'ai lu le document et je le signe électroniquement (lu et approuvé).",
    sign: "Signer le document",
    empty: "Dessinez votre signature dans le cadre.",
    signed: "Signé par {name} le {date}",
  },
  nl: {
    title: "Elektronisch ondertekenen",
    intro:
      "Lees het document hierboven en onderteken daarna. Uw naam, de datum, het uur en een vingerafdruk van de tekst worden toegevoegd; de club controleert het daarna.",
    name: "Naam en voornaam van de ondertekenaar",
    pad: "Onderteken in het kader (muis, vinger of stylus)",
    clear: "Wissen",
    accept:
      "Ik heb het document gelezen en onderteken het elektronisch (gelezen en goedgekeurd).",
    sign: "Document ondertekenen",
    empty: "Teken uw handtekening in het kader.",
    signed: "Ondertekend door {name} op {date}",
  },
  en: {
    title: "Sign electronically",
    intro:
      "Read the document available above, then sign. Your name, date, time and a fingerprint of the text are added to the document; the club then reviews it.",
    name: "Signer's full name",
    pad: "Sign in the box (mouse, finger or stylus)",
    clear: "Clear",
    accept:
      "I have read the document and sign it electronically (read and approved).",
    sign: "Sign the document",
    empty: "Draw your signature in the box.",
    signed: "Signed by {name} on {date}",
  },
};
export const signatureCopy = copy;

/** Canvas signature with keyboard-accessible fallback (typed name is required anyway). */
export function SignaturePad({
  locale,
  busy,
  onSign,
  texts,
  defaultName = "",
}: {
  locale: Locale;
  busy: boolean;
  onSign: (input: { signerName: string; signature: string }) => void;
  /** 9: the same pad for another use (the club's signature on its attestations). */
  texts?: Partial<(typeof copy)["fr"]>;
  defaultName?: string;
}) {
  const t = { ...copy[locale], ...texts };
  const canvas = useRef<HTMLCanvasElement>(null);
  const [drawn, setDrawn] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#1c1917";
    let drawing = false;
    const point = (e: PointerEvent) => {
      const r = c.getBoundingClientRect();
      return [
        ((e.clientX - r.left) * c.width) / r.width,
        ((e.clientY - r.top) * c.height) / r.height,
      ];
    };
    const down = (e: PointerEvent) => {
      drawing = true;
      c.setPointerCapture(e.pointerId);
      const [x, y] = point(e);
      ctx.beginPath();
      ctx.moveTo(x, y);
    };
    const move = (e: PointerEvent) => {
      if (!drawing) return;
      const [x, y] = point(e);
      ctx.lineTo(x, y);
      ctx.stroke();
      setDrawn(true);
    };
    const up = () => {
      drawing = false;
    };
    c.addEventListener("pointerdown", down);
    c.addEventListener("pointermove", move);
    c.addEventListener("pointerup", up);
    c.addEventListener("pointerleave", up);
    return () => {
      c.removeEventListener("pointerdown", down);
      c.removeEventListener("pointermove", move);
      c.removeEventListener("pointerup", up);
      c.removeEventListener("pointerleave", up);
    };
  }, []);
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!drawn || !canvas.current) return setError(t.empty);
    setError("");
    onSign({
      signerName: String(new FormData(e.currentTarget).get("signer") ?? ""),
      signature: canvas.current.toDataURL("image/png"),
    });
  }
  return (
    <form className="finance-form signature-form" onSubmit={submit}>
      <h3>{t.title}</h3>
      <p className="muted">{t.intro}</p>
      <label htmlFor="signer-name">
        {t.name}
        <input
          id="signer-name"
          name="signer"
          required
          minLength={2}
          maxLength={120}
          autoComplete="name"
          defaultValue={defaultName}
        />
      </label>
      <div>
        <p className="muted" id="signature-pad-label">
          {t.pad}
        </p>
        <canvas
          ref={canvas}
          className="signature-pad"
          width={600}
          height={180}
          role="img"
          aria-labelledby="signature-pad-label"
        />
        <button
          type="button"
          className="text-button"
          onClick={() => {
            const c = canvas.current;
            c?.getContext("2d")?.clearRect(0, 0, c.width, c.height);
            setDrawn(false);
          }}
        >
          {t.clear}
        </button>
      </div>
      <label className="check">
        <input type="checkbox" required />
        {t.accept}
      </label>
      {error && <p role="alert">{error}</p>}
      <button className="button" disabled={busy}>
        {t.sign}
      </button>
    </form>
  );
}
