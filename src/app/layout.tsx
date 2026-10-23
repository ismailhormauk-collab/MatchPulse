import type { Metadata } from "next";
import { Barlow_Condensed, Geist, Geist_Mono } from "next/font/google";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { themeBootScript } from "@/lib/preferences";
import { indexingAllowed, SITE_DESCRIPTION, SITE_NAME, siteUrl } from "@/lib/site";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const barlowCondensed = Barlow_Condensed({
  variable: "--font-barlow-condensed",
  subsets: ["latin"],
  weight: ["600", "700"],
});

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  applicationName: SITE_NAME,
  title: {
    default: "MatchPulse — Football scores, fixtures and standings",
    template: "%s · MatchPulse",
  },
  description: SITE_DESCRIPTION,
  ...(indexingAllowed() ? {} : { robots: { index: false, follow: true } }),
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // data-theme is the server default; the boot script swaps in the saved
    // theme before first paint, hence suppressHydrationWarning on <html>.
    <html
      lang="en"
      data-theme="dark"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${barlowCondensed.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="flex min-h-full flex-col bg-bg font-sans text-ink">
        <a
          href="#content"
          className="sr-only z-50 rounded-md bg-pulse px-3 py-2 text-sm font-semibold text-on-pulse focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          Skip to content
        </a>
        <Header />
        <main id="content" className="mx-auto w-full max-w-7xl flex-1 px-4 pb-12 pt-5 sm:px-6">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
