import type { NextConfig } from "next";
import { previewRedirects, previewSettings } from "./src/lib/preview";
import { pageHeaders, widgetHeaders } from "./src/lib/security-headers";
const config: NextConfig = {
  poweredByHeader: false,
  // Vercel previews: the branch address, inlined at build time (src/lib/preview.ts).
  env: previewSettings(process.env),
  async redirects() {
    return previewRedirects(process.env);
  },
  // `npm run dev` inside GitHub Codespaces is served through *.app.github.dev.
  allowedDevOrigins: ["*.app.github.dev"],
  distDir: process.env.PFM_BUILD_DIR ?? ".next",
  async headers() {
    return [
      {
        source: "/:locale/registration-widget/:id",
        headers: [...widgetHeaders],
      },
      {
        source: "/:locale/hall-of-fame-widget/:id",
        headers: [...widgetHeaders],
      },
      {
        source:
          "/:path((?!fr/registration-widget/|nl/registration-widget/|en/registration-widget/|fr/hall-of-fame-widget/|nl/hall-of-fame-widget/|en/hall-of-fame-widget/).*)",
        // B2: HSTS and a CSP that closes framing, plugins and foreign form targets.
        headers: [...pageHeaders],
      },
    ];
  },
};
export default config;
