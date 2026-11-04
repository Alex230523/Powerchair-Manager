"use client";
import { useState } from "react";
import type { Locale } from "@/lib/locale";
import { representativeRelations } from "@/domains/people/schema";
import { representativeCopy } from "./representative-copy";
import { languageNames } from "./shell-copy";

/**
 * 8: « Parent ou responsable légal » in « Ajouter un joueur »: required for a
 * minor, asked for an adult (never imposed). A person already known to the
 * club (a sibling's parent, proposed first when the family name matches) or
 * a new one; up to two; legal representative or delegated carer.
 * `read(form)` gives the command's fields.
 */
export type Known = { id: string; full_name: string };
export function readRepresentatives(f: FormData) {
  const reps = [0, 1]
    .filter((i) => f.get(`rep-${i}-on`) === "1")
    .map((i) => {
      const existing = String(f.get(`rep-${i}-who`) ?? "");
      const v = (k: string) => String(f.get(`rep-${i}-${k}`) ?? "").trim();
      return {
        ...(existing ? { existingId: existing } : { fullName: v("name") }),
        relation: v("relation"),
        email: v("email"),
        phone: v("phone"),
        locale: v("locale") || "fr",
        rights: v("rights") || "legal",
      };
    });
  return { hasRepresentative: f.get("has-representative") === "on", representatives: reps, inviteRepresentatives: f.get("invite-representatives") === "on" };
}

export function RepresentativeFields({ locale, minor, known, playerName }: { locale: Locale; minor: boolean; known: Known[]; playerName: string }) {
  const t = representativeCopy[locale];
  const [adultHas, setAdultHas] = useState(false),
    [second, setSecond] = useState(false);
  const shown = minor || adultHas;
  const family = playerName.trim().split(/\s+/).slice(1).join(" ").toLocaleLowerCase();
  const suggested = family ? known.filter((k) => k.full_name.toLocaleLowerCase().endsWith(" " + family)) : [];
  const others = known.filter((k) => !suggested.includes(k));
  return (
    <fieldset className="representatives">
      <legend>{t.title}</legend>
      {minor ? (
        <p className="muted">{t.minorIntro}</p>
      ) : (
        <>
          <label className="check">
            <input type="checkbox" name="has-representative" checked={adultHas} onChange={(e) => setAdultHas(e.target.checked)} aria-describedby="rep-adult-hint" />
            {t.adultQuestion}
          </label>
          <p className="muted small" id="rep-adult-hint">
            {t.adultHint}
          </p>
        </>
      )}
      {shown &&
        [0, 1]
          .filter((i) => i === 0 || second)
          .map((i) => <One key={i} i={i} locale={locale} suggested={suggested} others={others} />)}
      {shown && (
        <p>
          <button type="button" className="text-button" onClick={() => setSecond(!second)}>
            {second ? t.removeSecond : t.addSecond}
          </button>
        </p>
      )}
      {shown && (
        <>
          <label className="check">
            <input type="checkbox" name="invite-representatives" defaultChecked aria-describedby="rep-invite-hint" />
            {t.invite}
          </label>
          <p className="muted small" id="rep-invite-hint">
            {t.inviteHint}
          </p>
        </>
      )}
    </fieldset>
  );
}

function One({ i, locale, suggested, others }: { i: number; locale: Locale; suggested: Known[]; others: Known[] }) {
  const t = representativeCopy[locale];
  const [who, setWho] = useState("");
  const id = (k: string) => `rep-${i}-${k}`;
  return (
    <div className="representative" role="group" aria-labelledby={id("title")}>
      <input type="hidden" name={id("on")} value="1" />
      <h4 id={id("title")}>{i === 0 ? t.title : t.second}</h4>
      <label htmlFor={id("who")}>{t.who}</label>
      <select id={id("who")} name={id("who")} value={who} onChange={(e) => setWho(e.target.value)}>
        <option value="">{t.newPerson}</option>
        {suggested.length > 0 && (
          <optgroup label={t.suggested}>
            {suggested.map((k) => (
              <option key={k.id} value={k.id}>
                {k.full_name}
              </option>
            ))}
          </optgroup>
        )}
        {others.length > 0 && (
          <optgroup label={t.known}>
            {others.map((k) => (
              <option key={k.id} value={k.id}>
                {k.full_name}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      {!who && (
        <>
          <label htmlFor={id("name")}>{t.name}</label>
          <input id={id("name")} name={id("name")} required minLength={2} maxLength={120} autoComplete="off" />
        </>
      )}
      <label htmlFor={id("relation")}>{t.relation}</label>
      <select id={id("relation")} name={id("relation")} defaultValue="mother">
        {representativeRelations.map((r) => (
          <option key={r} value={r}>
            {t.relations[r]}
          </option>
        ))}
      </select>
      <label htmlFor={id("email")}>{t.email}</label>
      <input id={id("email")} name={id("email")} type="email" maxLength={254} autoComplete="off" />
      {!who && (
        <>
          <label htmlFor={id("phone")}>{t.phone}</label>
          <input id={id("phone")} name={id("phone")} type="tel" maxLength={40} autoComplete="off" />
          <label htmlFor={id("locale")}>{t.language}</label>
          <select id={id("locale")} name={id("locale")} defaultValue={locale}>
            {(["fr", "nl", "en"] as const).map((l) => (
              <option key={l} value={l}>
                {languageNames[l]}
              </option>
            ))}
          </select>
        </>
      )}
      <fieldset className="check-row">
        <legend>{t.rights}</legend>
        <label className="check">
          <input type="radio" name={id("rights")} value="legal" defaultChecked aria-describedby={id("legal-hint")} />
          {t.legal}
        </label>
        <p className="muted small" id={id("legal-hint")}>
          {t.legalHint}
        </p>
        <label className="check">
          <input type="radio" name={id("rights")} value="aid" aria-describedby={id("aid-hint")} />
          {t.aid}
        </label>
        <p className="muted small" id={id("aid-hint")}>
          {t.aidHint}
        </p>
      </fieldset>
    </div>
  );
}
