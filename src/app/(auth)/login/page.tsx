"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, Lock, Eye, EyeOff } from "lucide-react";
import { signIn } from "@/lib/auth/actions";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";

export default function LoginPage() {
  const _router = useRouter();
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);

    try {
      const result = await signIn(formData);
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

  const handleForgotPassword = async () => {
    if (!email) {
      setError(t.auth.emailRequired || "Please enter your email address first");
      return;
    }
    setError(null);
    setResetSent(false);
    const supabase = createClient();
    const { error: resetError } =
      await supabase.auth.resetPasswordForEmail(email);
    if (resetError) {
      setError(resetError.message);
    } else {
      setResetSent(true);
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
          <p className="sf-auth-subtitle">{t.auth.signInSubtitle}</p>
        </div>

        {/* Card */}
        <div className="sf-card sf-auth-form-card">
          <form className="sf-auth-form" onSubmit={handleLogin}>
            {error && <div className="sf-auth-error">{error}</div>}
            {resetSent && (
              <div
                className="sf-auth-error"
                style={{
                  background: "rgba(16,185,129,0.1)",
                  borderColor: "rgba(16,185,129,0.4)",
                  color: "#065f46",
                }}
              >
                {t.auth.resetEmailSent ||
                  "Password reset email sent. Check your inbox."}
              </div>
            )}

            {/* Email */}
            <div className="sf-auth-field">
              <label className="sf-auth-label">{t.auth.email}</label>
              <div className="sf-auth-input-wrap">
                <Mail size={16} className="sf-auth-input-icon" />
                <input
                  type="email"
                  name="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t.auth.emailPlaceholder}
                  className="sf-input sf-input--icon-start"
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div className="sf-auth-field">
              <div className="sf-auth-label-row">
                <label className="sf-auth-label" style={{ marginBottom: 0 }}>
                  {t.auth.password}
                </label>
                <button
                  type="button"
                  className="sf-auth-link"
                  onClick={handleForgotPassword}
                >
                  {t.auth.forgotPassword}
                </button>
              </div>
              <div className="sf-auth-input-wrap">
                <Lock size={16} className="sf-auth-input-icon" />
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  placeholder={t.auth.passwordPlaceholder}
                  className="sf-input sf-input--icon-both"
                  required
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

            {/* Submit */}
            <button
              type="submit"
              className="sf-btn sf-btn-primary sf-btn-lg sf-w-full"
              disabled={loading}
            >
              {loading ? (
                <span className="sf-btn-spinner">
                  <span className="sf-spinner" />
                  {t.auth.signingIn}
                </span>
              ) : (
                t.auth.signIn
              )}
            </button>
          </form>
        </div>

        <p className="sf-auth-footer">
          {t.auth.noAccount}{" "}
          <Link href="/register">{t.auth.createAccountLink}</Link>
        </p>
      </div>
    </div>
  );
}
