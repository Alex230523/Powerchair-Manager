import "server-only";
import { headers } from "next/headers";
import { getAuth } from "./auth-server";
import { getDb } from "./db";

/**
 * The club's palette and tint (prompt 2.9), read on the server so the first
 * paint already has them: from the session's active club for the app, from
 * the form or the pot for the public pages. Any failure falls back to the
 * default night blue, never to an error page.
 */
export type Appearance = { palette: "night" | "bordeaux" | "aubergine" | "brown"; tint: "neutral" | "light" | "strong" };
export const defaultAppearance: Appearance = { palette: "night", tint: "light" };
/** The primary colour of each palette (light theme), for the browser's theme-color. */
export const paletteColor: Record<Appearance["palette"], string> = { night: "#213c60", bordeaux: "#592b41", aubergine: "#40345e", brown: "#4d3828" };

const read = (row: { theme_palette?: string; theme_tint?: string } | undefined): Appearance =>
  row ? { palette: (row.theme_palette ?? "night") as Appearance["palette"], tint: (row.theme_tint ?? "light") as Appearance["tint"] } : defaultAppearance;

export async function sessionAppearance(): Promise<Appearance> {
  return (await sessionShell()).appearance;
}

/**
 * Appearance and whether someone is signed in (wave 16, I1): a visitor gets
 * the page without any menu from the first paint.
 */
export async function sessionShell(): Promise<{ appearance: Appearance; signedIn: boolean }> {
  try {
    const session = await getAuth().api.getSession({ headers: await headers() });
    if (!session) return { appearance: defaultAppearance, signedIn: false };
    return { signedIn: true, appearance: await clubAppearance(session.session.id, session.user.id) };
  } catch {
    return { appearance: defaultAppearance, signedIn: false };
  }
}
async function clubAppearance(sessionId: string, userId: string): Promise<Appearance> {
  try {
    return read(
      (
        await getDb().query(
          "SELECT o.theme_palette,o.theme_tint FROM active_context c JOIN organization o ON o.id=c.organization_id WHERE c.session_id=$1 AND c.user_id=$2 AND o.kind='club'",
          [sessionId, userId],
        )
      ).rows[0],
    );
  } catch {
    return defaultAppearance;
  }
}

/** Public registration form or fundraising pot: the club that owns it. */
export async function publicAppearance(kind: "form" | "pot", key: string): Promise<Appearance> {
  try {
    const sql =
      kind === "form"
        ? "SELECT o.theme_palette,o.theme_tint FROM registration_form f JOIN organization o ON o.id=f.organization_id WHERE f.id::text=$1"
        : "SELECT o.theme_palette,o.theme_tint FROM fundraising_pot p JOIN organization o ON o.id=p.organization_id WHERE p.public_token=$1";
    return read((await getDb().query(sql, [key])).rows[0]);
  } catch {
    return defaultAppearance;
  }
}
