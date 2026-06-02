"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import Link from "next/link";

// Phase 6.1: Global error boundary — i18n-safe text.
// This component renders outside the React tree (no provider access),
// so we read locale from localStorage directly and use a minimal lookup.
const ERROR_MESSAGES = {
	ar: {
		somethingWrong: "حدث خطأ ما",
		tryAgain: "إعادة المحاولة",
		goHome: "الصفحة الرئيسية",
	},
	fr: {
		somethingWrong: "Une erreur est survenue",
		tryAgain: "Réessayer",
		goHome: "Accueil",
	},
	en: {
		somethingWrong: "Something went wrong",
		tryAgain: "Try Again",
		goHome: "Go Home",
	},
} as const;

type SupportedLocale = keyof typeof ERROR_MESSAGES;

function getErrorMessages() {
	if (typeof window === "undefined") return ERROR_MESSAGES.en;
	const saved = localStorage.getItem("sf-locale") as SupportedLocale | null;
	const locale = saved && saved in ERROR_MESSAGES ? saved : "en";
	return ERROR_MESSAGES[locale];
}

export default function GlobalError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	useEffect(() => {
		Sentry.captureException(error);
	}, [error]);

	const msgs = getErrorMessages();
	const isRtl =
		typeof window !== "undefined" && localStorage.getItem("sf-locale") === "ar";

	return (
		<html
			dir={isRtl ? "rtl" : "ltr"}
			lang={
				typeof window !== "undefined"
					? localStorage.getItem("sf-locale") || "en"
					: "en"
			}
		>
			<body
				style={{
					margin: 0,
					minHeight: "100vh",
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					padding: 24,
					background: "#06060a",
					color: "#f0f0f5",
					fontFamily:
						'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
				}}
			>
				<div style={{ textAlign: "center", maxWidth: 480 }}>
					<div
						style={{
							width: 64,
							height: 64,
							borderRadius: "50%",
							background: "rgba(239,68,68,0.1)",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							margin: "0 auto 24px",
						}}
					>
						<svg
							width="28"
							height="28"
							viewBox="0 0 24 24"
							fill="none"
							stroke="#f43f5e"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
							<line x1="12" y1="9" x2="12" y2="13" />
							<line x1="12" y1="17" x2="12.01" y2="17" />
						</svg>
					</div>
					<h1
						style={{
							fontSize: 24,
							fontWeight: 700,
							color: "#f0f0f5",
							margin: "0 0 8px",
						}}
					>
						{msgs.somethingWrong}
					</h1>
					{error.message && (
						<pre
							style={{
								marginTop: 16,
								padding: "12px 16px",
								borderRadius: 10,
								background: "#16161e",
								border: "1px solid rgba(255,255,255,0.06)",
								color: "#9ca3af",
								fontSize: 12,
								fontFamily: "monospace",
								textAlign: isRtl ? "right" : "left",
								maxHeight: 72,
								overflow: "hidden",
								lineHeight: 1.5,
								whiteSpace: "pre-wrap",
								wordBreak: "break-all",
							}}
						>
							{error.message}
						</pre>
					)}
					<div
						style={{
							display: "flex",
							gap: 12,
							justifyContent: "center",
							flexWrap: "wrap",
							marginTop: 32,
						}}
					>
						<button
							onClick={reset}
							style={{
								display: "inline-flex",
								alignItems: "center",
								gap: 8,
								padding: "10px 18px",
								borderRadius: 10,
								fontSize: 13,
								fontWeight: 600,
								cursor: "pointer",
								border: "none",
								background: "linear-gradient(135deg, #6366f1, #4f46e5)",
								color: "white",
								minHeight: 40,
							}}
						>
							<svg
								width="16"
								height="16"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
								<path d="M21 3v5h-5" />
								<path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
								<path d="M8 16H3v5" />
							</svg>
							{msgs.tryAgain}
						</button>
						<Link
							href="/"
							style={{
								display: "inline-flex",
								alignItems: "center",
								gap: 8,
								padding: "10px 18px",
								borderRadius: 10,
								fontSize: 13,
								fontWeight: 600,
								cursor: "pointer",
								border: "1px solid rgba(255,255,255,0.06)",
								background: "transparent",
								color: "#9ca3af",
								textDecoration: "none",
								minHeight: 40,
							}}
						>
							<svg
								width="16"
								height="16"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
								<polyline points="9 22 9 12 15 12 15 22" />
							</svg>
							{msgs.goHome}
						</Link>
					</div>
				</div>
			</body>
		</html>
	);
}
