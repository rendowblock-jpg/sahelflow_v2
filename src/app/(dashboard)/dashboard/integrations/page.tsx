"use client";

import { useState, useEffect } from "react";
import {
	Copy,
	Check,
	RefreshCw,
	Truck,
	Package,
	Webhook,
	Zap,
	Globe,
	Link2,
	ArrowRight,
	ShoppingBag,
	ShoppingCart,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/client";
import { getIntegrations, saveIntegration } from "@/lib/integrations/service";
import { useToast } from "@/components/dashboard/ToastProvider";
import { PageTransition } from "@/components/ui/motion";

const STORES = [
	{
		id: "shopify",
		name: "Shopify",
		logo: "🛍️",
		steps: [
			"Go to your Shopify Admin → Settings → Notifications",
			'Click "Create webhook" at the bottom',
			"Event: Order creation",
			"Format: JSON",
			"Paste the Webhook URL below",
		],
	},
	{
		id: "woocommerce",
		name: "WooCommerce",
		logo: "🛒",
		steps: [
			"Go to WooCommerce → Settings → Advanced → Webhooks",
			'Click "Add webhook"',
			"Topic: Order created",
			"Delivery URL: paste the Webhook URL below",
			"Save webhook",
		],
	},
	{
		id: "youcan",
		name: "YouCan",
		logo: "🇩🇿",
		steps: [
			"Go to your YouCan Seller Area → Settings → API",
			"Generate an Access Token",
			"Copy your Store URL (e.g., https://my-store.youcan.shop)",
			"Paste both into the fields below and save",
			"For webhooks, also provide your OAuth Client Secret (optional)",
		],
	},
	{
		id: "custom",
		name: "Custom / API",
		logo: "⚡",
		steps: [
			"Send a POST request to the Webhook URL",
			"Include the Secret Token in the X-SahelFlow-Token header",
			"Body should include: customer_name, phone, wilaya, address, items[], total",
			"SahelFlow will create the order automatically",
		],
	},
];

const TABS = [
	{ id: "webhook", label: "Webhook Credentials", icon: Webhook },
	{ id: "delivery", label: "Delivery Connections", icon: Truck },
	{ id: "sync", label: "Store Sync", icon: Package },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function IntegrationsPage() {
	const { t } = useI18n();
	const { toast } = useToast();
	const [activeTab, setActiveTab] = useState<TabId>("webhook");

	const [webhookToken, setWebhookToken] = useState<string>("");
	const [copied, setCopied] = useState<"url" | "secret" | null>(null);
	const [testing, setTesting] = useState(false);
	const [testResult, setTestResult] = useState<"ok" | "fail" | null>(null);
	const [selectedStore, setSelectedStore] = useState<string>("shopify");
	const [ordersReceived, setOrdersReceived] = useState(0);
	const [lastSync, setLastSync] = useState<string | null>(null);

	const [yalidineApiId, setYalidineApiId] = useState("");
	const [yalidineApiToken, setYalidineApiToken] = useState("");
	const [savingDelivery, setSavingDelivery] = useState(false);

	const [zrApiId, setZrApiId] = useState("");
	const [zrApiKey, setZrApiKey] = useState("");
	const [savingZr, setSavingZr] = useState(false);

	const [maystroApiToken, setMaystroApiToken] = useState("");
	const [savingMaystro, setSavingMaystro] = useState(false);

	const [shopifyStoreUrl, setShopifyStoreUrl] = useState("");
	const [shopifyAdminToken, setShopifyAdminToken] = useState("");
	const [savingShopify, setSavingShopify] = useState(false);
	const [syncing, setSyncing] = useState(false);
	const [syncResult, setSyncResult] = useState<number | null>(null);

	const [youcanStoreUrl, setYoucanStoreUrl] = useState("");
	const [youcanAccessToken, setYoucanAccessToken] = useState("");
	const [youcanWebhookSecret, setYoucanWebhookSecret] = useState("");
	const [savingYouCan, setSavingYouCan] = useState(false);
	const [youcanSyncing, setYoucanSyncing] = useState(false);
	const [youcanSyncResult, setYoucanSyncResult] = useState<number | null>(null);

	const [wooStoreUrl, setWooStoreUrl] = useState("");
	const [wooConsumerKey, setWooConsumerKey] = useState("");
	const [wooConsumerSecret, setWooConsumerSecret] = useState("");
	const [wooWebhookSecret, setWooWebhookSecret] = useState("");
	const [savingWoo, setSavingWoo] = useState(false);
	const [wooSyncing, setWooSyncing] = useState(false);
	const [wooSyncResult, setWooSyncResult] = useState<number | null>(null);

	useEffect(() => {
		async function load() {
			const supabase = createClient();
			const {
				data: { user },
			} = await supabase.auth.getUser();
			if (!user) return;

			const { data } = await supabase
				.from("sellers")
				.select("webhook_token, webhook_orders_count, webhook_last_sync")
				.eq("id", user.id)
				.single();

			if (data) {
				setWebhookToken(
					data.webhook_token || user.id.replace(/-/g, "").slice(0, 24),
				);
				setOrdersReceived(data.webhook_orders_count || 0);
				setLastSync(data.webhook_last_sync || null);
			} else {
				setWebhookToken(user.id.replace(/-/g, "").slice(0, 24));
			}
		}
		load();
	}, []);

	useEffect(() => {
		async function loadIntegrations() {
			try {
				const integrations = await getIntegrations();
				const yalidine = integrations.find((i) => i.platform === "yalidine");
				if (yalidine?.credentials) {
					setYalidineApiId(String(yalidine.credentials.api_id || ""));
					setYalidineApiToken(String(yalidine.credentials.api_token || ""));
				}
				const zr = integrations.find((i) => i.platform === "zrexpress");
				if (zr?.credentials) {
					setZrApiId(String(zr.credentials.api_id || ""));
					setZrApiKey(String(zr.credentials.api_key || ""));
				}
				const maystro = integrations.find((i) => i.platform === "maystro");
				if (maystro?.credentials) {
					setMaystroApiToken(String(maystro.credentials.api_token || ""));
				}
				const shopify = integrations.find((i) => i.platform === "shopify");
				if (shopify?.credentials) {
					setShopifyStoreUrl(String(shopify.credentials.shop_url || ""));
					setShopifyAdminToken(String(shopify.credentials.access_token || ""));
				}
				const youcan = integrations.find((i) => i.platform === "youcan");
				if (youcan?.credentials) {
					setYoucanStoreUrl(String(youcan.credentials.store_url || ""));
					setYoucanAccessToken(String(youcan.credentials.access_token || ""));
					setYoucanWebhookSecret(String(youcan.credentials.webhook_secret || ""));
				}
				const woo = integrations.find((i) => i.platform === "woocommerce");
				if (woo?.credentials) {
					setWooStoreUrl(String(woo.credentials.store_url || ""));
					setWooConsumerKey(String(woo.credentials.consumer_key || ""));
					setWooConsumerSecret(String(woo.credentials.consumer_secret || ""));
					setWooWebhookSecret(String(woo.credentials.webhook_secret || ""));
				}
			} catch {
				/* silent */
			}
		}
		loadIntegrations();
	}, []);

	async function handleSaveYalidine() {
		setSavingDelivery(true);
		try {
			await saveIntegration("yalidine", { api_id: yalidineApiId, api_token: yalidineApiToken });
			toast({ type: "success", title: t.integrations.saved });
		} catch {
			toast({ type: "error", title: t.integrations.saveFailed });
		} finally { setSavingDelivery(false); }
	}

	async function handleSaveZr() {
		setSavingZr(true);
		try {
			await saveIntegration("zrexpress", { api_id: zrApiId, api_key: zrApiKey });
			toast({ type: "success", title: t.integrations.saved });
		} catch {
			toast({ type: "error", title: t.integrations.saveFailed });
		} finally { setSavingZr(false); }
	}

	async function handleSaveMaystro() {
		setSavingMaystro(true);
		try {
			await saveIntegration("maystro", { api_token: maystroApiToken });
			toast({ type: "success", title: t.integrations.saved });
		} catch {
			toast({ type: "error", title: t.integrations.saveFailed });
		} finally { setSavingMaystro(false); }
	}

	async function handleSaveShopify() {
		setSavingShopify(true);
		try {
			await saveIntegration("shopify", { shop_url: shopifyStoreUrl, access_token: shopifyAdminToken });
			toast({ type: "success", title: t.integrations.saved });
		} catch {
			toast({ type: "error", title: t.integrations.saveFailed });
		} finally { setSavingShopify(false); }
	}

	async function handleSync() {
		setSyncing(true); setSyncResult(null);
		try {
			const res = await fetch("/api/integrations/sync", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ platform: "shopify" }),
			});
			const data = await res.json();
			if (res.ok && data.success) {
				setSyncResult(data.count);
				toast({ type: "success", title: t.integrations.syncSuccess.replace("{n}", String(data.count)) });
			} else {
				toast({ type: "error", title: data.error || t.common.error });
			}
		} catch { toast({ type: "error", title: "Sync failed" });
		} finally { setSyncing(false); }
	}

	async function handleSaveYouCan() {
		setSavingYouCan(true);
		try {
			await saveIntegration("youcan", { store_url: youcanStoreUrl, access_token: youcanAccessToken, webhook_secret: youcanWebhookSecret });
			toast({ type: "success", title: t.integrations.saved });
		} catch {
			toast({ type: "error", title: t.integrations.saveFailed });
		} finally { setSavingYouCan(false); }
	}

	async function handleYouCanSync() {
		setYoucanSyncing(true); setYoucanSyncResult(null);
		try {
			const res = await fetch("/api/integrations/sync", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ platform: "youcan" }),
			});
			const data = await res.json();
			if (res.ok && data.success) {
				setYoucanSyncResult(data.count);
				toast({ type: "success", title: t.integrations.syncSuccess.replace("{n}", String(data.count)) });
			} else { toast({ type: "error", title: data.error || "Sync failed" }); }
		} catch { toast({ type: "error", title: "Sync failed" });
		} finally { setYoucanSyncing(false); }
	}

	async function handleSaveWooCommerce() {
		setSavingWoo(true);
		try {
			await saveIntegration("woocommerce", { store_url: wooStoreUrl, consumer_key: wooConsumerKey, consumer_secret: wooConsumerSecret, webhook_secret: wooWebhookSecret });
			toast({ type: "success", title: t.integrations.saved });
		} catch {
			toast({ type: "error", title: t.integrations.saveFailed });
		} finally { setSavingWoo(false); }
	}

	async function handleWooSync() {
		setWooSyncing(true); setWooSyncResult(null);
		try {
			const res = await fetch("/api/integrations/sync", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ platform: "woocommerce" }),
			});
			const data = await res.json();
			if (res.ok && data.success) {
				setWooSyncResult(data.count);
				toast({ type: "success", title: t.integrations.syncSuccess.replace("{n}", String(data.count)) });
			} else { toast({ type: "error", title: data.error || "Sync failed" }); }
		} catch { toast({ type: "error", title: "Sync failed" });
		} finally { setWooSyncing(false); }
	}

	const webhookUrl = webhookToken
		? `${typeof window !== "undefined" ? window.location.origin : "https://sahelflow.vercel.app"}/api/webhooks/store/${webhookToken}`
		: "";

	async function handleCopy(type: "url" | "secret") {
		const text = type === "url" ? webhookUrl : webhookToken;
		await navigator.clipboard.writeText(text);
		setCopied(type);
		setTimeout(() => setCopied(null), 2000);
	}

	async function handleTest() {
		setTesting(true); setTestResult(null);
		try {
			const res = await fetch(`/api/webhooks/store/${webhookToken}`, {
				method: "POST",
				headers: { "Content-Type": "application/json", "X-SahelFlow-Token": webhookToken, "X-SahelFlow-Test": "true" },
				body: JSON.stringify({ test: true }),
			});
			setTestResult(res.ok ? "ok" : "fail");
		} catch { setTestResult("fail");
		} finally {
			setTesting(false);
			setTimeout(() => setTestResult(null), 4000);
		}
	}

	const selectedInfo = STORES.find((s) => s.id === selectedStore)!;

	return (
		<PageTransition className="sf-flex-col sf-gap-xl">
			{/* Page Header */}
			<div className="sf-page-header">
				<div>
					<h1 className="sf-page-title">{t.integrations.title}</h1>
					<p className="sf-page-subtitle">{t.integrations.subtitle}</p>
				</div>
				{ordersReceived > 0 && (
					<div className="sf-integrations-header-stats">
						<div className="sf-integrations-status-dot" />
						<div>
							<p className="sf-text-xs sf-text-tertiary">{t.integrations.ordersReceived}</p>
							<p className="sf-font-semibold sf-text-sm" style={{ color: "var(--color-content-primary)", marginTop: 1 }}>{ordersReceived} orders synced</p>
						</div>
						{lastSync && (
							<>
								<div className="sf-integrations-divider" />
								<div>
									<p className="sf-text-xs sf-text-tertiary">{t.integrations.lastSync}</p>
									<p className="sf-font-semibold sf-text-sm" style={{ marginTop: 1 }}>{new Date(lastSync).toLocaleString()}</p>
								</div>
							</>
						)}
					</div>
				)}
			</div>

			{/* Side-Rail Layout */}
			<div className="sf-settings-layout">
				{/* Left Navigation Rail */}
				<div className="sf-settings-rail">
					{TABS.map((tab) => {
						const Icon = tab.icon;
						const isActive = activeTab === tab.id;
						return (
							<button
								key={tab.id}
								onClick={() => setActiveTab(tab.id)}
								className={`sf-settings-rail-item ${isActive ? "active" : ""}`}
								type="button"
							>
								<Icon size={15} className="sf-flex-shrink-0" />
								<span>{tab.label}</span>
							</button>
						);
					})}

					{/* Quick status overview */}
					<div className="sf-integr-rail-status">
						<p className="sf-text-xs sf-text-tertiary" style={{ marginBottom: 8, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Status</p>
						<div className="sf-integr-rail-status-item">
							<span className={`sf-integr-dot ${yalidineApiId ? "sf-integr-dot--on" : ""}`} />
							<span>Yalidine</span>
						</div>
						<div className="sf-integr-rail-status-item">
							<span className={`sf-integr-dot ${zrApiId ? "sf-integr-dot--on" : ""}`} />
							<span>ZR Express</span>
						</div>
						<div className="sf-integr-rail-status-item">
							<span className={`sf-integr-dot ${maystroApiToken ? "sf-integr-dot--on" : ""}`} />
							<span>Maystro</span>
						</div>
						<div className="sf-integr-rail-status-item">
							<span className={`sf-integr-dot ${shopifyStoreUrl ? "sf-integr-dot--on" : ""}`} />
							<span>Shopify</span>
						</div>
						<div className="sf-integr-rail-status-item">
							<span className={`sf-integr-dot ${youcanStoreUrl ? "sf-integr-dot--on" : ""}`} />
							<span>YouCan</span>
						</div>
						<div className="sf-integr-rail-status-item">
							<span className={`sf-integr-dot ${wooStoreUrl ? "sf-integr-dot--on" : ""}`} />
							<span>WooCommerce</span>
						</div>
					</div>
				</div>

				{/* Content Area */}
				<div className="sf-settings-content-area">

					{/* ── TAB: Webhook Credentials ── */}
					{activeTab === "webhook" && (
						<div className="sf-flex-col sf-gap-xl">
							<div className="sf-settings-section">
								<div className="sf-settings-section-header">
									<div className="sf-flex sf-items-center sf-gap-sm">
										<div className="sf-icon-box-sm sf-icon-brand"><Webhook size={14} /></div>
										<h3 className="sf-settings-section-title">Webhook Credentials</h3>
									</div>
									<p className="sf-settings-section-desc">Use these to receive orders from any platform. Paste the URL into your store&apos;s webhook settings.</p>
								</div>

								{/* URL field */}
								<div className="sf-settings-field-group">
									<div className="sf-integr-field">
										<label className="sf-label">{t.integrations.webhookUrl}</label>
										<div className="sf-integr-input-row">
											<div className="sf-integr-monospace-wrap">
												<Webhook size={13} className="sf-integr-mono-icon" />
												<input
													className="sf-input sf-integr-mono-input"
													value={webhookUrl}
													readOnly
													dir="ltr"
													style={{ fontFamily: "monospace", fontSize: 12 }}
												/>
											</div>
											<button
												className={`sf-btn sf-btn-ghost sf-integr-copy-btn ${copied === "url" ? "sf-integr-copy-btn--done" : ""}`}
												onClick={() => handleCopy("url")}
											>
												{copied === "url" ? <Check size={15} /> : <Copy size={15} />}
												{copied === "url" ? "Copied" : t.integrations.copy}
											</button>
										</div>
									</div>

									<div className="sf-integr-field">
										<label className="sf-label">{t.integrations.webhookSecret}</label>
										<div className="sf-integr-input-row">
											<div className="sf-integr-monospace-wrap">
												<Link2 size={13} className="sf-integr-mono-icon" />
												<input
													className="sf-input sf-integr-mono-input"
													value={webhookToken}
													readOnly
													dir="ltr"
													style={{ fontFamily: "monospace", fontSize: 12 }}
												/>
											</div>
											<button
												className={`sf-btn sf-btn-ghost sf-integr-copy-btn ${copied === "secret" ? "sf-integr-copy-btn--done" : ""}`}
												onClick={() => handleCopy("secret")}
											>
												{copied === "secret" ? <Check size={15} /> : <Copy size={15} />}
												{copied === "secret" ? "Copied" : t.integrations.copy}
											</button>
										</div>
									</div>

									<div className="sf-integr-test-row">
										<button
											className={`sf-btn ${testResult === "ok" ? "sf-btn-primary" : testResult === "fail" ? "sf-btn-destructive" : "sf-btn-ghost"}`}
											onClick={handleTest}
											disabled={testing}
										>
											<RefreshCw size={14} className={testing ? "sf-animate-spin" : ""} style={{ marginInlineEnd: 6 }} />
											{testing ? t.integrations.testing : testResult === "ok" ? "✓ Connected!" : testResult === "fail" ? "✗ Failed" : t.integrations.testWebhook}
										</button>
										<p className="sf-text-xs sf-text-tertiary" style={{ maxWidth: 360 }}>
											{t.integrations.noApiRequired}
										</p>
									</div>
								</div>
							</div>

							{/* Platform Setup Guide */}
							<div className="sf-settings-section">
								<div className="sf-settings-section-header">
									<div className="sf-flex sf-items-center sf-gap-sm">
										<div className="sf-icon-box-sm sf-icon-brand"><Globe size={14} /></div>
										<h3 className="sf-settings-section-title">Platform Setup Guide</h3>
									</div>
									<p className="sf-settings-section-desc">Step-by-step instructions for connecting your storefront.</p>
								</div>
								<div className="sf-settings-field-group">
									<div className="sf-integr-platform-tabs">
										{STORES.map((s) => (
											<button
												key={s.id}
												onClick={() => setSelectedStore(s.id)}
												className={`sf-integr-platform-tab ${selectedStore === s.id ? "sf-integr-platform-tab--active" : ""}`}
												type="button"
											>
												<span>{s.logo}</span>
												<span>{s.name}</span>
											</button>
										))}
									</div>
									<div className="sf-integr-steps-card">
										<div className="sf-integr-steps-header">
											<span className="sf-integr-steps-logo">{selectedInfo.logo}</span>
											<span className="sf-font-semibold sf-text-sm">{selectedInfo.name} — Setup Steps</span>
										</div>
										<ol className="sf-integr-steps-list">
											{selectedInfo.steps.map((step, i) => (
												<li key={i} className="sf-integr-step-item">
													<span className="sf-integr-step-num">{i + 1}</span>
													<span className="sf-integr-step-text">{step}</span>
												</li>
											))}
										</ol>
									</div>
								</div>
							</div>
						</div>
					)}

					{/* ── TAB: Delivery Connections ── */}
					{activeTab === "delivery" && (
						<div className="sf-flex-col sf-gap-xl">
							<div className="sf-settings-section">
								<div className="sf-settings-section-header">
									<div className="sf-flex sf-items-center sf-gap-sm">
										<div className="sf-icon-box-sm sf-icon-brand"><Truck size={14} /></div>
										<h3 className="sf-settings-section-title">{t.integrations.deliveryConnections}</h3>
									</div>
									<p className="sf-settings-section-desc">Connect Algerian delivery providers to auto-generate waybills and ship orders.</p>
								</div>

								{/* Yalidine */}
								<div className="sf-settings-field-group">
									<div className="sf-integr-provider-header">
										<div className="sf-integr-provider-logo">📦</div>
										<div className="sf-integr-provider-info">
											<p className="sf-font-semibold sf-text-sm">Yalidine</p>
											<p className="sf-text-xs sf-text-tertiary">Algeria&apos;s #1 delivery network</p>
										</div>
										{yalidineApiId && <span className="sf-badge sf-badge-success" style={{ fontSize: 10, marginInlineStart: "auto" }}>Connected</span>}
									</div>
									<div className="sf-integr-fields-grid">
										<div>
											<label className="sf-label">{t.integrations.yalidineApiId}</label>
											<input className="sf-input" style={{ marginTop: 4 }} value={yalidineApiId} onChange={(e) => setYalidineApiId(e.target.value)} placeholder="your-api-id" dir="ltr" />
										</div>
										<div>
											<label className="sf-label">{t.integrations.yalidineApiToken}</label>
											<input className="sf-input" style={{ marginTop: 4 }} type="password" value={yalidineApiToken} onChange={(e) => setYalidineApiToken(e.target.value)} placeholder="your-api-token" dir="ltr" />
										</div>
									</div>
									<div className="sf-settings-section-footer">
										<button className="sf-btn sf-btn-primary" onClick={handleSaveYalidine} disabled={savingDelivery || !yalidineApiId || !yalidineApiToken}>
											{savingDelivery ? t.integrations.saving : t.integrations.save}
										</button>
									</div>
								</div>

								<div className="sf-settings-divider" />

								{/* ZR Express */}
								<div className="sf-settings-field-group">
									<div className="sf-integr-provider-header">
										<div className="sf-integr-provider-logo">✈️</div>
										<div className="sf-integr-provider-info">
											<p className="sf-font-semibold sf-text-sm">ZR Express</p>
											<p className="sf-text-xs sf-text-tertiary">{t.integrations.zrExpressDesc}</p>
										</div>
										{zrApiId && <span className="sf-badge sf-badge-success" style={{ fontSize: 10, marginInlineStart: "auto" }}>Connected</span>}
									</div>
									<div className="sf-integr-fields-grid">
										<div>
											<label className="sf-label">API ID</label>
											<input className="sf-input" style={{ marginTop: 4 }} value={zrApiId} onChange={(e) => setZrApiId(e.target.value)} placeholder="your-api-id" dir="ltr" />
										</div>
										<div>
											<label className="sf-label">API Key</label>
											<input className="sf-input" style={{ marginTop: 4 }} type="password" value={zrApiKey} onChange={(e) => setZrApiKey(e.target.value)} placeholder="your-api-key" dir="ltr" />
										</div>
									</div>
									<div className="sf-settings-section-footer">
										<button className="sf-btn sf-btn-primary" onClick={handleSaveZr} disabled={savingZr || !zrApiId || !zrApiKey}>
											{savingZr ? t.integrations.saving : t.integrations.save}
										</button>
									</div>
								</div>

								<div className="sf-settings-divider" />

								{/* Maystro */}
								<div className="sf-settings-field-group">
									<div className="sf-integr-provider-header">
										<div className="sf-integr-provider-logo">🚚</div>
										<div className="sf-integr-provider-info">
											<p className="sf-font-semibold sf-text-sm">Maystro Delivery</p>
											<p className="sf-text-xs sf-text-tertiary">{t.integrations.maystroDesc}</p>
										</div>
										{maystroApiToken && <span className="sf-badge sf-badge-success" style={{ fontSize: 10, marginInlineStart: "auto" }}>Connected</span>}
									</div>
									<div>
										<label className="sf-label">API Token</label>
										<input className="sf-input" style={{ marginTop: 4 }} type="password" value={maystroApiToken} onChange={(e) => setMaystroApiToken(e.target.value)} placeholder="your-api-token" dir="ltr" />
									</div>
									<div className="sf-settings-section-footer">
										<button className="sf-btn sf-btn-primary" onClick={handleSaveMaystro} disabled={savingMaystro || !maystroApiToken}>
											{savingMaystro ? t.integrations.saving : t.integrations.save}
										</button>
									</div>
								</div>
							</div>
						</div>
					)}

					{/* ── TAB: Store Sync ── */}
					{activeTab === "sync" && (
						<div className="sf-flex-col sf-gap-xl">
							<div className="sf-settings-section">
								<div className="sf-settings-section-header">
									<div className="sf-flex sf-items-center sf-gap-sm">
										<div className="sf-icon-box-sm sf-icon-brand"><Package size={14} /></div>
										<h3 className="sf-settings-section-title">{t.integrations.catalogSync}</h3>
									</div>
									<p className="sf-settings-section-desc">Sync products and orders from your e-commerce storefront. Credentials are encrypted and stored securely.</p>
								</div>

								{/* Shopify */}
								<div className="sf-settings-field-group">
									<div className="sf-integr-provider-header">
										<div className="sf-integr-provider-logo">🛍️</div>
										<div className="sf-integr-provider-info">
											<p className="sf-font-semibold sf-text-sm">Shopify</p>
											<p className="sf-text-xs sf-text-tertiary">Sync orders &amp; products automatically</p>
										</div>
										{shopifyStoreUrl && <span className="sf-badge sf-badge-success" style={{ fontSize: 10, marginInlineStart: "auto" }}>Connected</span>}
									</div>
									<div className="sf-integr-fields-grid">
										<div>
											<label className="sf-label">{t.integrations.shopifyStoreUrl}</label>
											<div className="sf-integr-input-row" style={{ marginTop: 4 }}>
												<div className="sf-integr-monospace-wrap" style={{ flex: 1 }}>
													<ShoppingBag size={13} className="sf-integr-mono-icon" />
													<input className="sf-input sf-integr-mono-input" value={shopifyStoreUrl} onChange={(e) => setShopifyStoreUrl(e.target.value)} placeholder="mystore.myshopify.com" dir="ltr" />
												</div>
											</div>
										</div>
										<div>
											<label className="sf-label">{t.integrations.shopifyAdminToken}</label>
											<input className="sf-input" style={{ marginTop: 4 }} type="password" value={shopifyAdminToken} onChange={(e) => setShopifyAdminToken(e.target.value)} placeholder="shpat_xxxxxxxxxxxxxxxx" dir="ltr" />
										</div>
									</div>
									<div className="sf-settings-section-footer">
										<button className="sf-btn sf-btn-ghost" onClick={handleSaveShopify} disabled={savingShopify || !shopifyStoreUrl || !shopifyAdminToken}>
											{savingShopify ? t.integrations.saving : t.integrations.saveCredentials}
										</button>
										<button className="sf-btn sf-btn-primary" onClick={handleSync} disabled={syncing || !shopifyStoreUrl || !shopifyAdminToken}>
											<RefreshCw size={13} className={syncing ? "sf-animate-spin" : ""} style={{ marginInlineEnd: 5 }} />
											{syncing ? t.integrations.syncing : t.integrations.startSync}
										</button>
									</div>
									{syncResult !== null && (
										<div className="sf-integr-sync-result">
											<Check size={14} style={{ color: "var(--color-accent-400)" }} />
											<span>{t.integrations.syncSuccess.replace("{n}", String(syncResult))}</span>
										</div>
									)}
								</div>

								<div className="sf-settings-divider" />

								{/* WooCommerce */}
								<div className="sf-settings-field-group">
									<div className="sf-integr-provider-header">
										<div className="sf-integr-provider-logo">🛒</div>
										<div className="sf-integr-provider-info">
											<p className="sf-font-semibold sf-text-sm">WooCommerce</p>
											<p className="sf-text-xs sf-text-tertiary">Import orders from your WP store</p>
										</div>
										{wooStoreUrl && <span className="sf-badge sf-badge-success" style={{ fontSize: 10, marginInlineStart: "auto" }}>Connected</span>}
									</div>
									<div className="sf-integr-fields-grid">
										<div>
											<label className="sf-label">{t.integrations.wooStoreUrl}</label>
											<div className="sf-integr-input-row" style={{ marginTop: 4 }}>
												<div className="sf-integr-monospace-wrap" style={{ flex: 1 }}>
													<ShoppingCart size={13} className="sf-integr-mono-icon" />
													<input className="sf-input sf-integr-mono-input" value={wooStoreUrl} onChange={(e) => setWooStoreUrl(e.target.value)} placeholder="https://my-store.com" dir="ltr" />
												</div>
											</div>
										</div>
										<div>
											<label className="sf-label">{t.integrations.wooConsumerKey}</label>
											<input className="sf-input" style={{ marginTop: 4 }} type="password" value={wooConsumerKey} onChange={(e) => setWooConsumerKey(e.target.value)} placeholder="ck_xxxxxxxxxxxxxxxx" dir="ltr" />
										</div>
										<div>
											<label className="sf-label">{t.integrations.wooConsumerSecret}</label>
											<input className="sf-input" style={{ marginTop: 4 }} type="password" value={wooConsumerSecret} onChange={(e) => setWooConsumerSecret(e.target.value)} placeholder="cs_xxxxxxxxxxxxxxxx" dir="ltr" />
										</div>
										<div>
											<label className="sf-label">{t.integrations.wooWebhookSecret}</label>
											<input className="sf-input" style={{ marginTop: 4 }} type="password" value={wooWebhookSecret} onChange={(e) => setWooWebhookSecret(e.target.value)} placeholder="optional — for signature verification" dir="ltr" />
										</div>
									</div>
									<div className="sf-settings-section-footer">
										<button className="sf-btn sf-btn-ghost" onClick={handleSaveWooCommerce} disabled={savingWoo || !wooStoreUrl || !wooConsumerKey || !wooConsumerSecret}>
											{savingWoo ? t.integrations.saving : t.integrations.saveCredentials}
										</button>
										<button className="sf-btn sf-btn-primary" onClick={handleWooSync} disabled={wooSyncing || !wooStoreUrl || !wooConsumerKey || !wooConsumerSecret}>
											<RefreshCw size={13} className={wooSyncing ? "sf-animate-spin" : ""} style={{ marginInlineEnd: 5 }} />
											{wooSyncing ? t.integrations.syncing : t.integrations.startSync}
										</button>
									</div>
									{wooSyncResult !== null && (
										<div className="sf-integr-sync-result">
											<Check size={14} style={{ color: "var(--color-accent-400)" }} />
											<span>{t.integrations.syncSuccess.replace("{n}", String(wooSyncResult))}</span>
										</div>
									)}
								</div>

								<div className="sf-settings-divider" />

								{/* YouCan */}
								<div className="sf-settings-field-group">
									<div className="sf-integr-provider-header">
										<div className="sf-integr-provider-logo">🇩🇿</div>
										<div className="sf-integr-provider-info">
											<p className="sf-font-semibold sf-text-sm">YouCan</p>
											<p className="sf-text-xs sf-text-tertiary">Algeria&apos;s leading e-commerce platform</p>
										</div>
										{youcanStoreUrl && <span className="sf-badge sf-badge-success" style={{ fontSize: 10, marginInlineStart: "auto" }}>Connected</span>}
									</div>
									<div className="sf-integr-fields-grid">
										<div>
											<label className="sf-label">{t.integrations.youcanStoreUrl}</label>
											<div className="sf-integr-input-row" style={{ marginTop: 4 }}>
												<div className="sf-integr-monospace-wrap" style={{ flex: 1 }}>
													<Zap size={13} className="sf-integr-mono-icon" />
													<input className="sf-input sf-integr-mono-input" value={youcanStoreUrl} onChange={(e) => setYoucanStoreUrl(e.target.value)} placeholder="https://my-store.youcan.shop" dir="ltr" />
												</div>
											</div>
										</div>
										<div>
											<label className="sf-label">{t.integrations.youcanAccessToken}</label>
											<input className="sf-input" style={{ marginTop: 4 }} type="password" value={youcanAccessToken} onChange={(e) => setYoucanAccessToken(e.target.value)} placeholder="your-access-token" dir="ltr" />
										</div>
										<div>
											<label className="sf-label">{t.integrations.youcanWebhookSecret}</label>
											<input className="sf-input" style={{ marginTop: 4 }} type="password" value={youcanWebhookSecret} onChange={(e) => setYoucanWebhookSecret(e.target.value)} placeholder="optional — for signature verification" dir="ltr" />
										</div>
									</div>
									<div className="sf-settings-section-footer">
										<button className="sf-btn sf-btn-ghost" onClick={handleSaveYouCan} disabled={savingYouCan || !youcanStoreUrl || !youcanAccessToken}>
											{savingYouCan ? t.integrations.saving : t.integrations.saveCredentials}
										</button>
										<button className="sf-btn sf-btn-primary" onClick={handleYouCanSync} disabled={youcanSyncing || !youcanStoreUrl || !youcanAccessToken}>
											<RefreshCw size={13} className={youcanSyncing ? "sf-animate-spin" : ""} style={{ marginInlineEnd: 5 }} />
											{youcanSyncing ? t.integrations.syncing : t.integrations.startSync}
										</button>
									</div>
									{youcanSyncResult !== null && (
										<div className="sf-integr-sync-result">
											<Check size={14} style={{ color: "var(--color-accent-400)" }} />
											<span>{t.integrations.syncSuccess.replace("{n}", String(youcanSyncResult))}</span>
										</div>
									)}
								</div>

								{/* Coming soon platforms */}
								<div className="sf-settings-field-group sf-integr-coming-soon-grid">
									{[
										{ logo: "🟣", name: "Instagram Shop", hint: "Meta integration" },
										{ logo: "🔵", name: "Facebook Shop", hint: "Meta Catalog sync" },
										{ logo: "🟡", name: "Amazon Seller", hint: "Fulfillment by Amazon" },
									].map((p) => (
										<div key={p.name} className="sf-integr-coming-soon-card">
											<span style={{ fontSize: 22 }}>{p.logo}</span>
											<div>
												<p className="sf-font-semibold sf-text-sm" style={{ opacity: 0.6 }}>{p.name}</p>
												<p className="sf-text-xs sf-text-tertiary">{p.hint}</p>
											</div>
											<span className="sf-integr-coming-soon-badge">
												<ArrowRight size={10} style={{ marginInlineEnd: 3 }} />
												Coming soon
											</span>
										</div>
									))}
								</div>
							</div>
						</div>
					)}

				</div>
			</div>
		</PageTransition>
	);
}
