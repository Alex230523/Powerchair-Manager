import type { Pool, PoolClient } from "pg";
import { resolveScope, teamMembers } from "../scope/service";
import { mfaSatisfied } from "../../lib/security-policy";
import {
  account,
  active,
  audit,
  AccessError,
  type Principal,
} from "../access/service";
import { permissions } from "../access/policy";
import {
  peopleScope,
  peopleRecords,
  peopleVisibility,
  brusselsToday,
} from "../people/service";
import { publish } from "../notifications/queue";
import { seasonOf } from "../finance/schema";
import {
  clubCommand,
  federationCommand,
  licenseNumber,
  type ClubCommand,
  type FederationCommand,
} from "./schema";
export { clubCommand, federationCommand };

type Lang = "fr" | "nl" | "en";
const statusText: Record<string, Record<Lang, string>> = {
  requested: {
    fr: "demande envoyée à la fédération",
    nl: "aanvraag naar de federatie verstuurd",
    en: "request sent to the federation",
  },
  active: {
    fr: "licence délivrée",
    nl: "licentie uitgereikt",
    en: "licence issued",
  },
  refused: {
    fr: "demande refusée",
    nl: "aanvraag geweigerd",
    en: "request refused",
  },
  suspended: {
    fr: "licence suspendue",
    nl: "licentie geschorst",
    en: "licence suspended",
  },
  validated: {
    fr: "classification validée",
    nl: "classificatie gevalideerd",
    en: "classification validated",
  },
  classification: {
    fr: "classification à vérifier",
    nl: "classificatie na te kijken",
    en: "classification to check",
  },
};
async function notify(
  c: PoolClient,
  input: {
    organizationId: string;
    roles: string[];
    person: string;
    status: keyof typeof statusText;
    path: string;
    key: string;
  },
) {
  const users = (
    await c.query(
      `SELECT DISTINCT u.id,u.email,u.name,COALESCE(p.locale,'fr') AS locale,o.name AS organization
         FROM role_assignment r JOIN "user" u ON u.id=r.user_id LEFT JOIN person p ON p.user_id=u.id JOIN organization o ON o.id=r.organization_id
        WHERE r.organization_id=$1 AND r.role=ANY($2) AND r.revoked_at IS NULL AND u.active`,
      [input.organizationId, input.roles],
    )
  ).rows as {
    id: string;
    email: string;
    name: string;
    locale: Lang;
    organization: string;
  }[];
  for (const u of users)
    await publish(c, {
      organizationId: input.organizationId,
      userId: u.id,
      email: u.email,
      kind: "license_update",
      category: "administrative",
      resourceType: "license",
      resourceId: input.key,
      eventKey: `license:${input.key}:${input.status}:${u.id}`,
      locale: u.locale,
      variables: {
        name: u.name,
        organization: u.organization,
        url: `${process.env.BETTER_AUTH_URL ?? ""}/${u.locale}${input.path}`,
        person: input.person,
        status: statusText[input.status][u.locale],
      },
    });
}

/* ---------------------------------------------------------------- Club side */

export async function clubLicensesView(db: Pool, p: Principal, raw: { season?: string; team?: string } = {}) {
  return peopleScope(db, p, false, async (s) => {
    const c = s.client,
      org = s.context.organization_id;
    // The top bar's team (wave 12): its current players only.
    const chosen = await resolveScope(c, { organization_id: org, role: s.context.role, user_id: p.userId, team_id: s.context.team_id }, raw);
    const members = chosen.teamId ? new Set(await teamMembers(c, org, chosen.teamId)) : null;
    const all = await peopleRecords(s),
      v = peopleVisibility(s, all);
    if (!v.full && !s.rights.includes("teams.manage"))
      throw new AccessError("FORBIDDEN");
    const federation = (
      await c.query(
        "SELECT f.id,f.name FROM organization o JOIN organization f ON f.id=o.federation_id WHERE o.id=$1",
        [org],
      )
    ).rows[0] as { id: string; name: string } | undefined;
    const season = seasonOf(brusselsToday()).label;
    const players = (
      await c.query(
        `SELECT cp.id,cp.full_name,extract(year FROM cp.birth_date)::int AS birth_year,
                l.id AS license_id,l.status AS license_status,l.number AS license_number,l.note AS license_note,
                COALESCE(sp.classification,'not_classified') AS classification,sp.classification_valid_until::text AS classification_valid_until,
                COALESCE(sp.classification_status,'unverified') AS classification_status,COALESCE(sp.classification_note,'') AS classification_note
           FROM club_person cp
           LEFT JOIN license l ON l.profile_id=cp.id AND l.season=$2 AND l.status<>'refused'
           LEFT JOIN player_sport_profile sp ON sp.profile_id=cp.id
          WHERE cp.organization_id=$1 AND cp.status='active' AND 'player'=ANY(cp.directory_roles) AND NOT ('player'=ANY(cp.former_roles))
          ORDER BY cp.full_name`,
        [org, season],
      )
    ).rows.filter((r) => !members || members.has(r.id));
    const manage =
      mfaSatisfied(!!s.user.twoFactorEnabled) &&
      (s.rights.includes("people.manage") || s.rights.includes("teams.manage"));
    return {
      organization_id: org,
      federation: federation ?? null,
      season,
      players,
      can: { manage },
    };
  });
}

export async function clubLicensesExecute(
  db: Pool,
  p: Principal,
  command: ClubCommand,
  expected: string,
) {
  return peopleScope(db, p, true, async (s) => {
    const c = s.client,
      org = s.context.organization_id;
    if (expected !== org) throw new AccessError("CONTEXT_CHANGED", 409);
    if (!mfaSatisfied(!!s.user.twoFactorEnabled))
      throw new AccessError("MFA_REQUIRED");
    if (
      !s.rights.includes("people.manage") &&
      !s.rights.includes("teams.manage")
    )
      throw new AccessError("FORBIDDEN");
    const fed = (
      await c.query("SELECT federation_id FROM organization WHERE id=$1", [org])
    ).rows[0]?.federation_id as string | null;
    if (!fed) throw new AccessError("NO_FEDERATION", 409);
    if (command.action === "requestLicenses") {
      let created = 0;
      for (const profileId of command.profileIds) {
        const player = await c.query(
          "SELECT 1 FROM club_person WHERE id=$1 AND organization_id=$2 AND status='active'",
          [profileId, org],
        );
        if (!player.rowCount) throw new AccessError("NOT_FOUND", 404);
        const inserted = await c.query(
          "INSERT INTO license(federation_id,organization_id,profile_id,season,requested_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING id",
          [fed, org, profileId, command.season, p.userId],
        );
        created += inserted.rowCount ?? 0;
      }
      if (created)
        await notify(c, {
          organizationId: fed,
          roles: ["federation_president", "federation_worker"],
          person: `${created} · ${s.context.organization_name}`,
          status: "requested",
          path: "/federation/licenses",
          key: org + ":" + command.season,
        });
      await audit(c, org, p.userId, "license.request", org);
      return { ok: true as const, created };
    }
    if (command.action === "cancelLicense") {
      const changed = await c.query(
        "DELETE FROM license WHERE id=$1 AND organization_id=$2 AND status='requested' RETURNING id",
        [command.id, org],
      );
      if (!changed.rowCount) throw new AccessError("NOT_FOUND", 404);
      await audit(c, org, p.userId, "license.cancel", command.id);
      return { ok: true as const };
    }
    const sport = await c.query(
      "UPDATE player_sport_profile SET classification_status='requested',classification_note='' WHERE profile_id=$1 AND organization_id=$2 AND classification IN ('PF1','PF2','pending') RETURNING profile_id",
      [command.profileId, org],
    );
    if (!sport.rowCount) throw new AccessError("NO_CLASSIFICATION", 409);
    const name = (
      await c.query("SELECT full_name FROM club_person WHERE id=$1", [
        command.profileId,
      ])
    ).rows[0].full_name;
    await notify(c, {
      organizationId: fed,
      roles: ["federation_president", "federation_worker"],
      person: `${name} (${s.context.organization_name})`,
      status: "classification",
      path: "/federation/licenses",
      key: command.profileId,
    });
    await audit(c, org, p.userId, "classification.request", command.profileId);
    return { ok: true as const };
  });
}

/** Federation events (visible to every member) shown to affiliated clubs. */
export async function federalCalendarView(db: Pool, p: Principal) {
  return peopleScope(db, p, false, async (s) => {
    const fed = (
      await s.client.query(
        "SELECT f.id,f.name FROM organization o JOIN organization f ON f.id=o.federation_id WHERE o.id=$1",
        [s.context.organization_id],
      )
    ).rows[0] as { id: string; name: string } | undefined;
    if (!fed) return { federation: null, events: [] };
    const events = (
      await s.client.query(
        `SELECT e.id,e.title,e.kind,e.custom_type,e.starts_at,e.ends_at,e.local_start,e.local_end,e.status,e.instructions,
                COALESCE(pl.name,sv.name,NULLIF(e.free_location,''),'') AS location
           FROM calendar_event e LEFT JOIN calendar_place pl ON pl.id=e.place_id LEFT JOIN shared_venue sv ON sv.id=e.shared_venue_id
          WHERE e.organization_id=$1 AND e.visibility='organization' AND e.ends_at>=now()-interval '1 day' AND e.starts_at<=now()+interval '12 months'
          ORDER BY e.starts_at LIMIT 200`,
        [fed.id],
      )
    ).rows;
    return { federation: fed, events };
  });
}

/* ----------------------------------------------------------- Federation side */

async function federationScope<T>(
  db: Pool,
  p: Principal,
  write: boolean,
  fn: (c: PoolClient, fed: string, manage: boolean) => Promise<T>,
  expected?: string,
) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    await c.query("SET LOCAL TIME ZONE 'Europe/Brussels'");
    const a = await active(c, p);
    await c.query(
      `SELECT id FROM organization WHERE id=$1 FOR ${write ? "UPDATE" : "SHARE"}`,
      [a.organization_id],
    );
    const user = await account(c, p);
    if (expected && expected !== a.organization_id)
      throw new AccessError("CONTEXT_CHANGED", 409);
    if (a.kind !== "federation") throw new AccessError("FEDERATION_ONLY");
    if (a.role !== "federation_president" && a.role !== "federation_worker")
      throw new AccessError("FORBIDDEN");
    const manage =
      mfaSatisfied(!!user.twoFactorEnabled) &&
      (permissions(a.role, a.grants).includes("mandates.manage") ||
        a.role === "federation_worker");
    if (write && !manage) throw new AccessError("FORBIDDEN");
    const out = await fn(c, a.organization_id, manage);
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

/** Licences, classifications to check and transfers between affiliated clubs. */
export async function federationLicensesView(db: Pool, p: Principal) {
  return federationScope(db, p, false, async (c, fed, manage) => {
    // Only what the federation needs: name, birth year, club; never contacts or health data.
    const licenses = (
      await c.query(
        `SELECT l.id,l.season,l.status,l.number,l.note,l.requested_at,l.decided_at,o.name AS club,cp.full_name,extract(year FROM cp.birth_date)::int AS birth_year
           FROM license l JOIN organization o ON o.id=l.organization_id JOIN club_person cp ON cp.id=l.profile_id
          WHERE l.federation_id=$1 ORDER BY (l.status='requested') DESC,o.name,cp.full_name LIMIT 2000`,
        [fed],
      )
    ).rows;
    const classifications = (
      await c.query(
        `SELECT sp.profile_id,o.name AS club,cp.full_name,extract(year FROM cp.birth_date)::int AS birth_year,sp.classification,sp.classification_valid_until::text AS valid_until,sp.control,sp.classification_status AS status,sp.classification_note AS note,sp.classification_checked_at AS checked_at
           FROM player_sport_profile sp JOIN club_person cp ON cp.id=sp.profile_id JOIN organization o ON o.id=sp.organization_id
          WHERE o.federation_id=$1 AND sp.classification_status IN ('requested','validated','refused')
          ORDER BY (sp.classification_status='requested') DESC,o.name,cp.full_name LIMIT 1000`,
        [fed],
      )
    ).rows;
    const transfers = (
      await c.query(
        `SELECT t.id,cp.full_name,src.name AS from_club,dst.name AS to_club,(t.expires_at-interval '7 days') AS created_at,t.accepted_at,t.revoked_at,t.expires_at,
                CASE WHEN t.accepted_at IS NOT NULL THEN 'accepted' WHEN t.revoked_at IS NOT NULL THEN 'revoked' WHEN t.expires_at<now() THEN 'expired' ELSE 'pending' END AS status
           FROM person_transfer t JOIN organization src ON src.id=t.source_organization_id JOIN club_person cp ON cp.id=t.source_profile_id
           LEFT JOIN organization dst ON dst.id=t.target_organization_id
          WHERE src.federation_id=$1 OR dst.federation_id=$1 ORDER BY t.expires_at DESC LIMIT 300`,
        [fed],
      )
    ).rows;
    return {
      organization_id: fed,
      season: seasonOf(brusselsToday()).label,
      can: { manage },
      licenses,
      classifications,
      transfers,
    };
  });
}

export async function federationLicensesExecute(
  db: Pool,
  p: Principal,
  command: FederationCommand,
  expected: string,
) {
  return federationScope(
    db,
    p,
    true,
    async (c, fed) => {
      if (command.action === "decideLicenses") {
        const rows = (
          await c.query(
            "SELECT id,season,organization_id FROM license WHERE id=ANY($1::uuid[]) AND federation_id=$2 AND status='requested' ORDER BY requested_at FOR UPDATE",
            [command.ids, fed],
          )
        ).rows as { id: string; season: string; organization_id: string }[];
        if (!rows.length) throw new AccessError("NOT_FOUND", 404);
        // Serialises numbering for the federation (the organization row is already locked).
        for (const r of rows) {
          let number: string | null = null;
          if (command.decision === "active") {
            const used = (
              await c.query(
                "SELECT count(*)::int AS n FROM license WHERE federation_id=$1 AND season=$2 AND number IS NOT NULL",
                [fed, r.season],
              )
            ).rows[0].n as number;
            number = licenseNumber(r.season, used + 1);
          }
          await c.query(
            "UPDATE license SET status=$2,number=COALESCE($3,number),note=$4,decided_by=$5,decided_at=now() WHERE id=$1",
            [r.id, command.decision, number, command.note, p.userId],
          );
        }
        for (const club of [...new Set(rows.map((r) => r.organization_id))])
          await notify(c, {
            organizationId: club,
            roles: ["club_president"],
            person: String(
              rows.filter((r) => r.organization_id === club).length,
            ),
            status: command.decision,
            path: "/licenses",
            key:
              club +
              ":" +
              rows[0].season +
              ":" +
              command.decision +
              ":" +
              rows.length,
          });
        await audit(c, fed, p.userId, "license." + command.decision, fed);
        return { ok: true as const, count: rows.length };
      }
      if (command.action === "suspendLicense") {
        const row = (
          await c.query(
            "UPDATE license SET status='suspended',note=$3,decided_by=$4,decided_at=now() WHERE id=$1 AND federation_id=$2 AND status='active' RETURNING organization_id",
            [command.id, fed, command.note, p.userId],
          )
        ).rows[0];
        if (!row) throw new AccessError("NOT_FOUND", 404);
        await notify(c, {
          organizationId: row.organization_id,
          roles: ["club_president"],
          person: "1",
          status: "suspended",
          path: "/licenses",
          key: command.id,
        });
        await audit(c, fed, p.userId, "license.suspend", command.id);
        return { ok: true as const };
      }
      if (command.decision === "validated" && !command.classification)
        throw new AccessError("INVALID_INPUT", 400);
      const row = (
        await c.query(
          `UPDATE player_sport_profile sp SET classification_status=$2,classification=COALESCE($3,sp.classification),
                  classification_valid_until=CASE WHEN $2='validated' THEN $4::date ELSE sp.classification_valid_until END,
                  classification_note=$5,classification_checked_by=$6,classification_checked_at=now(),version=version+1
            FROM organization o WHERE o.id=sp.organization_id AND o.federation_id=$7 AND sp.profile_id=$1 AND sp.classification_status='requested'
            RETURNING sp.organization_id`,
          [
            command.profileId,
            command.decision,
            command.decision === "validated" ? command.classification : null,
            command.validUntil,
            command.note,
            p.userId,
            fed,
          ],
        )
      ).rows[0];
      if (!row) throw new AccessError("NOT_FOUND", 404);
      const name = (
        await c.query("SELECT full_name FROM club_person WHERE id=$1", [
          command.profileId,
        ])
      ).rows[0].full_name;
      await notify(c, {
        organizationId: row.organization_id,
        roles: ["club_president"],
        person: name,
        status: command.decision === "validated" ? "validated" : "refused",
        path: `/players/${command.profileId}`,
        key: command.profileId + ":classification",
      });
      await audit(
        c,
        fed,
        p.userId,
        "classification." + command.decision,
        command.profileId,
      );
      return { ok: true as const };
    },
    expected,
  );
}
