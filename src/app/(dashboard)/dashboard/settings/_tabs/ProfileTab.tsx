"use client";

import { Save, Camera } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useLayout } from "@/components/providers/Providers";
import { useState } from "react";

interface ProfileTabProps {
	formData: {
		business_name: string;
		owner_name: string;
		email: string;
	};
	setFormData: React.Dispatch<
		React.SetStateAction<{
			business_name: string;
			owner_name: string;
			email: string;
		}>
	>;
	saving: boolean;
	onSave: () => void;
}

export default function ProfileTab({
	formData,
	setFormData,
	saving,
	onSave,
}: ProfileTabProps) {
	const { t } = useI18n();
	const { isMobile } = useLayout();
	const [savedSuccessfully, setSavedSuccessfully] = useState(false);

	const getInitials = () => {
		const name = formData.business_name || formData.owner_name || "SF";
		return name
			.split(" ")
			.map((word) => word[0])
			.join("")
			.slice(0, 2)
			.toUpperCase();
	};

	const handleSave = async () => {
		setSavedSuccessfully(false);
		await onSave();
		setSavedSuccessfully(true);
		setTimeout(() => setSavedSuccessfully(false), 3000);
	};

	return (
		<div className="sf-settings-section sf-animate-fade">
			<div className="sf-settings-section-header">
				<h3 className="sf-settings-section-title">{t.settings.storeProfile}</h3>
				<p className="sf-settings-section-desc">
					Update your store profile details and billing email address.
				</p>
			</div>

			<div className="sf-settings-section-body sf-gap-lg">
				{/* Avatar Initials Wrapper */}
				<div className="sf-flex sf-items-center sf-gap-md sf-mb-md">
					<div className="sf-profile-avatar-wrap">
						<div className="sf-profile-avatar">
							{getInitials()}
						</div>
						<div className="sf-profile-avatar-overlay">
							<Camera size={18} className="sf-text-white" />
						</div>
					</div>
					<div>
						<h4 className="sf-font-semibold sf-text-primary sf-text-sm">Store Avatar</h4>
						<p className="sf-text-xs sf-text-tertiary sf-mt-sm">
							Initials generated from your business name. Hover to change.
						</p>
					</div>
				</div>

				{/* Floating Label Form Fields */}
				<div className={isMobile ? "sf-flex-col sf-gap-md" : "sf-grid-2 sf-gap-md"}>
					<div className="sf-field-float">
						<input
							id="business_name"
							className="sf-input"
							placeholder=" "
							value={formData.business_name}
							onChange={(e) =>
								setFormData((prev) => ({
									...prev,
									business_name: e.target.value,
								}))
							}
						/>
						<label htmlFor="business_name">{t.settings.storeName}</label>
					</div>
					<div className="sf-field-float">
						<input
							id="owner_name"
							className="sf-input"
							placeholder=" "
							value={formData.owner_name}
							onChange={(e) =>
								setFormData((prev) => ({
									...prev,
									owner_name: e.target.value,
								}))
							}
						/>
						<label htmlFor="owner_name">{t.settings.ownerName}</label>
					</div>
				</div>

				<div className="sf-field-float">
					<input
						id="email"
						className="sf-input"
						type="email"
						placeholder=" "
						value={formData.email}
						onChange={(e) =>
							setFormData((prev) => ({
								...prev,
								email: e.target.value,
							}))
						}
						dir="ltr"
					/>
					<label htmlFor="email">{t.settings.email}</label>
				</div>
			</div>

			<div className="sf-settings-section-footer">
				{savedSuccessfully && !saving && (
					<span className="sf-text-xs sf-text-success sf-animate-fade sf-mr-md" style={{ marginRight: "12px" }}>
						✓ {t.common.saved || "Changes saved!"}
					</span>
				)}
				<button
					className="sf-btn sf-btn-primary"
					onClick={handleSave}
					disabled={saving}
				>
					<Save size={14} className="sf-mr-xs" style={{ marginInlineEnd: "6px" }} />
					{saving ? t.common.loading : t.settings.saveChanges}
				</button>
			</div>
		</div>
	);
}

