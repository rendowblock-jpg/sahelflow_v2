"use client";

import { useState, useEffect } from "react";
import { Copy, Check, RefreshCw, Truck, Package } from "lucide-react";
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

export default function IntegrationsPage() {
	const { t } = useI18n();
	const { toast } = useToast();

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
			await saveIntegration("yalidine", {
				api_id: yalidineApiId,
				api_token: yalidineApiToken,
			});
			toast({ type: "success", title: t.integrations.saved });
		} catch {
			toast({ type: "error", title: t.integrations.saveFailed });
		} finally {
			setSavingDelivery(false);
		}
	}

	async function handleSaveZr() {
		setSavingZr(true);
		try {
			await saveIntegration("zrexpress", {
				api_id: zrApiId,
				api_key: zrApiKey,
			});
			toast({ type: "success", title: t.integrations.saved });
		} catch {
			toast({ type: "error", title: t.integrations.saveFailed });
		} finally {
			setSavingZr(false);
		}
	}

	async function handleSaveMaystro() {
		setSavingMaystro(true);
		try {
			await saveIntegration("maystro", {
				api_token: maystroApiToken,
			});
			toast({ type: "success", title: t.integrations.saved });
		} catch {
			toast({ type: "error", title: t.integrations.saveFailed });
		} finally {
			setSavingMaystro(false);
		}
	}

	async function handleSaveShopify() {
		setSavingShopify(true);
		try {
			await saveIntegration("shopify", {
				shop_url: shopifyStoreUrl,
				access_token: shopifyAdminToken,
			});
			toast({ type: "success", title: t.integrations.saved });
		} catch {
			toast({ type: "error", title: t.integrations.saveFailed });
		} finally {
			setSavingShopify(false);
		}
	}

	async function handleSync() {
		setSyncing(true);
		setSyncResult(null);
		try {
			const res = await fetch("/api/integrations/sync", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ platform: "shopify" }),
			});
			const data = await res.json();
			if (res.ok && data.success) {
				setSyncResult(data.count);
				toast({
					type: "success",
					title: t.integrations.syncSuccess.replace("{n}", String(data.count)),
				});
			} else {
				toast({ type: "error", title: data.error || t.common.error });
			}
		} catch {
			toast({ type: "error", title: "Sync failed" });
		} finally {
			setSyncing(false);
		}
	}

	async function handleSaveYouCan() {
		setSavingYouCan(true);
		try {
			await saveIntegration("youcan", {
				store_url: youcanStoreUrl,
				access_token: youcanAccessToken,
				webhook_secret: youcanWebhookSecret,
			});
			toast({ type: "success", title: t.integrations.saved });
		} catch {
			toast({ type: "error", title: t.integrations.saveFailed });
		} finally {
			setSavingYouCan(false);
		}
	}

	async function handleYouCanSync() {
		setYoucanSyncing(true);
		setYoucanSyncResult(null);
		try {
			const res = await fetch("/api/integrations/sync", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ platform: "youcan" }),
			});
			const data = await res.json();
			if (res.ok && data.success) {
				setYoucanSyncResult(data.count);
				toast({
					type: "success",
					title: t.integrations.syncSuccess.replace("{n}", String(data.count)),
				});
			} else {
				toast({ type: "error", title: data.error || "Sync failed" });
			}
		} catch {
			toast({ type: "error", title: "Sync failed" });
		} finally {
			setYoucanSyncing(false);
		}
	}

	async function handleSaveWooCommerce() {
		setSavingWoo(true);
		try {
			await saveIntegration("woocommerce", {
				store_url: wooStoreUrl,
				consumer_key: wooConsumerKey,
				consumer_secret: wooConsumerSecret,
				webhook_secret: wooWebhookSecret,
			});
			toast({ type: "success", title: t.integrations.saved });
		} catch {
			toast({ type: "error", title: t.integrations.saveFailed });
		} finally {
			setSavingWoo(false);
		}
	}

	async function handleWooSync() {
		setWooSyncing(true);
		setWooSyncResult(null);
		try {
			const res = await fetch("/api/integrations/sync", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ platform: "woocommerce" }),
			});
			const data = await res.json();
			if (res.ok && data.success) {
				setWooSyncResult(data.count);
				toast({
					type: "success",
					title: t.integrations.syncSuccess.replace("{n}", String(data.count)),
				});
			} else {
				toast({ type: "error", title: data.error || "Sync failed" });
			}
		} catch {
			toast({ type: "error", title: "Sync failed" });
		} finally {
			setWooSyncing(false);
		}
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
		setTesting(true);
		setTestResult(null);
		try {
			const res = await fetch(`/api/webhooks/store/${webhookToken}`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-SahelFlow-Token": webhookToken,
					"X-SahelFlow-Test": "true",
				},
				body: JSON.stringify({ test: true }),
			});
			setTestResult(res.ok ? "ok" : "fail");
		} catch {
			setTestResult("fail");
		} finally {
			setTesting(false);
			setTimeout(() => setTestResult(null), 4000);
		}
	}

	const selectedInfo = STORES.find((s) => s.id === selectedStore)!;

	return (
		<PageTransition className="sf-flex-col sf-gap-xl">
			{/* Header */}
			<div>
				<h1 className="sf-page-title">{t.integrations.title}</h1>
				<p className="sf-page-subtitle">{t.integrations.subtitle}</p>
			</div>

			{/* No RC needed banner */}
			<div className="sf-card sf-card-brand">
				<div className="sf-flex sf-gap-md sf-items-start">
					<span className="sf-text-2xl">✅</span>
					<div>
						<p className="sf-font-semibold sf-text-sm">
							No RC or Meta approval needed
						</p>
						<p className="sf-text-sm-secondary sf-mt-xs">
							{t.integrations.noApiRequired}
						</p>
					</div>
				</div>
			</div>

			{/* Stats */}
			{ordersReceived > 0 && (
				<div className="sf-flex sf-gap-lg">
					<div className="sf-card sf-flex-1">
						<p className="sf-text-xs-secondary">
							{t.integrations.ordersReceived}
						</p>
						<p className="sf-stat-value-lg">{ordersReceived}</p>
					</div>
					{lastSync && (
						<div className="sf-card sf-flex-1">
							<p className="sf-text-xs-secondary">{t.integrations.lastSync}</p>
							<p className="sf-font-semibold sf-text-sm sf-mt-xs">
								{new Date(lastSync).toLocaleString()}
							</p>
						</div>
					)}
				</div>
			)}

			<div className="sf-grid-auto">
				{/* Webhook credentials */}
				<div className="sf-card sf-flex-col sf-gap-lg">
					<h3 className="sf-section-title">Your Webhook Credentials</h3>

					<div>
						<label className="sf-label">{t.integrations.webhookUrl}</label>
						<div className="sf-flex sf-gap-sm sf-mt-xs">
							<input
								className="sf-input sf-input-mono sf-flex-1"
								value={webhookUrl}
								readOnly
								dir="ltr"
							/>
							<button
								className="sf-btn sf-btn-ghost sf-flex-shrink-0"
								onClick={() => handleCopy("url")}
							>
								{copied === "url" ? <Check size={16} /> : <Copy size={16} />}
							</button>
						</div>
					</div>

					<div>
						<label className="sf-label">{t.integrations.webhookSecret}</label>
						<div className="sf-flex sf-gap-sm sf-mt-xs">
							<input
								className="sf-input sf-input-mono-sm sf-flex-1"
								value={webhookToken}
								readOnly
								dir="ltr"
							/>
							<button
								className="sf-btn sf-btn-ghost sf-flex-shrink-0"
								onClick={() => handleCopy("secret")}
							>
								{copied === "secret" ? <Check size={16} /> : <Copy size={16} />}
							</button>
						</div>
					</div>

					<button
						className={`sf-btn ${testResult === "ok" ? "sf-btn-primary" : testResult === "fail" ? "sf-btn-destructive" : "sf-btn-ghost"}`}
						onClick={handleTest}
						disabled={testing}
					>
						<RefreshCw size={16} className={testing ? "sf-animate-spin" : ""} />
						{testing
							? t.integrations.testing
							: testResult === "ok"
								? "✓ Connected!"
								: testResult === "fail"
									? "✗ Failed"
									: t.integrations.testWebhook}
					</button>
				</div>

				{/* Instructions */}
				<div className="sf-card sf-flex-col sf-gap-md">
					<h3 className="sf-section-title">{t.integrations.howTo}</h3>

					<div className="sf-flex sf-gap-sm sf-flex-wrap">
						{STORES.map((s) => (
							<button
								key={s.id}
								onClick={() => setSelectedStore(s.id)}
								className={`sf-btn ${selectedStore === s.id ? "sf-btn-primary" : "sf-btn-ghost"} sf-btn-pill`}
							>
								{s.logo} {s.name}
							</button>
						))}
					</div>

					<ol className="sf-steps-list">
						{selectedInfo.steps.map((step, i) => (
							<li key={i} className="sf-step-text">
								{step}
							</li>
						))}
					</ol>
				</div>
			</div>

			{/* Delivery Connections */}
			<div className="sf-card sf-flex-col sf-gap-lg sf-integration-section">
				<div className="sf-flex-center-gap-md">
					<Truck size={20} />
					<h3 className="sf-section-title">
						{t.integrations.deliveryConnections}
					</h3>
				</div>

				<div className="sf-grid-auto-sm">
					<div className="sf-integration-card">
						<div className="sf-flex-center-gap-sm">
							<span className="sf-text-xl">📦</span>
							<span className="sf-font-semibold sf-text-sm">Yalidine</span>
						</div>

						<div>
							<label className="sf-label">{t.integrations.yalidineApiId}</label>
							<input
								className="sf-input sf-mt-xs"
								value={yalidineApiId}
								onChange={(e) => setYalidineApiId(e.target.value)}
								placeholder="your-api-id"
								dir="ltr"
							/>
						</div>

						<div>
							<label className="sf-label">
								{t.integrations.yalidineApiToken}
							</label>
							<input
								className="sf-input sf-mt-xs"
								type="password"
								value={yalidineApiToken}
								onChange={(e) => setYalidineApiToken(e.target.value)}
								placeholder="your-api-token"
								dir="ltr"
							/>
						</div>

						<button
							className="sf-btn sf-btn-primary sf-self-start"
							onClick={handleSaveYalidine}
							disabled={savingDelivery || !yalidineApiId || !yalidineApiToken}
						>
							{savingDelivery ? t.integrations.saving : t.integrations.save}
						</button>
					</div>

					<div className="sf-integration-card">
						<div className="sf-flex-center-gap-sm">
							<span className="sf-text-xl">✈️</span>
							<span className="sf-font-semibold sf-text-sm">ZR Express</span>
						</div>
						<p className="sf-text-xs-tertiary">
							{t.integrations.zrExpressDesc}
						</p>

						<div>
							<label className="sf-label">API ID</label>
							<input
								className="sf-input sf-mt-xs"
								value={zrApiId}
								onChange={(e) => setZrApiId(e.target.value)}
								placeholder="your-api-id"
								dir="ltr"
							/>
						</div>

						<div>
							<label className="sf-label">API Key</label>
							<input
								className="sf-input sf-mt-xs"
								type="password"
								value={zrApiKey}
								onChange={(e) => setZrApiKey(e.target.value)}
								placeholder="your-api-key"
								dir="ltr"
							/>
						</div>

						<button
							className="sf-btn sf-btn-primary sf-self-start"
							onClick={handleSaveZr}
							disabled={savingZr || !zrApiId || !zrApiKey}
						>
							{savingZr ? t.integrations.saving : t.integrations.save}
						</button>
					</div>

					<div className="sf-integration-card">
						<div className="sf-flex-center-gap-sm">
							<span className="sf-text-xl">🚚</span>
							<span className="sf-font-semibold sf-text-sm">
								Maystro Delivery
							</span>
						</div>
						<p className="sf-text-xs-tertiary">{t.integrations.maystroDesc}</p>

						<div>
							<label className="sf-label">API Token</label>
							<input
								className="sf-input sf-mt-xs"
								type="password"
								value={maystroApiToken}
								onChange={(e) => setMaystroApiToken(e.target.value)}
								placeholder="your-api-token"
								dir="ltr"
							/>
						</div>

						<button
							className="sf-btn sf-btn-primary sf-self-start"
							onClick={handleSaveMaystro}
							disabled={savingMaystro || !maystroApiToken}
						>
							{savingMaystro ? t.integrations.saving : t.integrations.save}
						</button>
					</div>
				</div>
			</div>

			{/* Catalog Sync */}
			<div className="sf-card sf-flex-col sf-gap-lg sf-integration-section">
				<div className="sf-flex-center-gap-md">
					<Package size={20} />
					<h3 className="sf-section-title">{t.integrations.catalogSync}</h3>
				</div>

				<div className="sf-grid-auto-sm">
					<div className="sf-integration-card">
						<div className="sf-flex-center-gap-sm">
							<span className="sf-text-xl">🛍️</span>
							<span className="sf-font-semibold sf-text-sm">Shopify</span>
						</div>

						<div>
							<label className="sf-label">
								{t.integrations.shopifyStoreUrl}
							</label>
							<input
								className="sf-input sf-mt-xs"
								value={shopifyStoreUrl}
								onChange={(e) => setShopifyStoreUrl(e.target.value)}
								placeholder="mystore.myshopify.com"
								dir="ltr"
							/>
						</div>

						<div>
							<label className="sf-label">
								{t.integrations.shopifyAdminToken}
							</label>
							<input
								className="sf-input sf-mt-xs"
								type="password"
								value={shopifyAdminToken}
								onChange={(e) => setShopifyAdminToken(e.target.value)}
								placeholder="shpat_xxxxxxxxxxxxxxxx"
								dir="ltr"
							/>
						</div>

						<div className="sf-flex sf-gap-sm sf-flex-wrap">
							<button
								className="sf-btn sf-btn-ghost"
								onClick={handleSaveShopify}
								disabled={
									savingShopify || !shopifyStoreUrl || !shopifyAdminToken
								}
							>
								{savingShopify
									? t.integrations.saving
									: t.integrations.saveCredentials}
							</button>
							<button
								className="sf-btn sf-btn-primary"
								onClick={handleSync}
								disabled={syncing || !shopifyStoreUrl || !shopifyAdminToken}
							>
								{syncing ? t.integrations.syncing : t.integrations.startSync}
							</button>
						</div>

						{syncResult !== null && (
							<p className="sf-text-sm-secondary sf-mt-xs">
								{t.integrations.syncSuccess.replace("{n}", String(syncResult))}
							</p>
						)}
					</div>

					<div className="sf-integration-card">
						<div className="sf-flex-center-gap-sm">
							<span className="sf-text-xl">🛒</span>
							<span className="sf-font-semibold sf-text-sm">WooCommerce</span>
						</div>

						<div>
							<label className="sf-label">
								{t.integrations.wooStoreUrl}
							</label>
							<input
								className="sf-input sf-mt-xs"
								value={wooStoreUrl}
								onChange={(e) => setWooStoreUrl(e.target.value)}
								placeholder="https://my-store.com"
								dir="ltr"
							/>
						</div>

						<div>
							<label className="sf-label">
								{t.integrations.wooConsumerKey}
							</label>
							<input
								className="sf-input sf-mt-xs"
								type="password"
								value={wooConsumerKey}
								onChange={(e) => setWooConsumerKey(e.target.value)}
								placeholder="ck_xxxxxxxxxxxxxxxx"
								dir="ltr"
							/>
						</div>

						<div>
							<label className="sf-label">
								{t.integrations.wooConsumerSecret}
							</label>
							<input
								className="sf-input sf-mt-xs"
								type="password"
								value={wooConsumerSecret}
								onChange={(e) => setWooConsumerSecret(e.target.value)}
								placeholder="cs_xxxxxxxxxxxxxxxx"
								dir="ltr"
							/>
						</div>

						<div>
							<label className="sf-label">
								{t.integrations.wooWebhookSecret}
							</label>
							<input
								className="sf-input sf-mt-xs"
								type="password"
								value={wooWebhookSecret}
								onChange={(e) => setWooWebhookSecret(e.target.value)}
								placeholder="optional — for signature verification"
								dir="ltr"
							/>
						</div>

						<div className="sf-flex sf-gap-sm sf-flex-wrap">
							<button
								className="sf-btn sf-btn-ghost"
								onClick={handleSaveWooCommerce}
								disabled={
									savingWoo || !wooStoreUrl || !wooConsumerKey || !wooConsumerSecret
								}
							>
								{savingWoo
									? t.integrations.saving
									: t.integrations.saveCredentials}
							</button>
							<button
								className="sf-btn sf-btn-primary"
								onClick={handleWooSync}
								disabled={
									wooSyncing || !wooStoreUrl || !wooConsumerKey || !wooConsumerSecret
								}
							>
								{wooSyncing
									? t.integrations.syncing
									: t.integrations.startSync}
							</button>
						</div>

						{wooSyncResult !== null && (
							<p className="sf-text-sm-secondary sf-mt-xs">
								{t.integrations.syncSuccess.replace("{n}", String(wooSyncResult))}
							</p>
						)}
					</div>

					<div className="sf-integration-card">
						<div className="sf-flex-center-gap-sm">
							<span className="sf-text-xl">🇩🇿</span>							<span className="sf-font-semibold sf-text-sm">YouCan</span>
						</div>

						<div>
							<label className="sf-label">
								{t.integrations.youcanStoreUrl}
							</label>
							<input
								className="sf-input sf-mt-xs"
								value={youcanStoreUrl}
								onChange={(e) => setYoucanStoreUrl(e.target.value)}
								placeholder="https://my-store.youcan.shop"
								dir="ltr"
							/>
						</div>

						<div>
							<label className="sf-label">
								{t.integrations.youcanAccessToken}
							</label>
							<input
								className="sf-input sf-mt-xs"
								type="password"
								value={youcanAccessToken}
								onChange={(e) => setYoucanAccessToken(e.target.value)}
								placeholder="your-access-token"
								dir="ltr"
							/>
						</div>

						<div>
							<label className="sf-label">
								{t.integrations.youcanWebhookSecret}
							</label>
							<input
								className="sf-input sf-mt-xs"
								type="password"
								value={youcanWebhookSecret}
								onChange={(e) => setYoucanWebhookSecret(e.target.value)}
								placeholder="optional — for signature verification"
								dir="ltr"
							/>
						</div>

						<div className="sf-flex sf-gap-sm sf-flex-wrap">
							<button
								className="sf-btn sf-btn-ghost"
								onClick={handleSaveYouCan}
								disabled={
									savingYouCan || !youcanStoreUrl || !youcanAccessToken
								}
							>
								{savingYouCan
									? t.integrations.saving
									: t.integrations.saveCredentials}
							</button>
							<button
								className="sf-btn sf-btn-primary"
								onClick={handleYouCanSync}
								disabled={
									youcanSyncing || !youcanStoreUrl || !youcanAccessToken
								}
							>
								{youcanSyncing
									? t.integrations.syncing
									: t.integrations.startSync}
							</button>
						</div>

						{youcanSyncResult !== null && (
							<p className="sf-text-sm-secondary sf-mt-xs">
								{t.integrations.syncSuccess.replace("{n}", String(youcanSyncResult))}
							</p>
						)}
					</div>
				</div>
			</div>
		</PageTransition>
	);
}
