import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { previewRedirects, previewSettings } from "../src/lib/preview";

/** Vercel previews: one public address per branch, nothing outside a preview, no public demo password online. */
const preview = { VERCEL_ENV: "preview", VERCEL_URL: "pfm-abc123.vercel.app", VERCEL_BRANCH_URL: "pfm-git-feature.vercel.app" };

describe("preview address", () => {
  it("uses the branch address, and the project's own address when set", () => {
    expect(previewSettings(preview)).toEqual({ BETTER_AUTH_URL: "https://pfm-git-feature.vercel.app" });
    expect(previewSettings({ ...preview, VERCEL_BRANCH_URL: undefined })).toEqual({ BETTER_AUTH_URL: "https://pfm-abc123.vercel.app" });
    expect(previewSettings({ ...preview, BETTER_AUTH_URL: "https://demo.example" })).toEqual({});
  });
  it("changes nothing outside a preview, and no security setting", () => {
    expect(previewSettings({ ...preview, VERCEL_ENV: "production" })).toEqual({});
    expect(previewSettings({})).toEqual({});
    expect(previewRedirects({ ...preview, VERCEL_ENV: "production" })).toEqual([]);
    expect(Object.keys(previewSettings(preview))).toEqual(["BETTER_AUTH_URL"]);
  });
  it("sends the address of one deployment to the branch address", () => {
    expect(previewRedirects(preview)).toEqual([
      { source: "/:path*", has: [{ type: "host", value: "pfm-abc123.vercel.app" }], destination: "https://pfm-git-feature.vercel.app/:path*", permanent: false },
    ]);
    expect(previewRedirects({ ...preview, VERCEL_BRANCH_URL: undefined })).toEqual([]);
  });
});

describe("build and demo accounts", () => {
  const build = readFileSync("scripts/vercel-build.mjs", "utf8"),
    seed = readFileSync("scripts/demo-seed.ts", "utf8"),
    vercel = JSON.parse(readFileSync("vercel.json", "utf8"));
  it("builds previews only and skips production", () => {
    expect(build).toContain('env !== "preview"');
    // The build must not receive the address computed for the seed, or next.config.ts would not inline it.
    expect(build).toContain('run("npx", ["next", "build"], process.env);');
    expect(vercel.buildCommand).toBe("node scripts/vercel-build.mjs");
    expect(vercel.ignoreCommand).toContain('"$VERCEL_ENV" = "production"');
  });
  it("requires the project's own demo password online and never prints it", () => {
    expect(build).toContain('"PFM_DEMO_PASSWORD"');
    expect(seed).toContain("process.env.VERCEL_ENV && (!ownPassword || ownPassword.length < 12)");
    expect(seed).toContain("celui de PFM_DEMO_PASSWORD");
    expect(seed).toContain('throw new Error("Refusing to create public demo accounts in production.")');
    // Production mode accepts only the project's own password; a Vercel production deployment never.
    expect(seed).toContain('process.env.NODE_ENV === "production" && !ownPassword && !process.argv.includes("--force")');
    expect(seed).toContain('if (process.env.VERCEL_ENV === "production")');
  });
  it("gives the existing demo accounts a new PFM_DEMO_PASSWORD, and only them", () => {
    expect(seed).toContain("existe déjà.`);\n    await alignPasswords();");
    const align = seed.slice(seed.indexOf("async function alignPasswords"), seed.indexOf("function printAccounts"));
    expect(align).toContain("if (!ownPassword) return;");
    expect(align).toContain("[...accounts, federationAccount, refereeAccount].map((a) => a.email)");
    expect(align).toContain("lower(u.email)=ANY($1::text[])");
    expect(align).toContain("context.password.verify({ hash: r.password, password: DEMO_PASSWORD })");
  });
});
