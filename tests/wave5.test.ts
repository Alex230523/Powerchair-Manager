import { beforeEach, describe, expect, it } from "vitest";
import {
  clearOfflineData,
  flushMarks,
  loadSnapshot,
  pendingMarks,
  queueMark,
  saveSnapshot,
} from "../src/lib/offline-queue";

// A minimal browser storage, enough for the offline attendance queue.
const store = new Map<string, string>();
Object.assign(globalThis, {
  window: {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  },
});

describe("offline attendance queue", () => {
  beforeEach(() => store.clear());

  it("keeps only the latest mark per invitation", () => {
    queueMark("a", { action: "mark", status: "absent" });
    queueMark("b", { action: "mark", status: "present" });
    expect(queueMark("a", { action: "mark", status: "present" })).toBe(2);
    expect(pendingMarks().map((m) => [m.key, m.body.status])).toEqual([
      ["b", "present"],
      ["a", "present"],
    ]);
  });

  it("sends marks, drops refusals and keeps them while offline", async () => {
    queueMark("a", { n: 1 });
    queueMark("b", { n: 2 });
    queueMark("c", { n: 3 });
    const offline = await flushMarks(() => Promise.reject(new TypeError("offline")));
    expect(offline).toEqual({ sent: 0, refused: 0, left: 3 });
    let call = 0;
    const result = await flushMarks(() =>
      Promise.resolve(new Response("{}", { status: ++call === 2 ? 409 : 200 })),
    );
    expect(result).toEqual({ sent: 2, refused: 1, left: 0 });
  });

  it("serves the snapshot for the same filter during 24 hours only", () => {
    saveSnapshot("week", { rows: 1 });
    expect(loadSnapshot("week")?.data).toEqual({ rows: 1 });
    expect(loadSnapshot("month")).toBeNull();
    const old = JSON.parse(store.get("pfm-attendance-snapshot")!);
    old.savedAt -= 25 * 3600 * 1000;
    store.set("pfm-attendance-snapshot", JSON.stringify(old));
    expect(loadSnapshot("week")).toBeNull();
  });

  it("clears everything at sign-out", () => {
    queueMark("a", {});
    saveSnapshot("week", {});
    clearOfflineData();
    expect(store.size).toBe(0);
  });
});
