import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { delegable, federationCompetences, fedCan, isAdmin, permissions, roleAllowed, roles } from "../src/domains/access/policy";
import { errors } from "../src/components/access-copy";

/**
 * Security (07/11/2026), badly defined permissions: what each role holds by
 * itself, what may be handed out and by whom, what a support access may not
 * touch, how long a key or a hook speaks for the club, and who reads the
 * federation's registry. Read on every run, so a change cannot widen a right
 * unseen.
 */
const read = (f: string) => readFileSync(f, "utf8");

describe("badly defined permissions", () => {
  it("gives each role only what it is for", () => {
    const club = permissions("club_president", []),
      federation = permissions("federation_president", []);
    // Managing the mandates is the presidencies' alone, never handed out.
    expect(delegable).not.toContain("mandates.manage");
    for (const r of roles) expect(permissions(r, [...delegable]).includes("mandates.manage"), r).toBe(isAdmin(r));
    // A club's presidency never holds the federation's competences; a federation's never a club's people, money or files.
    expect(club.filter((p) => p.startsWith("federation."))).toEqual([]);
    expect(federation.filter((p) => /^(people\.|dues\.|teams\.|registrations\.|documents\.manage|attendance\.|equipment\.)/.test(p))).toEqual([]);
    // Anyone else holds exactly what was handed to him, and nothing unknown.
    expect(permissions("coach", ["calendar.read", "made.up", "mandates.manage"])).toEqual(["organization.read", "calendar.read"]);
    expect(permissions("player", [])).toEqual(["organization.read"]);
    // The roles stay in their kind of organisation.
    for (const r of ["federation_president", "federation_worker", "referee"] as const) expect(roleAllowed(r, "club"), r).toBe(false);
    for (const r of ["club_president", "coach", "player", "guardian"] as const) expect(roleAllowed(r, "federation"), r).toBe(false);
    // A federation delegate acts in his competences only; a club role never as the federation.
    expect(fedCan("federation_worker", ["federation.finance"], "federation.licences")).toBe(false);
    expect(fedCan("club_president", [...federationCompetences], "federation.licences")).toBe(false);
  });

  it("never lets anyone hand out more than he holds, a staff role included", () => {
    const service = read("src/domains/access/service.ts");
    expect(service).toContain("if (isAdmin(command.role) && !isAdmin(context.role))");
    expect(service).toContain('if (found.rows.some((r) => (r.grants as string[]).some((g) => !mine.includes(g)))) throw new AccessError("FORBIDDEN");');
    expect(service).toMatch(/if \(isAdmin\(target\.role\) \|\| target\.user_id === p\.userId\)\s*throw new AccessError\("FORBIDDEN"\)/);
    const invite = read("src/domains/access/invite.ts");
    expect(invite).toContain("[...invite.grants, ...staffGrants].every((g: Permission) => permissions(r.role, r.grants).includes(g))");
    expect(invite).toContain("JOIN staff_role s ON s.id=ANY(i.staff_role_ids) AND s.organization_id=i.organization_id");
  });

  it("opens a club to a support access, never its mandates, its keys or its money", () => {
    const service = read("src/domains/access/service.ts");
    expect(service).toContain('SELECT 1 FROM platform_borrow WHERE mandate_id=$1 AND ended_at IS NULL');
    // Every change of mandates (invite, resend, cancel, rights, revoke, renew, membership) passes the same door.
    expect(service).toMatch(/requirePermission\(\s*context\.role,\s*context\.grants,\s*permission,[\s\S]{0,80}\);\s*\/\/ Security \(07\/11\/2026\)[^\n]*\n\s*await refuseSupport\(client, context\.id\);/);
    expect(read("src/domains/access/staff-roles.ts")).toContain("if (write) await refuseSupport(c, a.id);");
    expect(read("src/domains/access/presidency.ts")).toContain("if (write) await refuseSupport(c, a.id);");
    const integrations = read("src/domains/integrations/public.ts");
    expect(integrations).toContain('if (cmd.action === "createMcpKey") await refuseSupport(s.c, s.a.id);');
    expect(integrations.match(/case "create(Key|Hook)": \{\n\s*await refuseSupport\(s\.c, s\.a\.id\);/g)).toHaveLength(2);
    expect(read("src/domains/bank/service.ts")).toMatch(/await refuseSupport\(s\.c, s\.mandateId\);\n\s*const iban = cmd\.iban/);
    expect(read("src/domains/club/service.ts")).toContain("COALESCE(iban,'') IS DISTINCT FROM $2\", [a.organization_id, input.iban])).rowCount) await refuseSupport(c, a.id);");
    // Said where it is met: the operator's window, and the error, in the three languages.
    for (const l of ["fr", "nl", "en"] as const) expect((errors.SUPPORT_LIMITED?.[l] ?? "").length, l).toBeGreaterThan(60);
    expect(read("src/components/console-copy.ts").match(/borrowIntro: "[^"]*(ni les mandats|geen mandaten|no mandates)/g)).toHaveLength(3);
  });

  it("lets a key or a hook speak for the club only as long as the presidency that created it", () => {
    const presides = /EXISTS\(SELECT 1 FROM role_assignment r JOIN organization_membership m ON m\.organization_id=r\.organization_id AND m\.user_id=r\.user_id JOIN "user" u ON u\.id=r\.user_id WHERE r\.organization_id=(k|w)\.organization_id AND r\.user_id=(k|w)\.created_by AND r\.role='club_president' AND r\.revoked_at IS NULL AND r\.valid_from<=now\(\) AND \(r\.valid_until IS NULL OR r\.valid_until>now\(\)\) AND m\.active AND u\.active\)/g;
    expect(read("src/domains/integrations/api.ts").match(presides)).toHaveLength(1);
    expect(read("src/domains/integrations/api.ts")).toContain('if (!k.presides) throw new ApiError(403, "KEY_ORPHANED");');
    expect(read("src/domains/integrations/api.ts")).toContain('if (k.suspended_at) throw new ApiError(403, "ORG_SUSPENDED");');
    expect(read("src/domains/mcp/organization.ts").match(presides)).toHaveLength(1);
    // A hook: neither a new event nor one already waiting goes out.
    expect(read("src/domains/integrations/webhooks.ts").match(presides)).toHaveLength(2);
    // A handover revokes the outgoing presidency's keys and switches its hooks off, visibly.
    const invite = read("src/domains/access/invite.ts");
    for (const t of ["UPDATE api_key SET revoked_at=now()", "UPDATE organization_mcp_key SET revoked_at=now()", "UPDATE webhook SET active=false"]) expect(invite).toContain(t);
    expect(read("src/components/public-copy.ts").match(/keysHint: "[^"]*(quittez la présidence|voorzitterschap verlaat|leave the presidency)/g)).toHaveLength(3);
  });

  it("lets only the competences that use it read the federation's registry, and shows it to them only", () => {
    const registry = read("src/domains/classification/registry.ts");
    expect(registry).toContain('(["federation.licences", "federation.classification", "federation.competitions", "federation.discipline"] as const).some((g) => fedCan(a.role, a.grants, g))');
    expect(registry).not.toMatch(/!fedCan\(a\.role, a\.grants\)\)/);
    expect(read("src/components/menu.ts")).toContain('item("/federation/registry", "registry", "medal", fed("federation.licences", "federation.classification", "federation.competitions", "federation.discipline"))');
  });
});
