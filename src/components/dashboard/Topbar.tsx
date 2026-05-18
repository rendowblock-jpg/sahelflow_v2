"use client";

import { useState, useEffect } from "react";
import { Search, Menu, Sun, Moon, Globe, Check } from "lucide-react";
import { useI18n, type Locale } from "@/lib/i18n";
import { useTheme } from "@/components/providers/ThemeProvider";
import { useLayout } from "@/components/providers/Providers";
import NotificationCenter from "@/components/dashboard/NotificationCenter";
import { getSellerProfile } from "@/lib/data/service";

const LANGUAGES: { code: Locale; label: string; flag: string }[] = [
  { code: "ar", label: "العربية", flag: "🇩🇿" },
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "en", label: "English", flag: "🇬🇧" },
];

export default function Topbar() {
  const { t, locale, setLocale } = useI18n();
  const { theme, toggleTheme } = useTheme();
  const { isMobile, isTablet, openSidebar } = useLayout();
  const [langOpen, setLangOpen] = useState(false);
  const [sellerName, setSellerName] = useState<string>("");

  useEffect(() => {
    getSellerProfile().then((p) => {
      if (p?.business_name) setSellerName(p.business_name);
      else if (p?.full_name) setSellerName(p.full_name);
      else if (p?.email) setSellerName(p.email.split("@")[0]);
    }).catch(() => {});
  }, []);

  const initials = sellerName
    ? sellerName.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()
    : "U";

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
        <div className="sf-topbar-search">
          <Search size={14} className="sf-topbar-search-icon" />
          <input
            type="text"
            readOnly
            placeholder={t.common.searchPlaceholder}
            className="sf-input sf-topbar-search-input"
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

        {/* User button — pure CSS hover via .sf-topbar-user-btn */}
        <button className="sf-topbar-user-btn sf-hide-mobile">
          <div className="sf-topbar-user-avatar">{initials}</div>
          <span className="sf-topbar-user-name">{sellerName || t.common.myStore}</span>
        </button>
      </div>
    </header>
  );
}
