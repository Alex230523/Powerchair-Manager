import type { Metadata, Viewport } from "next";
import { AppShell, themeScript } from "@/components/app-shell";
import { notFound } from "next/navigation";
import { copy, isLocale } from "@/lib/locale";
import "../globals.css";
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
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf8f5" },
    { media: "(prefers-color-scheme: dark)", color: "#110f0e" },
  ],
  width: "device-width",
  initialScale: 1,
};
export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    // The theme script may set data-theme before hydration.
    <html lang={locale} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <a className="skip" href="#main">
          {copy[locale].skip}
        </a>
        <AppShell locale={locale}>{children}</AppShell>
      </body>
    </html>
  );
}
