import type { Pool } from "pg";
import { normalize, searchQuery } from "./schema";
import type { Principal } from "../access/service";
import {
  peopleScope,
  peopleRecords,
  peopleVisibility,
} from "../people/service";
import { canRead, type Event } from "../calendar/access";

/**
 * Global search (Ctrl+K). It reuses each module's own visibility rules: a
 * person, a team or an event appears only if the searcher could already open
 * it. Pages are matched in the browser from the menu.
 */
export async function search(db: Pool, p: Principal, q: string) {
  const needle = normalize(searchQuery.parse(q));
  return peopleScope(db, p, false, async (s) => {
    const all = await peopleRecords(s),
      v = peopleVisibility(s, all);
    const people = all.profiles
      .filter(
        (x) =>
          v.visibleProfiles.has(x.id) && normalize(x.full_name).includes(needle),
      )
      .slice(0, 8)
      .map((x) => ({
        id: x.id,
        name: x.full_name,
        kind:
          x.directory_roles.includes("coach") &&
          !x.directory_roles.includes("player")
            ? ("coach" as const)
            : ("player" as const),
        former: x.status !== "active",
      }));
    const teams = all.teams
      .filter((t) => v.visibleTeams.has(t.id) && normalize(t.name).includes(needle))
      .slice(0, 5)
      .map((t) => ({ id: t.id, name: t.name }));
    const candidates = (
      await s.client.query(
        `SELECT * FROM calendar_event WHERE organization_id=$1 AND status<>'cancelled'
            AND starts_at BETWEEN now()-interval '90 days' AND now()+interval '365 days'
            AND translate(lower(title),'àâäéèêëîïôöùûüç','aaaeeeeiioouuuc') LIKE '%'||$2||'%'
          ORDER BY abs(extract(epoch FROM starts_at-now())) LIMIT 30`,
        [s.context.organization_id, needle.replace(/[\\%_]/g, "\\$&")],
      )
    ).rows as Event[];
    const actor = { ...s.context, twoFactorEnabled: !!s.user.twoFactorEnabled };
    const events = [];
    for (const e of candidates) {
      if (events.length >= 6) break;
      if (await canRead(s.client, actor, e))
        events.push({ id: e.id, title: e.title, starts_at: e.starts_at });
    }
    return { people, teams, events };
  });
}
