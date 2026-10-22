import type { PoolClient } from "pg";
import type { InteractionKind } from "./schema";

/**
 * A4: one line of a contact's exchange log. A call, an email or a meeting
 * (not a note) moves the last contact of the sponsors this person speaks
 * for (A2). Also used by the application itself for a mail it sends.
 */
export async function logInteraction(
  c: PoolClient,
  i: { org: string; contactId: string; kind: InteractionKind; summary: string; authorId: string | null; source?: string; on?: string },
) {
  const row = (
    await c.query(
      `INSERT INTO contact_interaction(organization_id,contact_id,kind,summary,author_id,source,happened_on)
       VALUES($1,$2,$3,$4,$5,$6,COALESCE($7::date,CURRENT_DATE)) RETURNING id,happened_on::text AS on`,
      [i.org, i.contactId, i.kind, i.summary.slice(0, 300), i.authorId, i.source ?? "", i.on ?? null],
    )
  ).rows[0] as { id: string; on: string };
  if (i.kind !== "note")
    await c.query(
      "UPDATE partner SET last_contact_on=$3::date,updated_at=now() WHERE organization_id=$1 AND contact_id=$2 AND (last_contact_on IS NULL OR last_contact_on<$3::date)",
      [i.org, i.contactId, row.on],
    );
  return row.id;
}
