import type { Pool } from "pg";
import { AccessError, type Principal } from "../access/service";
import { attendanceExecute } from "../attendance/service";

/**
 * « Présent » / « Absent » pressed in the notification: the same command as
 * the attendance page, with all its checks (the person may answer for this
 * profile, the answers are still open, the invitation is current).
 */
export async function respondFromPush(db: Pool, p: Principal, invitationId: string, organizationId: string, response: "present" | "absent") {
  const i = (await db.query("SELECT id,version FROM attendance_invitation WHERE id=$1 AND organization_id=$2", [invitationId, organizationId])).rows[0];
  if (!i) throw new AccessError("NOT_FOUND", 404);
  return attendanceExecute(db, p, { action: "respond", id: i.id, expectedVersion: i.version, response, comment: "" }, organizationId);
}
