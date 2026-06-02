"use client";

import { Lock, Shield, Loader2, Check, AlertTriangle } from "lucide-react";
import { useI18n } from "@/lib/i18n";
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

	return (
		<div className="sf-card sf-flex-col sf-gap-lg">
			<h3 className="sf-settings-card-title">{t.settings.security}</h3>
			<div className="sf-flex-col sf-gap-md">
				<div>
					<label className="sf-label">{t.settings.currentPassword}</label>
					<input
						className="sf-input"
						type="password"
						value={passwords.current}
						onChange={(e) =>
							setPasswords((prev) => ({ ...prev, current: e.target.value }))
						}
					/>
				</div>
				<div>
					<label className="sf-label">{t.settings.newPassword}</label>
					<input
						className="sf-input"
						type="password"
						value={passwords.new}
						onChange={(e) =>
							setPasswords((prev) => ({ ...prev, new: e.target.value }))
						}
					/>
				</div>
				{passwordMsg && (
					<div
						className={`sf-flex-center-gap-sm sf-text-sm sf-p-sm sf-rounded-md ${passwordMsg.type === "success" ? "sf-text-success sf-bg-success-10" : "sf-text-danger sf-bg-danger-10"}`}
					>
						{passwordMsg.type === "success" ? (
							<Check size={14} />
						) : (
							<AlertTriangle size={14} />
						)}
						{passwordMsg.text}
					</div>
				)}
				<button
					className="sf-btn sf-btn-primary sf-self-start"
					onClick={onPasswordChange}
					disabled={passwordSaving || !passwords.new}
				>
					{passwordSaving ? (
						<Loader2 size={16} className="sf-animate-spin" />
					) : (
						<Lock size={16} />
					)}{" "}
					{passwordSaving ? t.common.loading : t.settings.updatePassword}
				</button>
			</div>
			<div className="sf-border-top-line sf-pt-lg">
				<div className="sf-flex-between">
					<div>
						<p className="sf-font-medium">{t.settings.twoFactor}</p>
						<p className="sf-settings-block-desc">{t.settings.twoFactorDesc}</p>
					</div>
					<button className="sf-btn sf-btn-ghost" disabled title="Coming soon">
						<Shield size={16} /> {t.settings.enable2FA}
					</button>
				</div>
			</div>

			{role === "owner" && (
				<div className="sf-settings-danger-zone sf-mt-lg">
					<div className="sf-flex-between sf-items-start">
						<div>
							<p className="sf-settings-danger-title">{t.settings.dangerZone}</p>
							<p className="sf-settings-danger-desc">
								{t.settings.wipeDataDesc ||
									"Clear all test data including orders, customers, messages, and automation activity."}
							</p>
						</div>
						<button
							className="sf-btn sf-btn-danger"
							onClick={onWipeClick}
							disabled={wiping}
						>
							{wiping ? (
								<Loader2 size={16} className="sf-animate-spin" />
							) : (
								<AlertTriangle size={16} />
							)}
							{wiping
								? t.common.loading
								: t.settings.wipeData || t.common.error}
						</button>
					</div>
				</div>
			)}
		</div>
	);
}
