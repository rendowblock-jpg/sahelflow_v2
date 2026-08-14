import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { IBM_Plex_Sans_Arabic, Inter } from "next/font/google";
import "./globals.css";
import "./phase5.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";
import { UpdateChecker } from "@/components/updater/update-checker";
import { getDirection, type Locale } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n-server";
import { ServerLocaleProvider } from "@/lib/i18n/server-locale-context";
import { NuqsAdapter } from "nuqs/adapters/next/app";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

// Product-grade Arabic UI family: compact enough for dense operational tables,
// highly legible at navigation/control sizes, and visually compatible with Inter.
const arabicSans = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-arabic",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: "SahelFlow",
    description: t("metadata.description"),
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: "SahelFlow",
    },
    icons: {
      icon: [
        { url: "/icons/icon-1024.png", sizes: "192x192", type: "image/png" },
        { url: "/icons/icon-1024.png", sizes: "512x512", type: "image/png" },
        { url: "/icons/icon.svg", sizes: "any", type: "image/svg+xml" },
      ],
      apple: "/icons/icon-1024.png",
      shortcut: "/icons/icon-1024.png",
    },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0f9d58" },
    { media: "(prefers-color-scheme: dark)", color: "#10b981" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const localeCookie = cookieStore.get("sahelflow-locale")?.value;
  const validLocales: readonly string[] = ["ar", "fr", "en"];
  const locale: Locale =
    localeCookie && validLocales.includes(localeCookie)
      ? (localeCookie as Locale)
      : "fr";
  const dir = getDirection(locale);

  return (
    <html lang={locale} dir={dir} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            // Storage is only persistence, never a prerequisite for a coherent
            // first paint. Defaults still apply when a WebView denies localStorage.
            __html: `(function(){var t='dark',p='sahel';try{var st=localStorage.getItem('theme');if(st==='light'||st==='dark'||st==='system')t=st;var sp=localStorage.getItem('sahelflow-theme-preset');if(sp==='atlas'||sp==='oasis'||sp==='dune')p=sp;}catch(e){}try{var d=window.matchMedia('(prefers-color-scheme: dark)').matches;var r=t==='system'?(d?'dark':'light'):t;var e=document.documentElement;e.classList.remove('light','dark');e.classList.add(r);e.dataset.colorMode=r;e.dataset.themePreset=p;e.style.colorScheme=r;}catch(e){}})();`,
          }}
        />
      </head>
      <body
        className={`${inter.variable} ${arabicSans.variable} font-sans antialiased`}
      >
        <NuqsAdapter>
          <ServerLocaleProvider locale={locale}>
            <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
              <TooltipProvider delayDuration={300}>
                {children}
                <ServiceWorkerRegister />
                <UpdateChecker />
                <Toaster
                  initialDirection={dir}
                  richColors
                  closeButton
                  toastOptions={{ className: "shadow-popover" }}
                />
              </TooltipProvider>
            </ThemeProvider>
          </ServerLocaleProvider>
        </NuqsAdapter>
      </body>
    </html>
  );
}
