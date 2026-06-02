"use client";

import { useState, useEffect, useCallback } from "react";
import {
	Shield,
	AlertTriangle,
	Ban,
	ShieldCheck,
	ShieldAlert,
	ChevronDown,
	ChevronUp,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/components/dashboard/ToastProvider";
import { calculateAllCustomerRisks, type RiskResult } from "@/lib/data/risk";
import { updateCustomer } from "@/lib/data/service";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageLoader } from "@/components/dashboard/PageLoader";
import { StatCard } from "@/components/dashboard/StatCard";
import { PageTransition } from "@/components/ui/motion";

interface CustomerRisk {
	id: string;
	name: string;
	phone: string;
	wilaya: string;
	order_count: number;
	total_spent: number;
	is_blocked: boolean;
	risk: RiskResult;
}

export default function RiskPage() {
	const { t, formatCurrency } = useI18n();
	const { toast } = useToast();
	const [customers, setCustomers] = useState<CustomerRisk[]>([]);
	const [loading, setLoading] = useState(true);
	const [expandedId, setExpandedId] = useState<string | null>(null);
	const [filter, setFilter] = useState<"all" | "high" | "medium" | "low">(
		"all",
	);
	const [blocking, setBlocking] = useState<string | null>(null);

	const loadData = useCallback(async () => {
		try {
			setLoading(true);
			const data = await calculateAllCustomerRisks();
			data.sort((a, b) => b.risk.score - a.risk.score);
			setCustomers(data);
		} catch {
			toast({ type: "error", title: t.risk?.loadFailed || t.common.error });
		} finally {
			setLoading(false);
		}
	}, [toast, t.risk?.loadFailed, t.common.error]);

	useEffect(() => {
		loadData();
	}, [loadData]);

	async function toggleBlock(customer: CustomerRisk) {
		setBlocking(customer.id);
		try {
			await updateCustomer(customer.id, { is_blocked: !customer.is_blocked });
			setCustomers((prev) =>
				prev.map((c) =>
					c.id === customer.id ? { ...c, is_blocked: !c.is_blocked } : c,
				),
			);
		} catch {
			toast({
				type: "error",
				title: t.risk?.toggleBlockFailed || t.common.error,
			});
		} finally {
			setBlocking(null);
		}
	}

	if (loading) {
		return <PageLoader />;
	}

	if (customers.length === 0) {
		return (
			<div className="sf-flex-col sf-gap-lg sf-slide-up">
				<div>
					<h1 className="sf-page-title">{t.risk.title}</h1>
					<p className="sf-page-subtitle">{t.risk.subtitle}</p>
				</div>
				<EmptyState
					icon={Shield}
					title={t.risk.noCustomersYet}
					description={t.risk.noCustomersDesc}
				/>
			</div>
		);
	}

	const filtered =
		filter === "all"
			? customers
			: customers.filter((c) => c.risk.level === filter);
	const highCount = customers.filter((c) => c.risk.level === "high").length;
	const medCount = customers.filter((c) => c.risk.level === "medium").length;
	const lowCount = customers.filter((c) => c.risk.level === "low").length;
	const blockedCount = customers.filter((c) => c.is_blocked).length;

	const riskColor = (level: string) =>
		level === "high"
			? "var(--sf-color-danger)"
			: level === "medium"
				? "var(--sf-color-warning)"
				: "var(--sf-color-success)";

	const riskBg = (level: string) =>
		level === "high"
			? "var(--sf-color-danger-bg)"
			: level === "medium"
				? "var(--sf-color-warning-bg)"
				: "var(--sf-color-success-bg)";

	return (
		<PageTransition className="sf-flex-col sf-gap-xl">
			<div>
				<h1 className="sf-page-title">{t.risk.title}</h1>
				<p className="sf-page-subtitle">{t.risk.subtitle}</p>
			</div>

			{/* Stats */}
			<div className="sf-stats-grid">
				<StatCard
					label={t.risk.highRisk}
					value={String(highCount)}
					variant="danger"
					icon={ShieldAlert}
				/>
				<StatCard
					label={t.risk.mediumRisk}
					value={String(medCount)}
					variant="warning"
					icon={AlertTriangle}
				/>
				<StatCard
					label={t.risk.lowRisk}
					value={String(lowCount)}
					variant="success"
					icon={ShieldCheck}
				/>
				<StatCard
					label={t.risk.blocked}
					value={String(blockedCount)}
					variant="brand"
					icon={Ban}
				/>
			</div>

			{/* Filter Tabs */}
			<div className="sf-risk-filter-row">
				{(["all", "high", "medium", "low"] as const).map((f) => (
					<button
						key={f}
						onClick={() => setFilter(f)}
						className={
							filter === f
								? "sf-risk-filter-btn sf-risk-filter-btn-active"
								: "sf-risk-filter-btn"
						}
					>
						{f === "all"
							? `${t.common.all} (${customers.length})`
							: `${f} (${customers.filter((c) => c.risk.level === f).length})`}
					</button>
				))}
			</div>

			{/* Customer Risk List */}
			<div className="sf-flex-col sf-gap-sm">
				{filtered.map((c) => (
					<div key={c.id} className="sf-card sf-risk-card-p-0">
						{/* Main Row */}
						<div
							onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
							className="sf-risk-row"
						>
							{/* Risk Score Circle SVG radial ring */}
							<div
								className="sf-relative sf-flex sf-items-center sf-justify-center sf-flex-shrink-0"
								style={{ width: 44, height: 44, marginRight: "16px" }}
							>
								<svg style={{ width: "100%", height: "100%", transform: "rotate(-90deg)" }}>
									{/* Background ring */}
									<circle
										cx="22"
										cy="22"
										r="18"
										fill="transparent"
										stroke="var(--sf-border-strong)"
										strokeWidth="3"
									/>
									{/* Foreground animated ring */}
									<circle
										cx="22"
										cy="22"
										r="18"
										fill="transparent"
										stroke={riskColor(c.risk.level)}
										strokeWidth="3"
										strokeDasharray={2 * Math.PI * 18}
										strokeDashoffset={2 * Math.PI * 18 * (1 - c.risk.score / 100)}
										strokeLinecap="round"
										style={{ transition: "stroke-dashoffset 0.6s ease" }}
									/>
								</svg>
								{/* Centered score text */}
								<span
									className="sf-absolute sf-text-xs sf-font-bold sf-text-tabular"
									style={{ color: riskColor(c.risk.level), position: "absolute" }}
								>
									{c.risk.score}
								</span>
							</div>

							{/* Info */}
							<div className="sf-risk-info">
								<div className="sf-risk-name-row">
									<p className="sf-risk-name">{c.name}</p>
									{c.is_blocked && (
										<span className="sf-risk-badge-blocked">
											{t.risk.blocked.toUpperCase()}
										</span>
									)}
								</div>
								<p className="sf-risk-meta">
									{c.phone} • {c.wilaya || "—"} • {c.order_count} orders •{" "}
									{formatCurrency(c.total_spent)}
								</p>
							</div>

							{/* Risk Level Badge */}
							<span
								className="sf-risk-badge-level"
								style={{
									background: riskBg(c.risk.level),
									color: riskColor(c.risk.level),
								}}
							>
								{c.risk.level}
							</span>

							{expandedId === c.id ? (
								<ChevronUp size={16} color="var(--color-content-tertiary)" />
							) : (
								<ChevronDown size={16} color="var(--color-content-tertiary)" />
							)}
						</div>

						{/* Expanded Details */}
						{expandedId === c.id && (
							<div className="sf-risk-expanded sf-animate-fade" style={{ animationDuration: "0.2s" }}>
								<p className="sf-risk-factors-title">{t.risk.riskFactors}</p>
								<div className="sf-risk-factor-list">
									{c.risk.factors.map((f, i) => (
										<div key={i} className="sf-risk-factor-row">
											<span
												className="sf-risk-factor-dot"
												style={{ background: riskColor(c.risk.level) }}
											/>
											<span className="sf-risk-factor-text">{f}</span>
										</div>
									))}
								</div>

								<button
									onClick={(e) => {
										e.stopPropagation();
										toggleBlock(c);
									}}
									disabled={blocking === c.id}
									className={`sf-btn ${c.is_blocked ? "sf-btn-ghost" : "sf-btn-danger"} sf-risk-action-btn`}
								>
									<Ban size={14} className="sf-mr-sm" />
									{blocking === c.id
										? t.risk.updating
										: c.is_blocked
											? t.risk.unblockCustomer
											: t.risk.blockCustomer}
								</button>
							</div>
						)}
					</div>
				))}
			</div>

			{filtered.length === 0 && (
				<div className="sf-card sf-flex-center sf-risk-empty">
					<p>{t.risk.noMatchingRisk}</p>
				</div>
			)}
		</PageTransition>
	);
}
