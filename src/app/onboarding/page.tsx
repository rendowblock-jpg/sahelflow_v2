"use client";

import Image from "next/image";
import { useState } from "react";
import {
	ArrowRight,
	ArrowLeft,
	Check,
	Store,
	Phone,
	Package,
	Truck,
	Link2,
	Zap,
	Loader2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { updateSellerProfile } from "@/lib/data/service";
import { WILAYA_NAMES } from "@/lib/data/wilayas";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/components/dashboard/ToastProvider";

export default function OnboardingPage() {
	const { t } = useI18n();
	const { toast } = useToast();
	const router = useRouter();
	const [step, setStep] = useState(0);
	const [storeName, setStoreName] = useState("");
	const [phone, setPhone] = useState("");
	const [wilaya, setWilaya] = useState("");
	const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
	const [selectedDelivery, setSelectedDelivery] = useState<string[]>([]);
	const [selectedSources, setSelectedSources] = useState<string[]>([
		"WhatsApp",
		"Manual Entry",
	]);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");

	const steps = [
		{
			id: "store",
			title: t.onboarding.stepStore,
			icon: Store,
			description: t.onboarding.stepStoreDesc,
		},
		{
			id: "products",
			title: t.onboarding.stepProducts,
			icon: Package,
			description: t.onboarding.stepProductsDesc,
		},
		{
			id: "delivery",
			title: t.onboarding.stepDelivery,
			icon: Truck,
			description: t.onboarding.stepDeliveryDesc,
		},
		{
			id: "integrations",
			title: t.onboarding.stepIntegrations,
			icon: Link2,
			description: t.onboarding.stepIntegrationsDesc,
		},
		{
			id: "ready",
			title: t.onboarding.stepReady,
			icon: Zap,
			description: t.onboarding.stepReadyDesc,
		},
	];

	const categories = [
		{
			name: t.onboarding.catFashion,
			icon: "👗",
			examples: t.onboarding.catFashionEx,
		},
		{
			name: t.onboarding.catElectronics,
			icon: "📱",
			examples: t.onboarding.catElectronicsEx,
		},
		{
			name: t.onboarding.catBeauty,
			icon: "💄",
			examples: t.onboarding.catBeautyEx,
		},
		{
			name: t.onboarding.catHome,
			icon: "🏠",
			examples: t.onboarding.catHomeEx,
		},
		{
			name: t.onboarding.catSports,
			icon: "🏃",
			examples: t.onboarding.catSportsEx,
		},
		{
			name: t.onboarding.catOther,
			icon: "📦",
			examples: t.onboarding.catOtherEx,
		},
	];

	const deliveryCompanies = [
		{
			name: "Yalidine",
			desc: t.onboarding.yalidineDesc,
			logo: "🟢",
			popular: true,
		},
		{
			name: "ZR Express",
			desc: t.onboarding.zrExpressDesc,
			logo: "🔵",
			popular: false,
		},
		{
			name: "Maystro Delivery",
			desc: t.onboarding.maystroDesc,
			logo: "🟠",
			popular: true,
		},
	];

	const orderSources = [
		{
			name: "WhatsApp",
			icon: "💬",
			desc: t.onboarding.whatsappSource,
			selected: true,
		},
		{
			name: "Manual Entry",
			icon: "✍️",
			desc: t.onboarding.manualSource,
			selected: true,
		},
		{
			name: "Shopify / WooCommerce",
			icon: "🔗",
			desc: t.onboarding.shopifySource,
			selected: false,
		},
	];

	function toggleCategory(name: string) {
		setSelectedCategories((prev) =>
			prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name],
		);
	}

	function toggleDelivery(name: string) {
		setSelectedDelivery((prev) =>
			prev.includes(name) ? prev.filter((d) => d !== name) : [...prev, name],
		);
	}

	function toggleSource(name: string) {
		setSelectedSources((prev) =>
			prev.includes(name) ? prev.filter((s) => s !== name) : [...prev, name],
		);
	}

	async function handleFinish() {
		setSaving(true);
		setError("");
		try {
			await updateSellerProfile({
				business_name: storeName,
				phone,
				wilaya,
				categories: selectedCategories,
				delivery_partners: selectedDelivery,
				order_sources: selectedSources,
				onboarding_completed: true,
			});
			setStep(4);
		} catch (e) {
			const msg =
				e instanceof Error ? e.message : "Failed to save. Please try again.";
			toast({ type: "error", title: t.onboarding?.saveFailed || msg });
			setError(msg);
		} finally {
			setSaving(false);
		}
	}

	async function handleNext() {
		if (step === 3) {
			await handleFinish();
		} else {
			setStep(Math.min(4, step + 1));
		}
	}

	const canProceed =
		step === 0
			? storeName.trim() && phone.trim() && wilaya
			: step === 1
				? selectedCategories.length > 0
				: true;

	return (
		<div
			style={{
				minHeight: "100vh",
				background: "var(--color-surface-primary)",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				padding: "40px 20px",
			}}
		>
			<div style={{ maxWidth: "640px", width: "100%" }}>
				{/* Logo */}
				<div style={{ textAlign: "center", marginBottom: "var(--space-8)" }}>
					<Image
						src="/logo.svg"
						alt="SahelFlow"
						width={48}
						height={48}
						style={{ borderRadius: 10, marginBottom: 8 }}
						unoptimized
					/>
					<h1
						style={{
							fontSize: "var(--font-size-2xl)",
							fontWeight: 800,
							letterSpacing: "var(--letter-spacing-tight)",
						}}
					>
						<span className="sf-gradient-text">SahelFlow</span>
					</h1>
					<p
						style={{
							fontSize: "var(--font-size-sm)",
							color: "var(--color-content-secondary)",
							marginTop: "var(--space-1)",
						}}
					>
						{t.onboarding.wizardSubtitle}
					</p>
				</div>

				{/* Progress */}
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: "4px",
						marginBottom: "28px",
					}}
				>
					{steps.map((s, idx) => (
						<div
							key={s.id}
							style={{
								flex: 1,
								display: "flex",
								flexDirection: "column",
								alignItems: "center",
								gap: "6px",
							}}
						>
							<div
								style={{
									width: "32px",
									height: "32px",
									borderRadius: "50%",
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									background:
										idx <= step
											? "var(--color-brand-400)"
											: "var(--color-surface-tertiary)",
									color:
										idx <= step ? "white" : "var(--color-content-tertiary)",
									fontSize: "12px",
									fontWeight: 700,
									transition: "all 0.3s",
								}}
							>
								{idx < step ? <Check size={14} /> : idx + 1}
							</div>
							<span
								style={{
									fontSize: "10px",
									fontWeight: idx === step ? 600 : 400,
									color:
										idx === step
											? "var(--color-brand-400)"
											: "var(--color-content-tertiary)",
								}}
							>
								{s.title}
							</span>
						</div>
					))}
				</div>

				{/* Card */}
				<div
					className="sf-card sf-animate-in"
					style={{ padding: "var(--space-8)" }}
				>
					{step === 0 && (
						<div
							style={{ display: "flex", flexDirection: "column", gap: "18px" }}
						>
							<div style={{ textAlign: "center", marginBottom: "8px" }}>
								<span style={{ fontSize: "40px" }}>🏪</span>
								<h2
									style={{
										fontSize: "18px",
										fontWeight: 700,
										color: "var(--color-content-primary)",
										marginTop: "8px",
									}}
								>
									{t.onboarding.aboutYourStore}
								</h2>
							</div>
							<div>
								<label
									style={{
										fontSize: "12px",
										fontWeight: 500,
										color: "var(--color-content-secondary)",
										display: "block",
										marginBottom: "6px",
									}}
								>
									{t.onboarding.storeName} *
								</label>
								<input
									className="sf-input"
									placeholder={t.onboarding.storeNamePlaceholder}
									value={storeName}
									onChange={(e) => setStoreName(e.target.value)}
									style={{ width: "100%" }}
								/>
							</div>
							<div>
								<label
									style={{
										fontSize: "12px",
										fontWeight: 500,
										color: "var(--color-content-secondary)",
										display: "block",
										marginBottom: "6px",
									}}
								>
									<Phone
										size={12}
										style={{
											display: "inline",
											verticalAlign: "middle",
											marginInlineEnd: "4px",
										}}
									/>
									{t.onboarding.whatsappNumber} *
								</label>
								<input
									className="sf-input"
									placeholder={t.onboarding.whatsappPlaceholder}
									value={phone}
									onChange={(e) => setPhone(e.target.value)}
									style={{ width: "100%" }}
								/>
							</div>
							<div>
								<label
									style={{
										fontSize: "12px",
										fontWeight: 500,
										color: "var(--color-content-secondary)",
										display: "block",
										marginBottom: "6px",
									}}
								>
									{t.onboarding.wilaya} *
								</label>
								<select
									className="sf-input"
									value={wilaya}
									onChange={(e) => setWilaya(e.target.value)}
									style={{ width: "100%", appearance: "auto" }}
								>
									<option value="">{t.onboarding.selectWilaya}</option>
									{WILAYA_NAMES.map((w) => (
										<option key={w} value={w}>
											{w}
										</option>
									))}
								</select>
							</div>
						</div>
					)}

					{step === 1 && (
						<div>
							<div style={{ textAlign: "center", marginBottom: "18px" }}>
								<span style={{ fontSize: "40px" }}>📦</span>
								<h2
									style={{
										fontSize: "18px",
										fontWeight: 700,
										color: "var(--color-content-primary)",
										marginTop: "8px",
									}}
								>
									{t.onboarding.whatDoYouSell}
								</h2>
								<p
									style={{
										fontSize: "12px",
										color: "var(--color-content-tertiary)",
									}}
								>
									{t.onboarding.selectCategories}
								</p>
							</div>
							<div
								style={{
									display: "grid",
									gridTemplateColumns: "repeat(2, 1fr)",
									gap: "10px",
								}}
							>
								{categories.map((cat) => (
									<button
										key={cat.name}
										onClick={() => toggleCategory(cat.name)}
										style={{
											padding: "14px",
											borderRadius: "10px",
											textAlign: "left",
											border: selectedCategories.includes(cat.name)
												? "2px solid var(--color-brand-400)"
												: "1px solid var(--color-line-primary)",
											background: selectedCategories.includes(cat.name)
												? "rgba(99,102,241,0.05)"
												: "var(--color-surface-secondary)",
											cursor: "pointer",
											fontFamily: "inherit",
										}}
									>
										<span style={{ fontSize: "24px" }}>{cat.icon}</span>
										<p
											style={{
												fontSize: "13px",
												fontWeight: 600,
												color: "var(--color-content-primary)",
												marginTop: "6px",
											}}
										>
											{cat.name}
										</p>
										<p
											style={{
												fontSize: "10px",
												color: "var(--color-content-tertiary)",
												marginTop: "2px",
											}}
										>
											{cat.examples}
										</p>
									</button>
								))}
							</div>
						</div>
					)}

					{step === 2 && (
						<div>
							<div style={{ textAlign: "center", marginBottom: "18px" }}>
								<span style={{ fontSize: "40px" }}>🚛</span>
								<h2
									style={{
										fontSize: "18px",
										fontWeight: 700,
										color: "var(--color-content-primary)",
										marginTop: "8px",
									}}
								>
									{t.onboarding.deliveryPartners}
								</h2>
								<p
									style={{
										fontSize: "12px",
										color: "var(--color-content-tertiary)",
									}}
								>
									{t.onboarding.selectDeliveryPartners}
								</p>
							</div>
							<div
								style={{
									display: "flex",
									flexDirection: "column",
									gap: "10px",
								}}
							>
								{deliveryCompanies.map((d) => (
									<button
										key={d.name}
										onClick={() => toggleDelivery(d.name)}
										style={{
											display: "flex",
											alignItems: "center",
											gap: "14px",
											padding: "16px",
											borderRadius: "10px",
											border: selectedDelivery.includes(d.name)
												? "2px solid var(--color-brand-400)"
												: "1px solid var(--color-line-primary)",
											background: selectedDelivery.includes(d.name)
												? "rgba(99,102,241,0.05)"
												: "var(--color-surface-secondary)",
											cursor: "pointer",
											fontFamily: "inherit",
											width: "100%",
											textAlign: "left",
										}}
									>
										<span style={{ fontSize: "28px" }}>{d.logo}</span>
										<div style={{ flex: 1 }}>
											<div
												style={{
													display: "flex",
													alignItems: "center",
													gap: "8px",
												}}
											>
												<p
													style={{
														fontSize: "14px",
														fontWeight: 600,
														color: "var(--color-content-primary)",
													}}
												>
													{d.name}
												</p>
												{d.popular && (
													<span
														style={{
															fontSize: "9px",
															padding: "2px 6px",
															borderRadius: "4px",
															background: "rgba(16,185,129,0.1)",
															color: "var(--color-accent-400)",
															fontWeight: 600,
														}}
													>
														{t.onboarding.popular}
													</span>
												)}
											</div>
											<p
												style={{
													fontSize: "12px",
													color: "var(--color-content-secondary)",
													marginTop: "2px",
												}}
											>
												{d.desc}
											</p>
										</div>
										{selectedDelivery.includes(d.name) && (
											<div
												style={{
													width: "24px",
													height: "24px",
													borderRadius: "50%",
													background: "var(--color-brand-400)",
													color: "white",
													display: "flex",
													alignItems: "center",
													justifyContent: "center",
												}}
											>
												<Check size={14} />
											</div>
										)}
									</button>
								))}
							</div>
						</div>
					)}

					{step === 3 && (
						<div>
							<div style={{ textAlign: "center", marginBottom: "18px" }}>
								<span style={{ fontSize: "40px" }}>🔗</span>
								<h2
									style={{
										fontSize: "18px",
										fontWeight: 700,
										color: "var(--color-content-primary)",
										marginTop: "8px",
									}}
								>
									{t.onboarding.howOrdersComeIn}
								</h2>
								<p
									style={{
										fontSize: "12px",
										color: "var(--color-content-tertiary)",
									}}
								>
									{t.onboarding.selectOrderSources}
								</p>
							</div>
							<div
								style={{
									display: "flex",
									flexDirection: "column",
									gap: "10px",
								}}
							>
								{orderSources.map((src) => (
									<button
										key={src.name}
										onClick={() => toggleSource(src.name)}
										style={{
											display: "flex",
											alignItems: "center",
											gap: "14px",
											padding: "16px",
											borderRadius: "10px",
											border: selectedSources.includes(src.name)
												? "2px solid var(--color-brand-400)"
												: "1px solid var(--color-line-primary)",
											background: selectedSources.includes(src.name)
												? "rgba(99,102,241,0.05)"
												: "var(--color-surface-secondary)",
											cursor: "pointer",
											fontFamily: "inherit",
											width: "100%",
											textAlign: "left",
										}}
									>
										<span style={{ fontSize: "28px" }}>{src.icon}</span>
										<div style={{ flex: 1 }}>
											<p
												style={{
													fontSize: "14px",
													fontWeight: 600,
													color: "var(--color-content-primary)",
												}}
											>
												{src.name}
											</p>
											<p
												style={{
													fontSize: "12px",
													color: "var(--color-content-secondary)",
													marginTop: "2px",
												}}
											>
												{src.desc}
											</p>
										</div>
										{selectedSources.includes(src.name) && (
											<div
												style={{
													width: "24px",
													height: "24px",
													borderRadius: "50%",
													background: "var(--color-brand-400)",
													color: "white",
													display: "flex",
													alignItems: "center",
													justifyContent: "center",
												}}
											>
												<Check size={14} />
											</div>
										)}
									</button>
								))}
							</div>
						</div>
					)}

					{step === 4 && (
						<div style={{ textAlign: "center", padding: "20px 0" }}>
							<span style={{ fontSize: "60px" }}>🚀</span>
							<h2
								style={{
									fontSize: "22px",
									fontWeight: 700,
									color: "var(--color-content-primary)",
									marginTop: "16px",
								}}
							>
								{t.onboarding.youreAllSet}, {storeName || "Boss"}!
							</h2>
							<p
								style={{
									fontSize: "14px",
									color: "var(--color-content-secondary)",
									marginTop: "8px",
									maxWidth: "380px",
									margin: "8px auto 0",
								}}
							>
								{t.onboarding.dashboardReady}
							</p>
							<div
								style={{
									display: "grid",
									gridTemplateColumns: "repeat(3, 1fr)",
									gap: "10px",
									marginTop: "24px",
									padding: "16px",
									borderRadius: "12px",
									background: "var(--color-surface-tertiary)",
								}}
							>
								<div>
									<p
										style={{
											fontSize: "20px",
											fontWeight: 700,
											color: "var(--color-brand-400)",
										}}
									>
										∞
									</p>
									<p
										style={{
											fontSize: "10px",
											color: "var(--color-content-tertiary)",
										}}
									>
										{t.onboarding.unlimitedOrders}
									</p>
								</div>
								<div>
									<p
										style={{
											fontSize: "20px",
											fontWeight: 700,
											color: "var(--color-accent-400)",
										}}
									>
										AI
									</p>
									<p
										style={{
											fontSize: "10px",
											color: "var(--color-content-tertiary)",
										}}
									>
										{t.onboarding.smartBrain}
									</p>
								</div>
								<div>
									<p
										style={{
											fontSize: "20px",
											fontWeight: 700,
											color: "#8b5cf6",
										}}
									>
										24/7
									</p>
									<p
										style={{
											fontSize: "10px",
											color: "var(--color-content-tertiary)",
										}}
									>
										{t.onboarding.autoConfirm}
									</p>
								</div>
							</div>
							<button
								onClick={() => router.push("/dashboard")}
								className="sf-btn sf-btn-primary"
								style={{
									marginTop: "24px",
									padding: "12px 32px",
									fontSize: "15px",
									display: "inline-flex",
									alignItems: "center",
									gap: "8px",
								}}
							>
								{t.onboarding.launchDashboard} <ArrowRight size={18} />
							</button>
						</div>
					)}

					{error && (
						<p
							style={{
								color: "var(--color-danger-400)",
								fontSize: "13px",
								marginTop: "12px",
								textAlign: "center",
							}}
						>
							{error}
						</p>
					)}
				</div>

				{/* Navigation */}
				{step < 4 && (
					<div
						style={{
							display: "flex",
							justifyContent: "space-between",
							marginTop: "16px",
						}}
					>
						<button
							onClick={() => setStep(Math.max(0, step - 1))}
							className="sf-btn sf-btn-ghost"
							style={{
								fontSize: "13px",
								display: "flex",
								alignItems: "center",
								gap: "6px",
								visibility: step === 0 ? "hidden" : "visible",
							}}
						>
							<ArrowLeft size={14} /> {t.onboarding.back}
						</button>
						<button
							onClick={handleNext}
							className="sf-btn sf-btn-primary"
							disabled={!canProceed || saving}
							style={{
								fontSize: "13px",
								padding: "8px 20px",
								display: "flex",
								alignItems: "center",
								gap: "6px",
							}}
						>
							{saving ? (
								<>
									<Loader2
										size={14}
										style={{ animation: "spin 1s linear infinite" }}
									/>{" "}
									{t.onboarding.saving}
								</>
							) : (
								<>
									{step === 3
										? t.onboarding.finishSetup
										: t.onboarding.continue}{" "}
									<ArrowRight size={14} />
								</>
							)}
						</button>
					</div>
				)}
			</div>
		</div>
	);
}
