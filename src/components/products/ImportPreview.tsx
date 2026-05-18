"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import {
	CheckCircle,
	AlertTriangle,
	XCircle,
	ChevronDown,
	ChevronUp,
} from "lucide-react";
import type { ValidatedRow } from "@/lib/import/engine";

interface ImportPreviewProps {
	validRows: ValidatedRow[];
	invalidRows: ValidatedRow[];
	duplicateRows: ValidatedRow[];
	onToggleRow?: (index: number, included: boolean) => void;
	excludedIndices?: Set<number>;
}

type Tab = "valid" | "invalid" | "duplicates";

export default function ImportPreview({
	validRows,
	invalidRows,
	duplicateRows,
	onToggleRow,
	excludedIndices = new Set(),
}: ImportPreviewProps) {
	const { locale } = useI18n();
	const isRTL = locale === "ar";
	const [activeTab, setActiveTab] = useState<Tab>("valid");
	const [expandedErrors, setExpandedErrors] = useState<Set<number>>(new Set());

	const tabs: {
		key: Tab;
		label: string;
		ar: string;
		count: number;
		color: string;
	}[] = [
		{
			key: "valid",
			label: "Valid",
			ar: "صالح",
			count: validRows.length,
			color: "#10b981",
		},
		{
			key: "invalid",
			label: "Invalid",
			ar: "غير صالح",
			count: invalidRows.length,
			color: "#ef4444",
		},
		{
			key: "duplicates",
			label: "Duplicates",
			ar: "مكرر",
			count: duplicateRows.length,
			color: "#f59e0b",
		},
	];

	const currentRows =
		activeTab === "valid"
			? validRows
			: activeTab === "invalid"
				? invalidRows
				: duplicateRows;

	function toggleExpanded(index: number) {
		const next = new Set(expandedErrors);
		if (next.has(index)) next.delete(index);
		else next.add(index);
		setExpandedErrors(next);
	}

	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
			{/* Tabs */}
			<div
				style={{
					display: "flex",
					gap: 8,
					borderBottom: "1px solid var(--color-line-primary)",
					paddingBottom: 8,
				}}
			>
				{tabs.map((tab) => (
					<button
						key={tab.key}
						onClick={() => setActiveTab(tab.key)}
						style={{
							padding: "6px 14px",
							borderRadius: 6,
							fontSize: 13,
							fontWeight: 600,
							border: "none",
							cursor: "pointer",
							background:
								activeTab === tab.key ? `${tab.color}15` : "transparent",
							color:
								activeTab === tab.key
									? tab.color
									: "var(--color-content-secondary)",
							display: "flex",
							alignItems: "center",
							gap: 6,
						}}
					>
						{tab.key === "valid" && <CheckCircle size={14} />}
						{tab.key === "invalid" && <XCircle size={14} />}
						{tab.key === "duplicates" && <AlertTriangle size={14} />}
						{isRTL ? tab.ar : tab.label}
						<span
							style={{
								background:
									activeTab === tab.key
										? tab.color
										: "var(--color-surface-tertiary)",
								color:
									activeTab === tab.key
										? "#fff"
										: "var(--color-content-secondary)",
								fontSize: 11,
								padding: "1px 6px",
								borderRadius: 10,
								minWidth: 20,
								textAlign: "center",
							}}
						>
							{tab.count}
						</span>
					</button>
				))}
			</div>

			{/* Row count info */}
			<div style={{ fontSize: 12, color: "var(--color-content-tertiary)" }}>
				{isRTL
					? `سيتم استيراد ${validRows.filter((r) => !excludedIndices.has(r.index)).length} منتج`
					: `${validRows.filter((r) => !excludedIndices.has(r.index)).length} products will be imported`}
			</div>

			{/* Table */}
			<div
				style={{
					maxHeight: 320,
					overflow: "auto",
					border: "1px solid var(--color-line-primary)",
					borderRadius: 8,
				}}
			>
				<table
					style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}
				>
					<thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
						<tr style={{ background: "var(--color-surface-secondary)" }}>
							{activeTab === "valid" && (
								<th style={{ padding: 8, width: 40 }}>#</th>
							)}
							<th style={{ padding: 8, textAlign: isRTL ? "right" : "left" }}>
								{isRTL ? "المنتج" : "Product"}
							</th>
							<th style={{ padding: 8, textAlign: "end" }}>
								{isRTL ? "السعر" : "Price"}
							</th>
							<th style={{ padding: 8, textAlign: "center" }}>
								{isRTL ? "المخزون" : "Stock"}
							</th>
							<th style={{ padding: 8 }}>SKU</th>
							{activeTab !== "valid" && (
								<th style={{ padding: 8 }}>{isRTL ? "التفاصيل" : "Details"}</th>
							)}
						</tr>
					</thead>
					<tbody>
						{currentRows.length === 0 ? (
							<tr>
								<td
									colSpan={activeTab !== "valid" ? 6 : 5}
									style={{
										padding: 24,
										textAlign: "center",
										color: "var(--color-content-tertiary)",
									}}
								>
									{isRTL ? "لا توجد صفوف" : "No rows"}
								</td>
							</tr>
						) : (
							currentRows.slice(0, 50).map((row) => {
								const isExcluded = excludedIndices.has(row.index);
								return (
									<tr
										key={row.index}
										style={{
											opacity: isExcluded ? 0.4 : 1,
											background:
												row.errors.length > 0
													? "rgba(239,68,68,0.03)"
													: "transparent",
										}}
									>
										{activeTab === "valid" && (
											<td style={{ padding: 6, textAlign: "center" }}>
												<input
													type="checkbox"
													checked={!isExcluded}
													onChange={(e) =>
														onToggleRow?.(row.index, e.target.checked)
													}
												/>
											</td>
										)}
										<td style={{ padding: "6px 8px", fontWeight: 500 }}>
											{String(row.data.name || "—").slice(0, 40)}
										</td>
										<td
											style={{
												padding: "6px 8px",
												textAlign: "end",
												fontFeatureSettings: '"tnum" 1',
											}}
										>
											{String(row.data.price ?? "—")}
										</td>
										<td style={{ padding: "6px 8px", textAlign: "center" }}>
											{String(row.data.stock ?? 0)}
										</td>
										<td
											style={{
												padding: "6px 8px",
												fontFamily: "monospace",
												fontSize: 11,
												color: "var(--color-content-tertiary)",
											}}
										>
											{String(row.data.sku || "—").slice(0, 20)}
										</td>
										{activeTab !== "valid" && (
											<td style={{ padding: "6px 8px" }}>
												<button
													onClick={() => toggleExpanded(row.index)}
													style={{
														background: "none",
														border: "none",
														cursor: "pointer",
														fontSize: 11,
														color: "#ef4444",
														display: "flex",
														alignItems: "center",
														gap: 2,
													}}
												>
													{expandedErrors.has(row.index) ? (
														<ChevronUp size={12} />
													) : (
														<ChevronDown size={12} />
													)}
													{row.errors.length} {isRTL ? "خطأ" : "errors"}
													{row.warnings.length > 0 &&
														`, ${row.warnings.length} ${isRTL ? "تحذير" : "warn"}`}
												</button>
												{expandedErrors.has(row.index) && (
													<div
														style={{
															marginTop: 4,
															padding: 6,
															background: "rgba(239,68,68,0.06)",
															borderRadius: 4,
															fontSize: 11,
														}}
													>
														{row.errors.map((e, i) => (
															<div key={i} style={{ color: "#ef4444" }}>
																• {e}
															</div>
														))}
														{row.warnings.map((w, i) => (
															<div key={`w-${i}`} style={{ color: "#f59e0b" }}>
																• {w}
															</div>
														))}
													</div>
												)}
											</td>
										)}
									</tr>
								);
							})
						)}
					</tbody>
				</table>
				{currentRows.length > 50 && (
					<div
						style={{
							padding: 8,
							textAlign: "center",
							fontSize: 12,
							color: "var(--color-content-tertiary)",
							borderTop: "1px solid var(--color-line-secondary)",
						}}
					>
						+{currentRows.length - 50} {isRTL ? "صفوف أخرى" : "more rows"}
					</div>
				)}
			</div>
		</div>
	);
}
