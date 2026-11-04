import { describe, expect, it, beforeEach } from "vitest";
import { flushActions, loadSideline, pendingActions, popAction, queueAction, saveSideline } from "../src/lib/offline-queue";
import { liveKinds, tally, teamKinds } from "../src/domains/competitions/journey";
import { sidelineCopy } from "../src/components/sideline-copy";

/** 14: the waiting line of the pitch side: in order, a refusal never blocks, the last one taken back; the assist counted. */
const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as unknown as { window: unknown }).window = { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) } };
});
const ok = (status: number) => ({ ok: status < 400, status }) as Response;

describe("pitch side", () => {
  it("sends the actions in their order, tells a refusal and goes on", async () => {
    queueAction({ key: "a", matchId: "m", label: "Présence Ana", body: { n: 1 } });
    queueAction({ key: "b", matchId: "m", label: "But Ben", body: { n: 2 } });
    queueAction({ key: "c", matchId: "m", label: "Carton Cléo", body: { n: 3 } });
    queueAction({ key: "z", matchId: "other", label: "Autre match", body: { n: 9 } });
    const seen: number[] = [];
    const r = await flushActions("m", async (b) => {
      seen.push(b.n as number);
      return ok(b.n === 2 ? 409 : 200);
    });
    expect(seen).toEqual([1, 2, 3]);
    expect(r).toEqual({ sent: 2, refused: ["But Ben"], left: 0 });
    expect(pendingActions().map((a) => a.key)).toEqual(["z"]);
  });
  it("keeps the rest when the network fails, and takes back the last action", async () => {
    queueAction({ key: "a", matchId: "m", label: "1", body: { n: 1 } });
    queueAction({ key: "b", matchId: "m", label: "2", body: { n: 2 } });
    const r = await flushActions("m", async () => {
      throw new TypeError("offline");
    });
    expect(r.left).toBe(2);
    expect(popAction("m")?.key).toBe("b");
    expect(pendingActions("m").map((a) => a.key)).toEqual(["a"]);
  });
  it("keeps the match's data on the device for the day", () => {
    saveSideline("m", { players: [{ id: "p" }] });
    expect(loadSideline<{ players: unknown[] }>("m")?.players).toHaveLength(1);
    expect(loadSideline("other")).toBeNull();
  });
  it("counts the assist, and lets the goal against and the timeout name nobody", () => {
    expect(liveKinds).toContain("assist");
    // 04/11/2026: corners, ours and theirs, name nobody either.
    expect([...teamKinds]).toEqual(["goal_against", "timeout", "corner", "corner_against"]);
    const t = tally([
      { kind: "goal", profile_id: "a", cancelled_at: null },
      { kind: "assist", profile_id: "b", cancelled_at: null },
      { kind: "goal_against", profile_id: null, cancelled_at: null },
      { kind: "timeout", profile_id: null, cancelled_at: null },
      { kind: "goal", profile_id: "a", cancelled_at: "2026-11-02" },
    ]);
    expect({ ours: t.ours, theirs: t.theirs }).toEqual({ ours: 1, theirs: 1 });
    expect(t.per.get("b")).toMatchObject({ assists: 1, goals: 0 });
  });
  it("has the same words in the three languages, no long dash, no banned word", () => {
    const keys = (o: object): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? keys(v).map((x) => `${k}.${x}`) : [k])).sort();
    expect(keys(sidelineCopy.nl)).toEqual(keys(sidelineCopy.fr));
    expect(keys(sidelineCopy.en)).toEqual(keys(sidelineCopy.fr));
    expect(JSON.stringify(sidelineCopy)).not.toMatch(/[–—]|convoqu|opgeroep|summon|call-up/i);
  });
});
