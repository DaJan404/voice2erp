import type { Metadata } from "next";
import { IBM_Plex_Mono, Instrument_Sans } from "next/font/google";
import "./globals.css";

const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const themeScript = [
  "(() => {",
  "  try {",
  '    const saved = localStorage.getItem("voice2erp-theme");',
  "    const theme =",
  '      saved === "light" || saved === "dark"',
  "        ? saved",
  '        : window.matchMedia("(prefers-color-scheme: dark)").matches',
  '          ? "dark"',
  '          : "light";',
  "    document.documentElement.dataset.theme = theme;",
  "  } catch {",
  '    document.documentElement.dataset.theme = "dark";',
  "  }",
  "})();",
].join("\n");

export const metadata: Metadata = {
  title: "VOICE2ERP | Live voice operations for Business Central",
  description:
    "Talk to Microsoft Dynamics 365 Business Central and verify every ERP answer against live source data.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={instrumentSans.variable + " " + ibmPlexMono.variable}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
