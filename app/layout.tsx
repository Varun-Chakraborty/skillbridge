import type { Metadata } from "next";
import { Space_Grotesk, DM_Sans } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SkillBridge — Student Opportunity Hub",
  description: "Discover verified internships, hackathons, workshops, and collaborators matched to your skills.",
};

/**
 * Runs before first paint, so the stored theme is already on <html> by the time
 * anything renders. Without this the page would paint light and then flip to
 * dark once React mounted, which is a visible flash on every navigation.
 *
 * Deliberately dependency-free and wrapped in try/catch: it runs before the
 * bundle exists, so a throw here would be an unhandled error in the document.
 * It mirrors `apply()` in components/theme-provider.tsx — the two must agree.
 */
const THEME_SCRIPT = `(function(){try{var k='skillbridge-theme';var s=localStorage.getItem(k);var t=(s==='light'||s==='dark')?s:'system';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var e=document.documentElement;e.classList.toggle('dark',d);e.style.colorScheme=d?'dark':'light';}catch(_){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      // The theme script writes to className on <html>, which React cannot know
      // about during hydration.
      suppressHydrationWarning
      className={`${spaceGrotesk.variable} ${dmSans.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}