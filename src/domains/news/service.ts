import type { Pool } from "pg";
import { z } from "zod";
import { account, active, type Principal } from "../access/service";
import { allEntries, badgeRoutes, concerns, newsRoleOf, popupEntry } from "./schema";

/** 20: the « Nouveautés » of a person: filtered by the role of the profile in use, read or not, the menu's badges and the one window. */
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date());
export async function newsView(db: Pool, p: Principal, all = false, day = today()) {
  const c = await db.connect();
  try {
    await account(c, p);
    let kind: string | null = null,
      role: string | null = null;
    try {
      const a = await active(c, p);
      kind = a.kind;
      role = a.role;
    } catch {
      /* No profile chosen yet: the entries for everyone. */
    }
    const r = newsRoleOf(kind, role);
    const read = new Set((await c.query("SELECT entry_id FROM user_news_read WHERE user_id=$1", [p.userId])).rows.map((x) => x.entry_id as string));
    const off = !!(await c.query("SELECT popup_off FROM user_news_setting WHERE user_id=$1", [p.userId])).rows[0]?.popup_off;
    const entries = allEntries();
    return {
      role: r,
      today: day,
      popupOff: off,
      entries: entries.filter((e) => all || concerns(e, r)).map((e) => ({ ...e, read: read.has(e.id) })),
      badges: badgeRoutes(entries, r, read, day),
      popup: popupEntry(entries, r, read, day, off),
    };
  } finally {
    c.release();
  }
}
export const newsCommand = z.discriminatedUnion("action", [
  z.object({ action: z.literal("read"), ids: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/)).min(1).max(200) }),
  z.object({ action: z.literal("popup"), off: z.boolean() }),
]);
export async function newsExecute(db: Pool, p: Principal, raw: z.input<typeof newsCommand>) {
  const cmd = newsCommand.parse(raw);
  const c = await db.connect();
  try {
    await account(c, p);
    if (cmd.action === "read") {
      const known = new Set(allEntries().map((e) => e.id));
      const ids = cmd.ids.filter((id) => known.has(id));
      if (ids.length) await c.query("INSERT INTO user_news_read(user_id,entry_id) SELECT $1,unnest($2::text[]) ON CONFLICT DO NOTHING", [p.userId, ids]);
      return { read: ids.length };
    }
    await c.query("INSERT INTO user_news_setting(user_id,popup_off) VALUES($1,$2) ON CONFLICT (user_id) DO UPDATE SET popup_off=EXCLUDED.popup_off,updated_at=now()", [p.userId, cmd.off]);
    return { off: cmd.off };
  } finally {
    c.release();
  }
}
