import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { bottomNav, menuGroups, type Workspace } from "../src/components/menu";
import { permissions } from "../src/domains/access/policy";
import { optionalModules, moduleOfPath } from "../src/domains/access/rights";
import { homeCopy } from "../src/components/home-copy";

/** 22 and 24: « Tâches » for everyone who can receive one; the messaging gone. */
function workspace(role: "player" | "guardian" | "coach" | "referee" | "federation_worker" | "club_president", kind: "club" | "federation" = "club"): Workspace {
  return {
    user: { name: "X" },
    contexts: [{ id: "m", name: "Org", role }],
    profiles: [],
    selected: { id: "m", organization_id: "o", organization_name: "Org", kind, logo_version: null },
    permissions: permissions(role, []),
  };
}
const routes = (w: Workspace) => menuGroups(w).flatMap((g) => g.items.map((i) => i.route));

describe("tasks in every menu", () => {
  it("gives « Tâches » to players, parents, coaches, referees and federation workers", () => {
    for (const w of [workspace("player"), workspace("guardian"), workspace("coach"), workspace("referee", "federation"), workspace("federation_worker", "federation"), workspace("club_president")])
      expect(routes(w), w.contexts[0].role).toContain("/tasks");
  });
  it("puts « Tâches » in the phone's bar when a task is open", () => {
    const player = workspace("player");
    expect(bottomNav(player).map((i) => i.route)).not.toContain("/tasks");
    const withTask = bottomNav(player, 2).map((i) => i.route);
    expect(withTask).toContain("/tasks");
    expect(withTask).toHaveLength(4);
  });
  it("sends every reminder to a page of the recipient's menu", () => {
    // Players and parents receive tasks, documents, dues and invitations; coaches tasks and the calendar.
    for (const role of ["player", "guardian"] as const) for (const r of ["/tasks", "/documents", "/dues", "/calendar", "/players"]) expect(routes(workspace(role)), `${role} ${r}`).toContain(r);
    for (const r of ["/tasks", "/calendar", "/documents"]) expect(routes(workspace("coach")), `coach ${r}`).toContain(r);
    for (const r of ["/tasks", "/calendar"]) expect(routes(workspace("referee", "federation")), `referee ${r}`).toContain(r);
    // The paths written in the reminders.
    const sources = ["src/domains/funding/service.ts", "src/domains/tasks/sources.ts", "src/domains/dues/service.ts"].filter(existsSync).map((f) => readFileSync(f, "utf8")).join("\n");
    for (const m of sources.matchAll(/path: `\/(tasks|players|dues|documents|calendar)/g)) expect(["tasks", "players", "dues", "documents", "calendar"]).toContain(m[1]);
  });
  it("counts the open tasks given to me, late ones apart", () => {
    const shell = readFileSync("src/components/app-shell.tsx", "utf8");
    expect(shell).toContain('fetch("/api/tasks?count=mine"');
    expect(shell).toContain("bottomNav(state, myTasks.open)");
    expect(readFileSync("src/domains/tasks/service.ts", "utf8")).toContain("export async function myTaskCount");
  });
});

describe("the messaging is gone", () => {
  const files = (dir: string): string[] => readdirSync(dir).flatMap((n) => (statSync(`${dir}/${n}`).isDirectory() ? files(`${dir}/${n}`) : [`${dir}/${n}`]));
  it("leaves no code of it, outside the redirect, and drops its tables", () => {
    const kept = ["src/app/[locale]/messages/page.tsx"];
    for (const f of [...files("src"), ...files("scripts")]) {
      if (kept.includes(f)) continue;
      const text = readFileSync(f, "utf8");
      expect(text, f).not.toMatch(/internal_message|message_thread|message_participant|message_report|domains\/messages|messages-copy|messageHide|"\/messages"|\/api\/messages\b/);
    }
    expect(existsSync("src/domains/messages")).toBe(false);
    expect(existsSync("src/app/api/messages")).toBe(false);
    expect(existsSync("src/domains/messaging-archive")).toBe(false);
    expect(readFileSync("db/migrations/0080_messaging_dropped.sql", "utf8")).toContain("DROP TABLE IF EXISTS internal_message;");
  });
  it("keeps the club's Communication under its own module", () => {
    expect(optionalModules).toContain("communication");
    expect(optionalModules as readonly string[]).not.toContain("messages");
    expect(moduleOfPath("/communication")).toBe("communication");
    expect(moduleOfPath("/api/communication")).toBe("communication");
    expect(readFileSync("src/app/api/communication/route.ts", "utf8")).not.toContain('"messages"');
    const sql = readFileSync("db/migrations/0079_messaging_retired.sql", "utf8");
    expect(sql).toContain("array_replace(disabled_modules, 'messages', 'communication')");
  });
  it("sends an old link home with a short word in three languages", () => {
    expect(readFileSync("src/app/[locale]/messages/page.tsx", "utf8")).toContain("redirect(`/${locale}?info=messagerie`)");
    for (const l of ["fr", "nl", "en"] as const) expect(homeCopy[l].messagingRemoved.length).toBeGreaterThan(20);
    expect(JSON.stringify(homeCopy)).not.toMatch(/[–—]/);
  });
});
