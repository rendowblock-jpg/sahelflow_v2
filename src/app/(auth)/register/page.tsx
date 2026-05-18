"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, Lock, User, Briefcase, Eye, EyeOff } from "lucide-react";
import { signUp } from "@/lib/auth/actions";
import { useI18n } from "@/lib/i18n";

export default function RegisterPage() {
  const _router = useRouter();
  const { t } = useI18n();
  const [showPassword, setShowPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const password = formData.get("password") as string;
    if (password !== confirmPassword) {
      setError(t.auth.passwordMismatch || "Passwords do not match");
      setLoading(false);
      return;
    }

    try {
      const result = await signUp(formData);
      if (result?.error) {
        setError(result.error);
        setLoading(false);
      }
      // on success, server action calls redirect() — never returns here
    } catch (err) {
      if (
        typeof err === "object" &&
        err !== null &&
        "digest" in err &&
        String((err as Record<string, unknown>).digest).startsWith(
          "NEXT_REDIRECT",
        )
      ) {
        throw err;
      }
      setError(t.auth.networkError);
      setLoading(false);
    }
  };

  return (
    <div className="sf-auth-page">
      <div className="sf-auth-bg-glow" />
      <div className="sf-auth-wrap sf-slide-up">
        {/* Logo */}
        <div className="sf-auth-logo">
          <div className="sf-auth-logo-icon sf-gradient-brand">S</div>
          <h1 className="sf-gradient-text sf-auth-title">SahelFlow</h1>
          <p className="sf-auth-subtitle">{t.auth.signUpSubtitle}</p>
        </div>

        {/* Card */}
        <div className="sf-card sf-auth-form-card">
          <form className="sf-auth-form" onSubmit={handleRegister}>
            {error && <div className="sf-auth-error">{error}</div>}

            {/* Full Name */}
            <div className="sf-auth-field">
              <label className="sf-auth-label">{t.auth.fullName}</label>
              <div className="sf-auth-input-wrap">
                <User size={16} className="sf-auth-input-icon" />
                <input
                  type="text"
                  name="name"
                  placeholder={t.auth.fullNamePlaceholder}
                  className="sf-input sf-input--icon-start"
                  required
                />
              </div>
            </div>

            {/* Business Name */}
            <div className="sf-auth-field">
              <label className="sf-auth-label">{t.auth.businessName}</label>
              <div className="sf-auth-input-wrap">
                <Briefcase size={16} className="sf-auth-input-icon" />
                <input
                  type="text"
                  name="businessName"
                  placeholder={t.auth.businessNamePlaceholder}
                  className="sf-input sf-input--icon-start"
                  required
                />
              </div>
            </div>

            {/* Email */}
            <div className="sf-auth-field">
              <label className="sf-auth-label">{t.auth.email}</label>
              <div className="sf-auth-input-wrap">
                <Mail size={16} className="sf-auth-input-icon" />
                <input
                  type="email"
                  name="email"
                  placeholder={t.auth.emailPlaceholder}
                  className="sf-input sf-input--icon-start"
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div className="sf-auth-field">
              <label className="sf-auth-label">{t.auth.password}</label>
              <div className="sf-auth-input-wrap">
                <Lock size={16} className="sf-auth-input-icon" />
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  placeholder={t.auth.passwordMinPlaceholder}
                  className="sf-input sf-input--icon-both"
                  required
                  minLength={8}
                />
                <button
                  type="button"
                  className="sf-auth-input-action"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div className="sf-auth-field">
              <label className="sf-auth-label">
                {t.auth.confirmPassword || "Confirm Password"}
              </label>
              <div className="sf-auth-input-wrap">
                <Lock size={16} className="sf-auth-input-icon" />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={
                    t.auth.confirmPasswordPlaceholder || "Confirm your password"
                  }
                  className="sf-input sf-input--icon-start"
                  required
                  minLength={8}
                />
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              className="sf-btn sf-btn-primary sf-btn-lg sf-w-full"
              disabled={loading}
            >
              {loading ? (
                <span className="sf-btn-spinner">
                  <span className="sf-spinner" />
                  {t.auth.creatingAccount}
                </span>
              ) : (
                t.auth.signUp
              )}
            </button>
          </form>
        </div>

        <p className="sf-auth-footer">
          {t.auth.hasAccount} <Link href="/login">{t.auth.signInLink}</Link>
        </p>
      </div>
    </div>
  );
}
