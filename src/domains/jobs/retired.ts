import type { Pool } from "pg";

/**
 * The incidents module was removed on 04/11/2026 (owner's request): no page
 * reads its tables any more, but the rows already written keep their legal
 * retention and are purged on the same schedule as before (health details
 * and photos after 5 years, the rest after 10).
 */
export async function retiredIncidentPurge(db: Pool) {
  const health = await db.query("UPDATE incident SET health_ciphertext=NULL WHERE health_ciphertext IS NOT NULL AND occurred_at<now()-interval '5 years'");
  const photos = await db.query("DELETE FROM incident_file f USING incident i WHERE f.incident_id=i.id AND f.organization_id=i.organization_id AND f.kind='photo' AND i.occurred_at<now()-interval '5 years'");
  const gone = await db.query("DELETE FROM incident WHERE occurred_at<now()-interval '10 years'");
  return (health.rowCount ?? 0) + (photos.rowCount ?? 0) + (gone.rowCount ?? 0);
}
