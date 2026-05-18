"use client";

import { Save } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useLayout } from "@/components/providers/Providers";

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

	return (
		<div className="sf-card sf-flex-col sf-gap-lg">
			<h3 className="sf-settings-card-title">{t.settings.storeProfile}</h3>
			<div
				className={isMobile ? "sf-flex-col sf-gap-md" : "sf-grid-2 sf-gap-sm"}
			>
				<div>
					<label className="sf-label">{t.settings.storeName}</label>
					<input
						className="sf-input"
						value={formData.business_name}
						onChange={(e) =>
							setFormData((prev) => ({
								...prev,
								business_name: e.target.value,
							}))
						}
					/>
				</div>
				<div>
					<label className="sf-label">{t.settings.ownerName}</label>
					<input
						className="sf-input"
						value={formData.owner_name}
						onChange={(e) =>
							setFormData((prev) => ({
								...prev,
								owner_name: e.target.value,
							}))
						}
					/>
				</div>
			</div>
			<div>
				<label className="sf-label">{t.settings.email}</label>
				<input
					className="sf-input"
					type="email"
					value={formData.email}
					onChange={(e) =>
						setFormData((prev) => ({
							...prev,
							email: e.target.value,
						}))
					}
					dir="ltr"
				/>
			</div>
			<button
				className="sf-btn sf-btn-primary sf-self-start"
				onClick={onSave}
				disabled={saving}
			>
				<Save size={16} /> {saving ? t.common.loading : t.settings.saveChanges}
			</button>
		</div>
	);
}
