import type { Pool } from "pg";
import { z } from "zod";
import { AccessError, audit, type Principal } from "../access/service";
import { complianceItems } from "../guide/drafts";
import { readableProfiles, scope } from "./service";

/**
 * « Conforme pour un match » (Guide, Le fauteuil de match): the lines a club
 * checks on a chair at a service, dated. Who manages the equipment records
 * a check; who sees the chair reads the last ones.
 */
export const complianceCommand = z.object({
  chairId: z.uuid(),
  checkedOn: z.iso.date(),
  items: z.array(z.enum(complianceItems)).max(complianceItems.length),
  note: z.string().trim().max(300).default(""),
});

export async function complianceView(db: Pool, p: Principal, chairId: string) {
  return scope(db, p, false, async (s) => {
    const org = s.a.organization_id;
    if (!s.manage) {
      const profiles = [...(await readableProfiles(s.c, s.a))];
      const seen = await s.c.query("SELECT 1 FROM equipment_chair_assignment WHERE chair_id=$1 AND organization_id=$2 AND ends_on IS NULL AND profile_id=ANY($3::uuid[])", [chairId, org, profiles]);
      if (!seen.rowCount) throw new AccessError("NOT_FOUND", 404);
    } else if (!(await s.c.query("SELECT 1 FROM equipment_chair WHERE id=$1 AND organization_id=$2", [chairId, org])).rowCount) throw new AccessError("NOT_FOUND", 404);
    const checks = (
      await s.c.query(
        'SELECT k.id,k.checked_on::text AS checked_on,k.items,k.note,u.name AS by FROM chair_compliance k JOIN "user" u ON u.id=k.checked_by WHERE k.organization_id=$1 AND k.chair_id=$2 ORDER BY k.checked_on DESC,k.created_at DESC LIMIT 10',
        [org, chairId],
      )
    ).rows as { id: string; checked_on: string; items: string[]; note: string; by: string }[];
    const last = checks[0];
    return { organization_id: org, can: { edit: s.manage }, items: complianceItems, checks, compliant: !!last && complianceItems.every((i) => last.items.includes(i)) };
  });
}

export async function complianceSave(db: Pool, p: Principal, raw: z.input<typeof complianceCommand>, expected: string) {
  const cmd = complianceCommand.parse(raw);
  return scope(
    db,
    p,
    true,
    async (s) => {
      if (!s.manage) throw new AccessError("FORBIDDEN");
      const org = s.a.organization_id;
      if (!(await s.c.query("SELECT 1 FROM equipment_chair WHERE id=$1 AND organization_id=$2", [cmd.chairId, org])).rowCount) throw new AccessError("NOT_FOUND", 404);
      const id = (
        await s.c.query("INSERT INTO chair_compliance(organization_id,chair_id,checked_on,items,note,checked_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id", [org, cmd.chairId, cmd.checkedOn, cmd.items, cmd.note, s.p.userId])
      ).rows[0].id as string;
      await audit(s.c, org, s.p.userId, "equipment.compliance", cmd.chairId, { items: cmd.items.length });
      return { id };
    },
    expected,
  );
}
