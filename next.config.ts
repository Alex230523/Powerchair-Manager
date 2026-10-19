import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  // `npm run dev` inside GitHub Codespaces is served through *.app.github.dev.
  allowedDevOrigins: ["*.app.github.dev"],
  distDir: process.env.PFM_BUILD_DIR ?? ".next",
  async headers() {
    return [
      {
        source: "/:locale/registration-widget/:id",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors *" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
      {
        source:
          "/:path((?!fr/registration-widget/|nl/registration-widget/|en/registration-widget/).*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};
export default config;
