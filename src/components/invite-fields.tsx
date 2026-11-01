"use client";
import type { Locale } from "@/lib/locale";
import { inviteCopy } from "./invite-copy";
export { inviteCopy, isMinor } from "./invite-copy";

/** The checkbox (on by default) and, for a minor player, the parent's name and address. */
export function InviteFields({ locale, on, setOn, minor }: { locale: Locale; on: boolean; setOn: (on: boolean) => void; minor: boolean }) {
  const t = inviteCopy[locale];
  return (
    <fieldset className="invite-fields">
      <label className="invite-toggle">
        <input type="checkbox" name="invite" checked={on} onChange={(e) => setOn(e.target.checked)} aria-describedby="invite-help" />
        {t.send}
      </label>
      <p className="muted" id="invite-help">
        {minor ? t.minor : t.adult}
      </p>
      {on && minor && (
        <>
          <label>
            {t.parentName}
            <input name="guardianName" required minLength={2} maxLength={120} autoComplete="off" />
          </label>
          <label>
            {t.parentEmail}
            <input name="guardianEmail" type="email" required maxLength={254} autoComplete="off" />
          </label>
        </>
      )}
    </fieldset>
  );
}
