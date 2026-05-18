"use client";

import { useMemo } from "react";
import { useI18n } from "@/lib/i18n";
import { Check, AlertCircle, GripVertical } from "lucide-react";
import type { ColumnMapping, RawRow } from "@/lib/import/engine";

interface ColumnMapperProps {
	headers: string[];
	sampleRows: RawRow[];
	mapping: ColumnMapping;
	onChange: (mapping: ColumnMapping) => void;
}

const FIELDS: { key: string; label: string; required: boolean; ar: string }[] =
	[
		{ key: "name", label: "Product Name", required: true, ar: "اسم المنتج *" },
		{ key: "price", label: "Price", required: true, ar: "السعر *" },
		{
			key: "cost_price",
			label: "Cost Price",
			required: false,
			ar: "سعر التكلفة",
		},
		{ key: "stock", label: "Stock", required: false, ar: "المخزون" },
		{ key: "sku", label: "SKU", required: false, ar: "الرمز" },
		{ key: "description", label: "Description", required: false, ar: "الوصف" },
		{ key: "category", label: "Category", required: false, ar: "الفئة" },
	];

export default function ColumnMapper({
	headers,
	sampleRows,
	mapping,
	onChange,
}: ColumnMapperProps) {
	const { locale } = useI18n();
	const isRTL = locale === "ar";

	const mappedCount = useMemo(() => Object.keys(mapping).length, [mapping]);
	const requiredMapped = useMemo(
		() =>
			FIELDS.filter((f) => f.required && mapping[f.key] !== undefined).length,
		[mapping],
	);

	function handleAssign(fieldKey: string, colIndex: number | null) {
		const next = { ...mapping };

		delete next[fieldKey];
		if (colIndex !== null) {
			for (const [k, v] of Object.entries(next)) {
				if (v === colIndex) {
					delete next[k];
				}
			}
			next[fieldKey] = colIndex;
		}
		onChange(next);
	}

	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 12,
					padding: "10px 14px",
					background: "var(--color-surface-tertiary)",
					borderRadius: 8,
					fontSize: 13,
				}}
			>
				<span style={{ fontWeight: 600 }}>
					{mappedCount}/{FIELDS.length}{" "}
					{isRTL ? "أعمدة مربوطة" : "columns mapped"}
				</span>
				<span
					style={{
						color: requiredMapped >= 2 ? "#10b981" : "#f59e0b",
						fontWeight: 500,
					}}
				>
					{requiredMapped >= 2 ? (
						<span style={{ display: "flex", alignItems: "center", gap: 4 }}>
							<Check size={14} />{" "}
							{isRTL ? "الحقول المطلوبة مربوطة" : "Required fields mapped"}
						</span>
					) : (
						<span style={{ display: "flex", alignItems: "center", gap: 4 }}>
							<AlertCircle size={14} />{" "}
							{isRTL
								? "ربط اسم المنتج والسعر مطلوب"
								: "Product name & price required"}
						</span>
					)}
				</span>
			</div>

			{/* Header sample */}
			<div
				style={{
					overflow: "auto",
					border: "1px solid var(--color-line-primary)",
					borderRadius: 8,
					maxHeight: 180,
				}}
			>
				<table
					style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}
				>
					<thead>
						<tr style={{ background: "var(--color-surface-secondary)" }}>
							{headers.map((h, i) => (
								<th
									key={i}
									style={{
										padding: "8px 10px",
										borderBottom: "1px solid var(--color-line-primary)",
										whiteSpace: "nowrap",
										fontWeight: 600,
										minWidth: 100,
									}}
								>
									<div
										style={{ display: "flex", alignItems: "center", gap: 4 }}
									>
										<span>#{i + 1}</span>
										<span style={{ color: "var(--color-content-secondary)" }}>
											{h || "—"}
										</span>
										{Object.entries(mapping).some(([, v]) => v === i) && (
											<span
												style={{
													background: "#10b981",
													color: "#fff",
													fontSize: 10,
													padding: "1px 5px",
													borderRadius: 4,
													fontWeight: 600,
												}}
											>
												{FIELDS.find((f) => mapping[f.key] === i)?.ar}
											</span>
										)}
									</div>
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{sampleRows.slice(0, 3).map((row, ri) => (
							<tr key={ri}>
								{row.map(
									(cell: string | number | null | undefined, ci: number) => (
										<td
											key={ci}
											style={{
												padding: "6px 10px",
												borderBottom: "1px solid var(--color-line-secondary)",
												color: "var(--color-content-tertiary)",
												whiteSpace: "nowrap",
											}}
										>
											{String(cell).slice(0, 30) || "—"}
										</td>
									),
								)}
							</tr>
						))}
					</tbody>
				</table>
			</div>

			{/* Field selectors */}
			<div style={{ display: "grid", gap: 10 }}>
				{FIELDS.map((field) => {
					const assigned = mapping[field.key];
					return (
						<div
							key={field.key}
							style={{
								display: "flex",
								alignItems: "center",
								gap: 10,
								padding: "8px 10px",
								borderRadius: 6,
								background:
									assigned !== undefined
										? "rgba(16,185,129,0.06)"
										: "transparent",
								border: "1px solid var(--color-line-secondary)",
							}}
						>
							<GripVertical
								size={14}
								style={{
									color: "var(--color-content-tertiary)",
									flexShrink: 0,
								}}
							/>
							<div style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>
								{isRTL ? field.ar : field.label}
								{field.required && (
									<span style={{ color: "#ef4444", marginInlineStart: 4 }}>
										*
									</span>
								)}
							</div>
							<select
								value={assigned !== undefined ? assigned : ""}
								onChange={(e) =>
									handleAssign(
										field.key,
										e.target.value === "" ? null : Number(e.target.value),
									)
								}
								style={{
									padding: "5px 10px",
									borderRadius: 6,
									border: "1px solid var(--color-line-primary)",
									fontSize: 13,
									minWidth: 140,
									background: "var(--color-surface-primary)",
								}}
							>
								<option value="">
									{isRTL ? "— اختر عمود —" : "— Select column —"}
								</option>
								{headers.map((h, i) => (
									<option key={i} value={i}>
										#{i + 1} {h}
									</option>
								))}
							</select>
							{assigned !== undefined && (
								<Check size={16} style={{ color: "#10b981", flexShrink: 0 }} />
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
}
