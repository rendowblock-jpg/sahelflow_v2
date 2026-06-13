"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
	ShieldCheck,
	MessageCircle,
	AlertTriangle,
	Package,
	Truck,
	Ban,
	Loader2,
	ChevronDown,
	ChevronUp,
	Save,
	Check,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/components/dashboard/ToastProvider";
import { createClient } from "@/lib/supabase/client";
import { RECIPES, type Recipe } from "@/lib/automation/recipes";
import { PageTransition } from "@/components/ui/motion";

const ICON_MAP: Record<
	string,
	React.ComponentType<{ size?: number; style?: React.CSSProperties }>
> = {
	ShieldCheck,
	MessageCircle,
	AlertTriangle,
	Package,
	Truck,
	Ban,
};

const CATEGORY_COLORS: Record<string, string> = {
	orders: "var(--color-brand-500)",
	customers: "#f59e0b",
	messages: "#10b981",
	stock: "#6366f1",
};

const CATEGORIES = ["all", "orders", "customers", "messages", "stock"] as const;

interface AutomationRow {
	id: string;
	name: string;
	trigger_type: string;
	trigger_config: Record<string, unknown> | null;
	action_config: Record<string, unknown> | null;
	active: boolean;
	run_count: number;
	last_run_at: string | null;
}

interface ConfigField {
	key: string;
	labelKey: string;
	type: "slider" | "number";
	min: number;
	max: number;
	default: number;
	unit?: string;
}

const RECIPE_CONFIG_FIELDS: Record<string, ConfigField[]> = {
	auto_confirm_safe: [
		{
			key: "max_risk",
			labelKey: "configMaxRisk",
			type: "slider",
			min: 5,
			max: 60,
			default: 20,
			unit: "%",
		},
	],
	high_risk_alert: [
		{
			key: "threshold",
			labelKey: "configThreshold",
			type: "slider",
			min: 40,
			max: 95,
			default: 70,
			unit: "%",
		},
	],
	low_stock_warning: [
		{
			key: "threshold",
			labelKey: "configStockThreshold",
			type: "number",
			min: 1,
			max: 50,
			default: 5,
		},
	],
	followup_after_delivery: [
		{
			key: "delay_hours",
			labelKey: "configDelayHours",
			type: "number",
			min: 1,
			max: 168,
			default: 24,
		},
	],
	auto_block_returners: [
		{
			key: "max_returns",
			labelKey: "configMaxReturns",
			type: "number",
			min: 2,
			max: 10,
			default: 3,
		},
	],
};

export default function AutomationsPage() {
	const { t, formatTimeAgo } = useI18n();
	const { toast } = useToast();
	const supabase = useMemo(() => createClient(), []);

	const [automations, setAutomations] = useState<AutomationRow[]>([]);
	const [loading, setLoading] = useState(true);
	const [activeCategory, setActiveCategory] = useState<string>("all");
	const [expandedRecipe, setExpandedRecipe] = useState<string | null>(null);
	const [localConfigs, setLocalConfigs] = useState<
		Record<string, Record<string, number>>
	>({});
	const [savingConfig, setSavingConfig] = useState<Record<string, boolean>>({});
	const [savedConfig, setSavedConfig] = useState<Record<string, boolean>>({});

	const loadData = useCallback(async () => {
		try {
			const {
				data: { user },
			} = await supabase.auth.getUser();
			if (!user) return;

			const { data: existing } = await supabase
				.from("automations")
				.select(
					"id, name, trigger_type, trigger_config, action_config, active, run_count, last_run_at",
				)
				.eq("seller_id", user.id);

			const existingRows = (existing as AutomationRow[]) || [];
			const existingRecipeIds = new Set(
				existingRows
					.map(
						(r) =>
							(r.trigger_config as Record<string, unknown> | null)?.recipe_id,
					)
					.filter(Boolean),
			);

			const missing = RECIPES.filter((r) => !existingRecipeIds.has(r.id));
			if (missing.length > 0) {
				const { error: insertError } = await supabase
					.from("automations")
					.insert(
						missing.map((recipe) => ({
							seller_id: user.id,
							name: recipe.id,
							trigger_type: recipe.trigger.type,
							trigger_config: {
								...recipe.trigger.config,
								recipe_id: recipe.id,
							},
							action_type: recipe.action.type,
							action_config: recipe.action.config,
							active: recipe.default_active,
							run_count: 0,
						})),
					);
				if (insertError) {
					console.warn(
						"Automation seeding partial failure:",
						insertError.message,
					);
				}

				const { data: refreshed } = await supabase
					.from("automations")
					.select(
						"id, name, trigger_type, trigger_config, action_config, active, run_count, last_run_at",
					)
					.eq("seller_id", user.id);
				setAutomations((refreshed as AutomationRow[]) || []);
			} else {
				setAutomations(existingRows);
			}
		} catch {
			toast({ type: "error", title: "Automation error" });
			void toast({ type: "error", title: "Automation error" }); // // console.error("Failed to load automations:", err);
		} finally {
			setLoading(false);
		}
	}, [supabase, toast]);

	useEffect(() => {
		loadData();
	}, [loadData]);

	useEffect(() => {
		if (automations.length === 0) return;
		const configs: Record<string, Record<string, number>> = {};
		for (const recipe of RECIPES) {
			const row = getAutomationForRecipe(recipe);
			const fields = RECIPE_CONFIG_FIELDS[recipe.id];
			if (!fields) continue;
			configs[recipe.id] = {};
			for (const field of fields) {
				const dbVal = (row?.trigger_config as Record<string, unknown> | null)?.[
					field.key
				];
				configs[recipe.id][field.key] =
					dbVal !== undefined ? Number(dbVal) : field.default;
			}
		}
		setLocalConfigs(configs);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [automations]);

	async function handleToggle(
		automationId: string | undefined,
		currentState: boolean,
		recipe?: Recipe,
	) {
		if (!automationId && recipe) {
			const {
				data: { user },
			} = await supabase.auth.getUser();
			if (!user) return;
			const { data: inserted, error: insertErr } = await supabase
				.from("automations")
				.insert({
					seller_id: user.id,
					name: recipe.id,
					trigger_type: recipe.trigger.type,
					trigger_config: { ...recipe.trigger.config, recipe_id: recipe.id },
					action_type: recipe.action.type,
					action_config: recipe.action.config,
					active: !currentState,
					run_count: 0,
				})
				.select(
					"id, name, trigger_type, trigger_config, action_config, active, run_count, last_run_at",
				)
				.single();
			if (insertErr) {
				toast({
					type: "error",
					title: insertErr.message || t.automations.createFailed,
				});
				return;
			}
			if (inserted) {
				setAutomations((prev) => [...prev, inserted as AutomationRow]);
				toast({
					type: "success",
					title: currentState ? "Deactivated" : "Activated",
				});
			}
			return;
		}
		if (!automationId) return;
		setAutomations((prev) =>
			prev.map((a) =>
				a.id === automationId ? { ...a, active: !currentState } : a,
			),
		);
		const { error } = await supabase
			.from("automations")
			.update({ active: !currentState })
			.eq("id", automationId);
		if (error) {
			setAutomations((prev) =>
				prev.map((a) =>
					a.id === automationId ? { ...a, active: currentState } : a,
				),
			);
			toast({
				type: "error",
				title: error.message || t.automations.updateFailed,
			});
		} else {
			toast({
				type: "success",
				title: currentState ? "Deactivated" : "Activated",
			});
		}
	}

	async function handleSaveConfig(recipe: Recipe) {
		const row = getAutomationForRecipe(recipe);
		if (!row) return;
		const configValues = localConfigs[recipe.id] || {};
		setSavingConfig((prev) => ({ ...prev, [recipe.id]: true }));
		const newTriggerConfig = {
			...(row.trigger_config || {}),
			...configValues,
			recipe_id: recipe.id,
		};
		const { error } = await supabase
			.from("automations")
			.update({ trigger_config: newTriggerConfig })
			.eq("id", row.id);
		setSavingConfig((prev) => ({ ...prev, [recipe.id]: false }));
		if (error) {
			toast({ type: "error", title: `Failed to save: ${error.message}` });
		} else {
			setSavedConfig((prev) => ({ ...prev, [recipe.id]: true }));
			setTimeout(
				() => setSavedConfig((prev) => ({ ...prev, [recipe.id]: false })),
				2500,
			);
			setAutomations((prev) =>
				prev.map((a) =>
					a.id === row.id ? { ...a, trigger_config: newTriggerConfig } : a,
				),
			);
			toast({ type: "success", title: t.recipes.configSaved });
		}
	}

	function getAutomationForRecipe(recipe: Recipe): AutomationRow | undefined {
		return automations.find((a) => {
			const recipeId = (a.trigger_config as Record<string, unknown> | null)
				?.recipe_id;
			return recipeId === recipe.id || a.name === recipe.id;
		});
	}

	function updateLocalConfig(recipeId: string, key: string, value: number) {
		setLocalConfigs((prev) => ({
			...prev,
			[recipeId]: { ...(prev[recipeId] || {}), [key]: value },
		}));
	}

	const filteredRecipes =
		activeCategory === "all"
			? RECIPES
			: RECIPES.filter((r) => r.category === activeCategory);

	if (loading) {
		return (
			<div className="sf-flex-center sf-loading-page">
				<Loader2 size={24} className="sf-animate-spin sf-mr-sm" />
				{t.common.loading}
			</div>
		);
	}

	return (
		<PageTransition className="sf-flex-col sf-gap-xl">
			{/* Header */}
			<div className="sf-page-header">
				<div>
					<h1 className="sf-page-title">{t.recipes.title}</h1>
					<p className="sf-page-subtitle">{t.recipes.subtitle}</p>
				</div>
				<div
					style={{
						padding: "6px 14px",
						background: "rgba(59,158,255,0.08)",
						border: "1px solid rgba(59,158,255,0.2)",
						borderRadius: "var(--radius-pill)",
						fontSize: 12,
						fontWeight: 600,
						color: "var(--color-brand-400)",
					}}
				>
					{automations.filter((a) => a.active).length} / {RECIPES.length} active
				</div>
			</div>

			{/* Category filter — sf-seg tabs */}
			<div className="sf-seg">
				{CATEGORIES.map((cat) => (
					<button
						key={cat}
						onClick={() => setActiveCategory(cat)}
						className={`sf-seg-btn ${activeCategory === cat ? "sf-seg-btn--active" : ""}`}
					>
						{t.recipes[cat as keyof typeof t.recipes] || cat}
					</button>
				))}
			</div>

				{/* Recipe cards */}
			<div className="sf-flex-col sf-gap-md">
				{filteredRecipes.map((recipe) => {
					const row = getAutomationForRecipe(recipe);
					const isActive = row?.active ?? recipe.default_active;
					const Icon = ICON_MAP[recipe.icon] || Package;
					const catColor =
						CATEGORY_COLORS[recipe.category] || "var(--color-brand-500)";
					const runCount = row?.run_count || 0;
					const lastRun = row?.last_run_at;
					const configFields = RECIPE_CONFIG_FIELDS[recipe.id] || [];
					const isExpanded =
						expandedRecipe === recipe.id && isActive && configFields.length > 0;

					return (
						<div
							key={recipe.id}
							className="sf-settings-section"
							style={{
								borderInlineStart: `3px solid ${catColor}`,
								opacity: isActive ? 1 : 0.6,
								transition: "opacity 0.2s ease",
							}}
						>
							{/* Card Header Row */}
							<div
								className="sf-settings-section-header"
								style={{ cursor: "default" }}
							>
								<div className="sf-flex sf-items-center sf-gap-md" style={{ flex: 1 }}>
									<div
										style={{
											width: 36,
											height: 36,
											borderRadius: "var(--radius-md)",
											background: `${catColor}15`,
											color: catColor,
											display: "flex",
											alignItems: "center",
											justifyContent: "center",
											flexShrink: 0,
										}}
									>
										<Icon size={18} />
									</div>
									<div style={{ flex: 1 }}>
										<div className="sf-flex sf-items-center sf-gap-sm">
											<p className="sf-font-semibold sf-text-sm">
												{(t.recipes as Record<string, string>)[recipe.name_key] || recipe.id}
											</p>
											<span
												className="sf-badge"
												style={{ background: `${catColor}15`, color: catColor, border: `1px solid ${catColor}30`, fontSize: 10 }}
											>
												{(t.recipes as Record<string, string>)[recipe.category] || recipe.category}
											</span>
										</div>
										<p className="sf-text-xs sf-text-tertiary" style={{ marginTop: 2 }}>
											{(t.recipes as Record<string, string>)[recipe.description_key] || ""}
										</p>
									</div>
								</div>

								{/* Right controls */}
								<div className="sf-flex sf-items-center sf-gap-md">
									{isActive && configFields.length > 0 && (
										<button
											onClick={() => setExpandedRecipe(isExpanded ? null : recipe.id)}
											className="sf-btn sf-btn-ghost"
											style={{ padding: "4px 10px", minHeight: 28, fontSize: 12 }}
										>
											{isExpanded ? <ChevronUp size={12} style={{ marginInlineEnd: 4 }} /> : <ChevronDown size={12} style={{ marginInlineEnd: 4 }} />}
											Configure
										</button>
									)}
									<div
										className={`sf-toggle ${isActive ? "sf-toggle-active" : ""}`}
										onClick={() => handleToggle(row?.id, isActive, recipe)}
									/>
								</div>
							</div>

							{/* Meta row */}
							<div
								className="sf-flex sf-items-center sf-gap-md"
								style={{ padding: "6px 20px 14px", borderBottom: isExpanded ? "1px solid var(--color-line-secondary)" : "none" }}
							>
								<span className="sf-text-xs sf-text-tertiary">
									{t.recipes.runCount.replace("{count}", String(runCount))}
								</span>
								<span className="sf-text-xs sf-text-tertiary" style={{ marginInlineStart: "auto" }}>
									{lastRun
										? t.recipes.lastRun.replace("{time}", formatTimeAgo(lastRun))
										: t.recipes.neverRun}
								</span>
							</div>

							{/* Inline config panel */}
							{isExpanded && (
								<div className="sf-automation-config-panel">
									{configFields.map((field) => {
										const currentVal =
											localConfigs[recipe.id]?.[field.key] ?? field.default;
										return (
											<div key={field.key}>
												<div className="sf-flex-between sf-mb-sm sf-items-center">
													<label className="sf-automation-config-label">
														{(t.recipes as Record<string, string>)[
															field.labelKey
														] || field.labelKey}
													</label>
													<span className="sf-automation-config-value">
														{currentVal}
														{field.unit || ""}
													</span>
												</div>
												{field.type === "slider" ? (
													<input
														type="range"
														min={field.min}
														max={field.max}
														value={currentVal}
														onChange={(e) =>
															updateLocalConfig(
																recipe.id,
																field.key,
																parseInt(e.target.value),
															)
														}
														className="sf-w-full"
														style={{ accentColor: catColor }}
													/>
												) : (
													<input
														type="number"
														min={field.min}
														max={field.max}
														value={currentVal}
														onChange={(e) =>
															updateLocalConfig(
																recipe.id,
																field.key,
																parseInt(e.target.value) || field.min,
															)
														}
														className="sf-input sf-input-sm sf-w-120"
													/>
												)}
											</div>
										);
									})}

									<div className="sf-flex sf-justify-end sf-gap-sm sf-mt-xs">
										<button
											onClick={() => setExpandedRecipe(null)}
											className="sf-btn sf-btn-ghost sf-btn-xs"
										>
											{t.common.cancel}
										</button>
										<button
											onClick={() => handleSaveConfig(recipe)}
											disabled={savingConfig[recipe.id]}
											className="sf-btn sf-btn-primary sf-btn-xs sf-flex-center-gap-sm"
										>
											{savingConfig[recipe.id] ? (
												<Loader2 size={13} className="sf-animate-spin" />
											) : savedConfig[recipe.id] ? (
												<Check size={13} />
											) : (
												<Save size={13} />
											)}
											{savedConfig[recipe.id]
												? t.recipes.configSaved
												: t.recipes.configSave}
										</button>
									</div>
								</div>
							)}
						</div>
					);
				})}
			</div>
		</PageTransition>
	);
}
