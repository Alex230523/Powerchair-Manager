import type { Metadata, Viewport } from "next";
import { AppShell, themeScript } from "@/components/app-shell";
import { OfflineSupport } from "@/components/offline-support";
import { notFound } from "next/navigation";
import { copy, isLocale } from "@/lib/locale";
import { fontClass } from "../fonts";
import "../globals.css";
// 13/11/2026: the styles added since globals.css reached its budget of 300 kB (same tokens, loaded after it).
import "../pages.css";
import { paletteColor, sessionAppearance, sessionShell } from "@/lib/appearance";
import { scriptNonce } from "@/lib/nonce";
export const metadata: Metadata = {
  title: "Powerchair Football Manager",
  applicationName: "Powerchair Football Manager",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  appleWebApp: { capable: true, title: "PFM", statusBarStyle: "default" },
};
/** The browser's bar follows the club's primary colour (prompt 2.9); dark keeps the dark background. */
export async function generateViewport(): Promise<Viewport> {
  const { palette } = await sessionAppearance();
  return {
    themeColor: [
      { media: "(prefers-color-scheme: light)", color: paletteColor[palette] },
      { media: "(prefers-color-scheme: dark)", color: "#10151c" },
    ],
    width: "device-width",
    initialScale: 1,
  };
}
export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  // The club's palette and tint are on <html> from the first paint (prompt 2.9).
  const {
    appearance: { palette, tint },
    signedIn,
  } = await sessionShell();
  const nonce = await scriptNonce();
  return (
    // The theme script may set data-theme before hydration.
    <html lang={locale} className={fontClass} data-palette={palette === "night" ? undefined : palette} data-tint={tint === "light" ? undefined : tint} suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <a className="skip" href="#main">
          {copy[locale].skip}
        </a>
        <AppShell locale={locale} signedIn={signedIn}>
          {children}
        </AppShell>
        <OfflineSupport />
      </body>
    </html>
  );
}
