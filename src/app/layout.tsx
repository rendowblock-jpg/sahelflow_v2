import type { Metadata } from "next";
import { Inter, Noto_Sans_Arabic } from "next/font/google";
import "./globals.css";
import "./inbox.css";

const inter = Inter({
	subsets: ["latin"],
	variable: "--font-inter",
});

const notoArabic = Noto_Sans_Arabic({
	subsets: ["arabic"],
	variable: "--font-arabic",
	weight: ["400", "600", "700"],
});

export const metadata: Metadata = {
	title: {
		default: "SahelFlow — E-commerce Management for Algeria",
		template: "%s | SahelFlow",
	},
	description:
		"The all-in-one platform for Algerian online sellers. Manage orders, customers, deliveries, and AI-powered automations from one dashboard.",
	keywords: [
		"SahelFlow",
		"Algeria",
		"e-commerce",
		"order management",
		"delivery tracking",
		"AI automation",
		"WhatsApp commerce",
		"COD management",
	],
	metadataBase: new URL(
		process.env.NEXT_PUBLIC_APP_URL || "https://sahelflow.com",
	),
	openGraph: {
		title: "SahelFlow — E-commerce Management for Algeria",
		description:
			"The all-in-one platform for Algerian online sellers. AI-powered order management, WhatsApp automation, and COD tracking.",
		type: "website",
		locale: "en_US",
		siteName: "SahelFlow",
	},
	twitter: {
		card: "summary",
		title: "SahelFlow — E-commerce Management for Algeria",
		description: "AI-powered e-commerce management for Algerian sellers.",
	},
	robots: {
		index: false,
		follow: false,
	},
	icons: {
		icon: "/icon.svg",
		apple: "/logo.svg",
	},
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html suppressHydrationWarning>
			<head>
				<script
					dangerouslySetInnerHTML={{
						__html: `
              (function() {
                try {
                  var theme = localStorage.getItem('sf-theme') || 'dark';
                  document.documentElement.setAttribute('data-theme', theme);
                  var locale = localStorage.getItem('sf-locale') || 'en';
                  document.documentElement.setAttribute('lang', locale);
                  document.documentElement.setAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
                } catch(e) {}
              })();
            `,
					}}
				/>
			</head>
			<body className={`${inter.variable} ${notoArabic.variable}`}>
				{children}
			</body>
		</html>
	);
}
