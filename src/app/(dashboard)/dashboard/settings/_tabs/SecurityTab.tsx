"use client";

import { Lock, Shield, Loader2, Check, AlertTriangle, Eye, EyeOff, Smartphone } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useState } from "react";
import type { TeamRole } from "@/lib/auth/permissions";

interface SecurityTabProps {
	passwords: { current: string; new: string };
	setPasswords: React.Dispatch<
		React.SetStateAction<{ current: string; new: string }>
	>;
	passwordSaving: boolean;
	passwordMsg: { type: "success" | "error"; text: string } | null;
	wiping: boolean;
	onPasswordChange: () => void;
	onWipeClick: () => void;
	role?: TeamRole | null;
}

function getStrength(pw: string): { level: number; label: string } {
	if (!pw) return { level: 0, label: "" };
	let score = 0;
	if (pw.length >= 8) score++;
	if (/[A-Z]/.test(pw)) score++;
	if (/[0-9]/.test(pw)) score++;
	if (/[^A-Za-z0-9]/.test(pw)) score++;
	if (score <= 1) return { level: 1, label: "Weak" };
	if (score <= 2) return { level: 2, label: "Medium" };
	return { level: 3, label: "Strong" };
}

export default function SecurityTab({
	passwords,
	setPasswords,
	passwordSaving,
	passwordMsg,
	wiping,
	onPasswordChange,
	onWipeClick,
	role,
}: SecurityTabProps) {
	const { t } = useI18n();
	const [showCurrent, setShowCurrent] = useState(false);
	const [showNew, setShowNew] = useState(false);

	const strength = getStrength(passwords.new);

	const strengthBarClass = (bar: number) => {
		if (!passwords.new) return "";
		if (strength.level >= 3) return "strong";
		if (strength.level >= 2 && bar <= 2) return "medium";
		if (strength.level >= 1 && bar === 1) return "weak";
		return "";
	};

	const strengthColor =
		strength.level === 3
			? "var(--color-accent-400)"
			: strength.level === 2
				? "var(--color-warn-400)"
				: "var(--color-danger-400)";

	return (
		<div className="sf-flex-col sf-gap-lg sf-animate-fade">
			{/* Password Change Section */}
			<div className="sf-settings-section">
				<div className="sf-settings-section-header">
					<h3 className="sf-settings-section-title">{t.settings.security}</h3>
					<p className="sf-settings-section-desc">
						Update your password regularly to keep your account secure.
					</p>
				</div>

				<div className="sf-settings-section-body">
					{/* Current Password */}
					<div className="sf-field-float" style={{ position: "relative" }}>
						<input
							id="current_password"
							className="sf-input"
							type={showCurrent ? "text" : "password"}
							placeholder=" "
							value={passwords.current}
							onChange={(e) =>
								setPasswords((prev) => ({ ...prev, current: e.target.value }))
							}
							style={{ paddingInlineEnd: "44px" }}
						/>
						<label htmlFor="current_password">{t.settings.currentPassword}</label>
						<button
							type="button"
							onClick={() => setShowCurrent(!showCurrent)}
							style={{
								position: "absolute",
								insetInlineEnd: "12px",
								top: "50%",
								transform: "translateY(-50%)",
								background: "none",
								border: "none",
								cursor: "pointer",
								color: "var(--color-content-tertiary)",
								padding: "2px",
							}}
							tabIndex={-1}
						>
							{showCurrent ? <EyeOff size={15} /> : <Eye size={15} />}
						</button>
					</div>

					{/* New Password + Strength Meter */}
					<div>
						<div className="sf-field-float" style={{ position: "relative" }}>
							<input
								id="new_password"
								className="sf-input"
								type={showNew ? "text" : "password"}
								placeholder=" "
								value={passwords.new}
								onChange={(e) =>
									setPasswords((prev) => ({ ...prev, new: e.target.value }))
								}
								style={{ paddingInlineEnd: "44px" }}
							/>
							<label htmlFor="new_password">{t.settings.newPassword}</label>
							<button
								type="button"
								onClick={() => setShowNew(!showNew)}
								style={{
									position: "absolute",
									insetInlineEnd: "12px",
									top: "50%",
									transform: "translateY(-50%)",
									background: "none",
									border: "none",
									cursor: "pointer",
									color: "var(--color-content-tertiary)",
									padding: "2px",
								}}
								tabIndex={-1}
							>
								{showNew ? <EyeOff size={15} /> : <Eye size={15} />}
							</button>
						</div>
						{/* Strength Meter */}
						<div className="sf-pwd-strength">
							{[1, 2, 3].map((bar) => (
								<div
									key={bar}
									className={`sf-pwd-strength-bar ${strengthBarClass(bar)}`}
								/>
							))}
						</div>
						{passwords.new && (
							<p
								className="sf-text-xs sf-mt-sm"
								style={{ color: strengthColor, marginTop: "6px" }}
							>
								{strength.label} password
							</p>
						)}
					</div>

					{/* Feedback Message */}
					{passwordMsg && (
						<div
							className="sf-flex sf-items-center sf-gap-sm sf-text-sm"
							style={{
								padding: "10px 14px",
								borderRadius: "8px",
								background:
									passwordMsg.type === "success"
										? "rgba(16,185,129,0.08)"
										: "rgba(239,68,68,0.08)",
								border: `1px solid ${passwordMsg.type === "success" ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)"}`,
								color:
									passwordMsg.type === "success"
										? "var(--color-accent-400)"
										: "var(--color-danger-400)",
							}}
						>
							{passwordMsg.type === "success" ? (
								<Check size={14} />
							) : (
								<AlertTriangle size={14} />
							)}
							{passwordMsg.text}
						</div>
					)}
				</div>

				<div className="sf-settings-section-footer">
					<button
						className="sf-btn sf-btn-primary"
						onClick={onPasswordChange}
						disabled={passwordSaving || !passwords.new || !passwords.current}
					>
						{passwordSaving ? (
							<Loader2 size={14} className="sf-animate-spin" style={{ marginInlineEnd: "6px" }} />
						) : (
							<Lock size={14} style={{ marginInlineEnd: "6px" }} />
						)}
						{passwordSaving ? t.common.loading : t.settings.updatePassword}
					</button>
				</div>
			</div>

			{/* 2FA Section */}
			<div className="sf-settings-section">
				<div className="sf-settings-section-header">
					<h3 className="sf-settings-section-title">{t.settings.twoFactor || "Two-Factor Authentication"}</h3>
					<p className="sf-settings-section-desc">
						{t.settings.twoFactorDesc || "Add an extra layer of security to your account."}
					</p>
				</div>
				<div className="sf-settings-section-body sf-gap-sm">
					<div className="sf-2fa-card">
						<div className="sf-2fa-card__icon">
							<Smartphone size={18} />
						</div>
						<div className="sf-flex-1">
							<p className="sf-font-medium sf-text-sm">Authenticator App (TOTP)</p>
							<p className="sf-text-xs sf-text-tertiary sf-mt-sm">
								Google Authenticator, Authy, or similar apps
							</p>
						</div>
						<span className="sf-2fa-soon">Soon</span>
					</div>
					<div className="sf-2fa-card">
						<div className="sf-2fa-card__icon">
							<Shield size={18} />
						</div>
						<div className="sf-flex-1">
							<p className="sf-font-medium sf-text-sm">SMS Verification</p>
							<p className="sf-text-xs sf-text-tertiary sf-mt-sm">
								Receive a code via text message on your phone
							</p>
						</div>
						<span className="sf-2fa-soon">Soon</span>
					</div>
				</div>
			</div>

			{/* Danger Zone */}
			{role === "owner" && (
				<div className="sf-danger-zone">
					<div className="sf-danger-zone-header">
						<p className="sf-danger-zone-title">
							<AlertTriangle size={14} />
							{t.settings.dangerZone}
						</p>
					</div>
					<div className="sf-danger-zone-body">
						<div className="sf-flex-1">
							<p className="sf-font-medium sf-text-sm sf-text-primary">
								{t.settings.wipeData || "Clear Test Data"}
							</p>
							<p className="sf-text-xs sf-text-secondary sf-mt-sm" style={{ maxWidth: "380px" }}>
								{t.settings.wipeDataDesc ||
									"Clear all test data including orders, customers, messages, and automation activity. This cannot be undone."}
							</p>
						</div>
						<button
							className="sf-btn sf-btn-danger"
							onClick={onWipeClick}
							disabled={wiping}
							style={{ flexShrink: 0 }}
						>
							{wiping ? (
								<Loader2 size={14} className="sf-animate-spin" style={{ marginInlineEnd: "6px" }} />
							) : (
								<AlertTriangle size={14} style={{ marginInlineEnd: "6px" }} />
							)}
							{wiping ? t.common.loading : t.settings.wipeData || "Wipe Data"}
						</button>
					</div>
				</div>
			)}
		</div>
	);
}
