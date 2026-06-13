"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, Menu, Sun, Moon, Globe, Check, User, LogOut, Settings, Shield } from "lucide-react";
import { useI18n, type Locale } from "@/lib/i18n";
import { useTheme } from "@/components/providers/ThemeProvider";
import { useLayout } from "@/components/providers/Providers";
import { useSeller } from "@/components/providers/SellerProvider";
import NotificationCenter from "@/components/dashboard/NotificationCenter";
import { signOut } from "@/lib/auth/actions";

const LANGUAGES: { code: Locale; label: string; flag: string }[] = [
	{ code: "ar", label: "العربية", flag: "🇩🇿" },
	{ code: "fr", label: "Français", flag: "🇫🇷" },
	{ code: "en", label: "English", flag: "🇬🇧" },
];

export default function Topbar() {
	const { t, locale, setLocale } = useI18n();
	const { theme, toggleTheme } = useTheme();
	const { isMobile, isTablet, openSidebar } = useLayout();
	const { displayName: sellerName, initials, profile } = useSeller();
	const [langOpen, setLangOpen] = useState(false);
	const [userMenuOpen, setUserMenuOpen] = useState(false);

	const isMobileOrTablet = isMobile || isTablet;

	return (
		<header className="sf-topbar">
			{/* Left */}
			<div className="sf-topbar-left">
				{isMobileOrTablet && (
					<button
						className="sf-topbar-menu-btn"
						onClick={openSidebar}
						aria-label={t.common.openMenu}
					>
						<Menu size={18} />
					</button>
				)}
				<div className="sf-topbar-search-pill">
					<Search size={14} className="sf-topbar-search-icon" />
					<input
						type="text"
						readOnly
						placeholder={t.common.searchPlaceholder}
						onClick={() =>
							window.dispatchEvent(new Event("open-command-palette"))
						}
					/>
					<kbd className="sf-cmd-kbd sf-topbar-search-kbd">⌘K</kbd>
				</div>
			</div>

			{/* Right */}
			<div className="sf-topbar-right">
				<button
					className="sf-theme-toggle"
					onClick={toggleTheme}
					aria-label={theme === "dark" ? t.theme.light : t.theme.dark}
				>
					{theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
				</button>

				<div className="sf-lang-switcher">
					<button
						className="sf-lang-btn"
						onClick={() => setLangOpen(!langOpen)}
						aria-label={t.common.changeLanguage}
						aria-expanded={langOpen}
					>
						<Globe size={14} />
						<span className="sf-hide-mobile" style={{ fontSize: 12 }}>
							{LANGUAGES.find((l) => l.code === locale)?.flag}{" "}
							{locale.toUpperCase()}
						</span>
					</button>
					{langOpen && (
						<>
							<div
								style={{ position: "fixed", inset: 0, zIndex: 99 }}
								onClick={() => setLangOpen(false)}
							/>
							<div className="sf-lang-dropdown">
								{LANGUAGES.map((lang) => (
									<button
										key={lang.code}
										className={`sf-lang-option ${locale === lang.code ? "active" : ""}`}
										onClick={() => {
											setLocale(lang.code);
											setLangOpen(false);
										}}
									>
										<span>{lang.flag}</span>
										<span style={{ fontSize: 13 }}>{lang.label}</span>
										{locale === lang.code && (
											<Check
												size={12}
												style={{
													marginInlineStart: "auto",
													color: "var(--color-brand-400)",
												}}
											/>
										)}
									</button>
								))}
							</div>
						</>
					)}
				</div>

				<NotificationCenter />

				{/* User profile dropdown */}
				<div className="sf-user-menu-wrapper" style={{ position: "relative" }}>
					<button
						className="sf-topbar-user-btn sf-hide-mobile"
						onClick={() => setUserMenuOpen(!userMenuOpen)}
						aria-expanded={userMenuOpen}
						style={{ position: "relative", zIndex: userMenuOpen ? 100 : 1 }}
					>
						<div className="sf-topbar-user-ring">{initials}</div>
						<span className="sf-topbar-user-name">
							{sellerName || t.common.myStore}
						</span>
					</button>

					{userMenuOpen && (
						<>
							<div
								style={{ position: "fixed", inset: 0, zIndex: 99 }}
								onClick={() => setUserMenuOpen(false)}
							/>
							<div
								className="sf-lang-dropdown"
								style={{
									position: "absolute",
									top: "calc(100% + 8px)",
									insetInlineEnd: 0,
									minWidth: "200px",
									padding: "6px",
									display: "flex",
									flexDirection: "column",
									gap: "2px",
								}}
							>
								{/* Info Header */}
								<div style={{ padding: "8px 10px", borderBottom: "1px solid var(--color-line-primary)", marginBottom: "4px" }}>
									<p style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-content-primary)" }}>{sellerName || t.common.myStore}</p>
									{profile?.email && (
										<p style={{ fontSize: "11px", color: "var(--color-content-tertiary)", marginTop: "2px" }}>{profile.email}</p>
									)}
								</div>

								{/* Profile */}
								<Link
									href="/dashboard/settings"
									className="sf-lang-option"
									style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: "8px" }}
									onClick={() => setUserMenuOpen(false)}
								>
									<User size={14} style={{ opacity: 0.7 }} />
									<span>{t.settings.profile || "Profile"}</span>
								</Link>

								{/* Team */}
								<Link
									href="/dashboard/settings/team"
									className="sf-lang-option"
									style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: "8px" }}
									onClick={() => setUserMenuOpen(false)}
								>
									<Shield size={14} style={{ opacity: 0.7 }} />
									<span>{t.nav.team || "Team"}</span>
								</Link>

								{/* Settings */}
								<Link
									href="/dashboard/settings"
									className="sf-lang-option"
									style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: "8px" }}
									onClick={() => setUserMenuOpen(false)}
								>
									<Settings size={14} style={{ opacity: 0.7 }} />
									<span>{t.nav.settings || "Settings"}</span>
								</Link>

								<div style={{ height: "1px", background: "var(--color-line-secondary)", margin: "4px 0" }} />

								{/* Logout */}
								<button
									onClick={() => {
										setUserMenuOpen(false);
										signOut();
									}}
									className="sf-lang-option"
									style={{
										width: "100%",
										background: "transparent",
										border: "none",
										cursor: "pointer",
										fontFamily: "inherit",
										color: "var(--color-danger-400)",
										display: "flex",
										alignItems: "center",
										gap: "8px",
										textAlign: "start",
									}}
								>
									<LogOut size={14} style={{ color: "var(--color-danger-400)" }} />
									<span>{t.nav.logOut}</span>
								</button>
							</div>
						</>
					)}
				</div>
			</div>
		</header>
	);
}

