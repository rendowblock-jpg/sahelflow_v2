import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Inter, Noto_Sans_Arabic } from "next/font/google";
import "./globals.css";
import "./phase5.css";
import "./product-system.css";
import "./responsive-system.css";
import "./workspace-system.css";
import "./settings-system.css";
import "./theme-preset-system.css";
import "./arabic-system.css";
import "./motion-system.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import {
  ThemeProvider,
  type ThemeMode,
  type ThemePreset,
} from "@/components/theme-provider";
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

// Noto Sans Arabic was the original UI convergence authority before Internal.17
// replaced it with IBM Plex Sans Arabic. Restore the neutral, highly legible
// application face and keep the Arabic stack sans-serif all the way through
// fallback so packaged font failure cannot drop the workbench into editorial type.
const arabicSans = Noto_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-arabic",
  display: "swap",
});

function validTheme(value: string | undefined): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

function validPreset(value: string | undefined): value is ThemePreset {
  return (
    value === "sahel" ||
    value === "atlas" ||
    value === "oasis" ||
    value === "dune"
  );
}

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
      icon: {
        url: "/icons/sahelflow-mark.png",
        sizes: "512x512",
        type: "image/png",
      },
      apple: "/icons/sahelflow-mark.png",
      shortcut: "/icons/sahelflow-mark.png",
    },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2eee4" },
    { media: "(prefers-color-scheme: dark)", color: "#101728" },
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

  const themeCookie = cookieStore.get("sahelflow-theme")?.value;
  const presetCookie = cookieStore.get("sahelflow-theme-preset")?.value;
  const hasThemeCookie = validTheme(themeCookie);
  const hasPresetCookie = validPreset(presetCookie);
  const initialTheme: ThemeMode = hasThemeCookie ? themeCookie : "dark";
  const initialPreset: ThemePreset = hasPresetCookie ? presetCookie : "sahel";
  const appearanceBootstrap = `(function(){var t=${JSON.stringify(initialTheme)},p=${JSON.stringify(initialPreset)},ht=${hasThemeCookie ? "true" : "false"},hp=${hasPresetCookie ? "true" : "false"};try{if(!ht){var st=localStorage.getItem('theme');if(st==='light'||st==='dark'||st==='system')t=st;}if(!hp){var sp=localStorage.getItem('sahelflow-theme-preset');if(sp==='sahel'||sp==='atlas'||sp==='oasis'||sp==='dune')p=sp;}}catch(e){}try{var d=window.matchMedia('(prefers-color-scheme: dark)').matches;var r=t==='system'?(d?'dark':'light'):t;var e=document.documentElement;e.classList.remove('light','dark');e.classList.add(r);e.dataset.colorMode=r;e.dataset.themePreset=p;e.style.colorScheme=r;}catch(e){}})();`;

  return (
    <html lang={locale} dir={dir} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: appearanceBootstrap }} />
      </head>
      <body
        className={`${inter.variable} ${arabicSans.variable} font-sans antialiased`}
      >
        <NuqsAdapter>
          <ServerLocaleProvider locale={locale}>
            <ThemeProvider
              attribute="class"
              defaultTheme={initialTheme}
              defaultPreset={initialPreset}
              enableSystem
            >
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
