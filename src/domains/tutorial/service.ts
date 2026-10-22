import type { Pool } from "pg";
import { active, AccessError, type Principal } from "../access/service";
import { tutorialAudience, type TutorialCommand } from "./schema";

/** Wave 17 (O1): whether the active profile has a tour, and whether it was seen. */
export async function tutorialView(db: Pool, p: Principal) {
  const c = await db.connect();
  try {
    const a = await active(c, p);
    const audience = tutorialAudience(a.role);
    if (!audience) return { audience: null, seen: true };
    const row = (await c.query("SELECT tutorial_seen_at FROM user_tutorial WHERE user_id=$1 AND audience=$2", [p.userId, audience])).rows[0];
    return { audience, seen: !!row?.tutorial_seen_at };
  } finally {
    c.release();
  }
}

/** « Passer » or « Terminer » marks it seen; Settings > My account starts it again. */
export async function tutorialExecute(db: Pool, p: Principal, command: TutorialCommand) {
  const c = await db.connect();
  try {
    const a = await active(c, p);
    const audience = tutorialAudience(a.role);
    if (!audience) throw new AccessError("NOT_FOUND", 404);
    await c.query(
      "INSERT INTO user_tutorial(user_id,audience,tutorial_seen_at) VALUES($1,$2,CASE WHEN $3 THEN now() END) ON CONFLICT(user_id,audience) DO UPDATE SET tutorial_seen_at=EXCLUDED.tutorial_seen_at",
      [p.userId, audience, command.action === "seen"],
    );
    return { ok: true as const, audience };
  } finally {
    c.release();
  }
}
