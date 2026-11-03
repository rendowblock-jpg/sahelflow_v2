import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import localFont from "next/font/local";
import "./globals.css";
import "./phase5.css";
import "./product-system.css";
import "./responsive-system.css";
import "./workspace-system.css";
import "./theme-preset-system.css";
import "./arabic-system.css";
import "./motion-system.css";
import "./experience-system.css";
import "./locale-transition-system.css";
import "./storefront-system.css";
import "./automation-system.css";
import { AppDirectionProvider } from "@/components/i18n/app-direction-provider";
import { DesktopResumeRecovery } from "@/components/runtime/desktop-resume-recovery";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import {
  ThemeProvider,
  type ThemeMode,
  type ThemePreset,
} from "@/components/theme-provider";
import {
  appearanceBootstrapScript,
  resolvePreset,
} from "@/lib/appearance/preset";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";
import { UpdateChecker } from "@/components/updater/update-checker";
import { getDirection } from "@/lib/i18n";
import { getI18n, resolveSellerLocale } from "@/lib/i18n-server";
import { ServerLocaleProvider } from "@/lib/i18n/server-locale-context";
import { NuqsAdapter } from "nuqs/adapters/next/app";

// Both faces are files in the repository (src/app/fonts, SIL OFL 1.1 texts in src-tauri/licenses), not a download:
// next/font/google asked fonts.googleapis.com at every dev-server start and every build, and when that request failed
// in CI the whole page answered with a module error (register NEW-CI-FONT-FLAKE).
const inter = localFont({
  src: "./fonts/inter-latin-wght-normal.woff2",
  weight: "100 900",
  variable: "--font-inter",
  display: "swap",
});

// Noto Sans Arabic is the application's Arabic face: neutral and highly legible. The Arabic
// stack stays sans-serif all the way through fallback so a packaged font failure cannot drop
// the workbench into editorial type.
const arabicSans = localFont({
  src: "./fonts/noto-sans-arabic-arabic-wght-normal.woff2",
  weight: "100 900",
  variable: "--font-arabic",
  display: "swap",
});

function validTheme(value: string | undefined): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
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
  const headerStore = await headers();
  // Locale precedence: explicit `sahelflow-locale` cookie > Accept-Language
  // first-run detection (same q-weighted parser + ar > fr > en market
  // priority as the buyer-facing storefront) > French default. Detection
  // never persists a cookie — ServerLocaleProvider reconciles the client
  // mirror to this resolved locale on every RSC commit, so the dashboard
  // respects the detected language on first paint without a durable write.
  const locale = resolveSellerLocale({
    cookieValue: cookieStore.get("sahelflow-locale")?.value,
    acceptLanguage: headerStore.get("accept-language"),
  });
  const dir = getDirection(locale);

  const themeCookie = cookieStore.get("sahelflow-theme")?.value;
  const presetCookie = cookieStore.get("sahelflow-theme-preset")?.value;
  const hasThemeCookie = validTheme(themeCookie);
  const initialTheme: ThemeMode = hasThemeCookie ? themeCookie : "dark";
  const initialPreset: ThemePreset = resolvePreset({ presetCookie });
  const appearanceBootstrap = appearanceBootstrapScript({
    theme: initialTheme,
    hasThemeCookie,
    presetCookie,
  });

  return (
    <html
      lang={locale}
      dir={dir}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: appearanceBootstrap }} />
      </head>
      <body
        className={`${inter.variable} ${arabicSans.variable} font-sans antialiased`}
      >
        <NuqsAdapter>
          <ServerLocaleProvider locale={locale}>
            <AppDirectionProvider>
              <ThemeProvider
                attribute="class"
                defaultTheme={initialTheme}
                defaultPreset={initialPreset}
                enableSystem
              >
                <TooltipProvider delayDuration={300}>
                  {children}
                  <DesktopResumeRecovery />
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
            </AppDirectionProvider>
          </ServerLocaleProvider>
        </NuqsAdapter>
      </body>
    </html>
  );
}
