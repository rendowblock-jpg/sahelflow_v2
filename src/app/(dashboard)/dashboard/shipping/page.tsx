"use client";

import { useState, useEffect } from "react";
import { Save, ChevronDown, ChevronUp } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/components/dashboard/ToastProvider";
import { createClient } from "@/lib/supabase/client";
import { WILAYAS, ZONE_PRICES } from "@/lib/data/wilayas";
import { PageTransition } from "@/components/ui/motion";

const ZONE_COLORS: Record<string, string> = {
	north: "#3b82f6",
	east: "#8b5cf6",
	west: "#f59e0b",
	center: "#10b981",
	highPlateaux: "#ec4899",
	south: "#ef4444",
};

type RateMap = Record<number, { home: number; desk: number; express: boolean }>;

export default function ShippingPage() {
	const { t } = useI18n();
	const { toast } = useToast();
	const supabase = createClient();

	const [rates, setRates] = useState<RateMap>(() => {
		const r: RateMap = {};
		WILAYAS.forEach((w) => {
			const defaults = ZONE_PRICES[w.zone as keyof typeof ZONE_PRICES];
			r[w.code] = { home: defaults.home, desk: defaults.desk, express: false };
		});
		return r;
	});
	const [saving, setSaving] = useState(false);
	const [saved, setSaved] = useState(false);
	const [bulkOpen, setBulkOpen] = useState(false);
	const [bulkZone, setBulkZone] = useState<string>("north");
	const [bulkHome, setBulkHome] = useState(400);
	const [bulkDesk, setBulkDesk] = useState(300);

	useEffect(() => {
		async function load() {
			const {
				data: { user },
			} = await supabase.auth.getUser();
			if (!user) return;
			const { data } = await supabase
				.from("sellers")
				.select("shipping_rates")
				.eq("id", user.id)
				.single();
			if (data?.shipping_rates) {
				setRates(data.shipping_rates as RateMap);
			}
		}
		load();
	}, [supabase]);

	async function handleSave() {
		setSaving(true);
		try {
			const {
				data: { user },
			} = await supabase.auth.getUser();
			if (!user) return;
			await supabase
				.from("sellers")
				.update({ shipping_rates: rates })
				.eq("id", user.id);
			setSaved(true);
			setTimeout(() => setSaved(false), 3000);
		} catch {
			toast({ type: "error", title: t.shipping?.saveFailed || t.common.error });
		} finally {
			setSaving(false);
		}
	}

	function applyBulk() {
		const updated = { ...rates };
		WILAYAS.filter((w) => w.zone === bulkZone).forEach((w) => {
			updated[w.code] = { ...updated[w.code], home: bulkHome, desk: bulkDesk };
		});
		setRates(updated);
		setBulkOpen(false);
	}

	return (
		<PageTransition className="sf-flex-col sf-gap-xl">
			{/* Header */}
			<div className="sf-flex-between sf-flex-wrap sf-gap-md">
				<div>
					<h1 className="sf-page-title">{t.shipping.title}</h1>
					<p className="sf-page-subtitle">{t.shipping.subtitle}</p>
				</div>
				<div className="sf-flex sf-gap-sm sf-flex-wrap">
					<button
						className="sf-btn sf-btn-ghost"
						onClick={() => setBulkOpen(!bulkOpen)}
					>
						{bulkOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
						{t.shipping.bulkSet}
					</button>
					<button
						className="sf-btn sf-btn-primary"
						onClick={handleSave}
						disabled={saving}
					>
						<Save size={16} />
						{saving
							? t.shipping.saving
							: saved
								? "✓ Saved!"
								: t.shipping.saveRates}
					</button>
				</div>
			</div>

			{/* Bulk zone setter */}
			{bulkOpen && (
				<div className="sf-card sf-flex-col sf-gap-md sf-fade-in">
					<h3 className="sf-section-title">{t.shipping.bulkSet}</h3>
					<div className="sf-flex sf-gap-md sf-flex-wrap sf-items-end">
						<div>
							<label className="sf-label">Zone</label>
							<select
								className="sf-input"
								value={bulkZone}
								onChange={(e) => setBulkZone(e.target.value)}
							>
								{Object.keys(ZONE_PRICES).map((z) => (
									<option key={z} value={z}>
										{t.shipping[z as keyof typeof t.shipping] || z}
									</option>
								))}
							</select>
						</div>
						<div>
							<label className="sf-label">{t.shipping.homeDelivery} (DA)</label>
							<input
								className="sf-input sf-shipping-w-100"
								type="number"
								value={bulkHome}
								onChange={(e) => setBulkHome(+e.target.value)}
							/>
						</div>
						<div>
							<label className="sf-label">{t.shipping.stopDesk} (DA)</label>
							<input
								className="sf-input sf-shipping-w-100"
								type="number"
								value={bulkDesk}
								onChange={(e) => setBulkDesk(+e.target.value)}
							/>
						</div>
						<button className="sf-btn sf-btn-primary" onClick={applyBulk}>
							Apply to Zone
						</button>
					</div>
				</div>
			)}

			{/* Legend */}
			<div className="sf-flex sf-gap-md sf-flex-wrap">
				{Object.entries(ZONE_COLORS).map(([zone, color]) => (
					<div key={zone} className="sf-flex-center-gap-sm sf-text-xs">
						<div className="sf-zone-dot" style={{ background: color }} />
						<span className="sf-text-secondary">
							{t.shipping[zone as keyof typeof t.shipping] || zone}
						</span>
					</div>
				))}
			</div>

			{/* Column headers */}
			<div className="sf-card sf-shipping-card-p-0">
				<div className="sf-shipping-table-header">
					<span className="sf-table-header-cell">#</span>
					<span className="sf-table-header-cell">Wilaya</span>
					<span className="sf-table-header-cell">
						{t.shipping.homeDelivery}
					</span>
					<span className="sf-table-header-cell">{t.shipping.stopDesk}</span>
					<span className="sf-table-header-cell">
						{t.shipping.expressAvailable}
					</span>
				</div>

				{WILAYAS.map((w) => {
					const rate = rates[w.code];
					const zoneColor = ZONE_COLORS[w.zone];
					return (
						<div key={w.code} className="sf-shipping-table-row">
							<span className="sf-td-mono-sm">{w.code}</span>
							<div className="sf-shipping-wilaya-row">
								<div
									className="sf-zone-dot-sm"
									style={{ background: zoneColor }}
								/>
								<span className="sf-text-13">{w.name}</span>
							</div>
							<input
								type="number"
								className="sf-input sf-input-compressed"
								value={rate?.home ?? 400}
								onChange={(e) =>
									setRates({
										...rates,
										[w.code]: { ...rate, home: +e.target.value },
									})
								}
							/>
							<input
								type="number"
								className="sf-input sf-input-compressed"
								value={rate?.desk ?? 300}
								onChange={(e) =>
									setRates({
										...rates,
										[w.code]: { ...rate, desk: +e.target.value },
									})
								}
							/>
							<div className="sf-flex-center">
								<div
									className={`sf-toggle ${rate?.express ? "sf-toggle-active" : ""} sf-delivery-scale-sm`}
									onClick={() =>
										setRates({
											...rates,
											[w.code]: { ...rate, express: !rate?.express },
										})
									}
								/>
							</div>
						</div>
					);
				})}
			</div>
		</PageTransition>
	);
}
