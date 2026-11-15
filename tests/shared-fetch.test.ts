import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/** 13/11/2026, responsiveness: shared reads, a signal after each change, no read in a loop. */
describe("shared reads and the change signal", () => {
  it("reads a URL once while fresh, again after a change; tells the page what changed", async () => {
    let calls = 0;
    const events: string[][] = [];
    const g = globalThis as unknown as Record<string, unknown>;
    const fakeFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls++;
      void input;
      return new Response(JSON.stringify({ n: calls, method: init?.method ?? "GET" }), { status: 200 });
    };
    g.window = {
      location: { href: "http://local/fr", origin: "http://local" },
      fetch: fakeFetch,
      dispatchEvent: (e: Event) => events.push((e as CustomEvent<{ paths: string[] }>).detail.paths),
    };
    g.fetch = (i: RequestInfo | URL, init?: RequestInit) => (g.window as { fetch: typeof fakeFetch }).fetch(i, init);
    g.CustomEvent = class extends Event {
      detail: unknown;
      constructor(type: string, o: { detail: unknown }) {
        super(type);
        this.detail = o.detail;
      }
    };
    const { sharedFetch, installChangeSignal } = await import("../src/lib/shared-fetch");
    installChangeSignal();
    const a = await (await sharedFetch("/api/dashboard", 60000)).json();
    const b = await (await sharedFetch("/api/dashboard", 60000)).json();
    expect(a).toEqual(b);
    expect(calls).toBe(1);
    // A change: the shared read is dropped, the signal names the path, once for a burst.
    await (g.window as { fetch: typeof fakeFetch }).fetch("/api/tasks", { method: "POST" });
    await (g.window as { fetch: typeof fakeFetch }).fetch("/api/tasks", { method: "POST" });
    await (g.window as { fetch: typeof fakeFetch }).fetch("/api/news", { method: "POST" });
    await new Promise((r) => setTimeout(r, 300));
    expect(events).toEqual([["/api/tasks"]]);
    await sharedFetch("/api/dashboard", 60000);
    expect(calls).toBe(5);
  });

  it("keeps the menu's read brief and the views out of a loop", () => {
    const shell = readFileSync("src/components/app-shell.tsx", "utf8");
    expect(shell).toContain('sharedFetch("/api/workspace?brief=1"');
    expect(shell).not.toMatch(/fetch\("\/api\/dashboard", \{ cache: "no-store" \}\)/);
    const api = readFileSync("src/components/use-api.tsx", "utf8");
    expect(api).toMatch(/\}, \[url\]\);\n  return \{ data, error, setError, denied, reload \};/);
    expect(readFileSync("src/components/home.tsx", "utf8")).toContain('only: "week"');
  });
});
