/**
 * Vercel preview deployments (one per branch and pull request).
 *
 * The application has one public address (BETTER_AUTH_URL): sessions,
 * origin checks and links in messages all use it. A preview gets its address
 * from Vercel: the branch address, which stays the same from one push to the
 * next. The address of each single deployment redirects to it, so a single
 * origin is ever accepted.
 *
 * Nothing here applies outside a Vercel preview, and nothing here changes a
 * security setting: those stay explicit project variables.
 */
type Env = Record<string, string | undefined>;

export function isPreview(env: Env) {
  return env.VERCEL_ENV === "preview";
}

/** The public address of a preview, when the project does not set one itself. */
export function previewSettings(env: Env): Record<string, string> {
  if (!isPreview(env) || env.BETTER_AUTH_URL) return {};
  const host = env.VERCEL_BRANCH_URL || env.VERCEL_URL;
  return host ? { BETTER_AUTH_URL: "https://" + host } : {};
}

/** The address of this very deployment sends to the branch address. */
export function previewRedirects(env: Env) {
  if (!isPreview(env) || !env.VERCEL_URL || !env.VERCEL_BRANCH_URL || env.VERCEL_URL === env.VERCEL_BRANCH_URL) return [];
  return [
    {
      source: "/:path*",
      has: [{ type: "host" as const, value: env.VERCEL_URL }],
      destination: `https://${env.VERCEL_BRANCH_URL}/:path*`,
      permanent: false,
    },
  ];
}
