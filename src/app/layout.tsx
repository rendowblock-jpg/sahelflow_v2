import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Inter, Amiri } from "next/font/google";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";
import { UpdateChecker } from "@/components/updater/update-checker";
import { getDirection, type Locale } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n-server";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
});

const amiri = Amiri({
  subsets: ["arabic"],
  weight: ["400", "700"],
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
  themeColor: "#0f766e",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5, // allows zoom for accessibility
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Read the locale from the cookie (set by useI18n.setLocale) so the
  // <html lang/dir> attributes are correct on the very first server render.
  // This eliminates the hydration flash for Arabic users (U-005) and
  // improves SEO (search engines see the correct language immediately).
  const cookieStore = await cookies();
  const localeCookie = cookieStore.get("sahelflow-locale")?.value;
  const validLocales: readonly string[] = ["ar", "fr", "en"];
  const locale: Locale = localeCookie && validLocales.includes(localeCookie)
    ? (localeCookie as Locale)
    : "fr"; // French is the business default in Algeria
  const dir = getDirection(locale);

  return (
    <html lang={locale} dir={dir} suppressHydrationWarning>
      <body className={`${inter.variable} ${amiri.variable} font-sans antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <TooltipProvider delayDuration={300}>
            {children}
            <ServiceWorkerRegister />
            <UpdateChecker />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
