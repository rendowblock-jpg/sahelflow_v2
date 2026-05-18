"use client";

import { useEffect, useState, useCallback } from "react";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/components/dashboard/ToastProvider";
import {
	Import,
	Download,
	CheckCircle,
	XCircle,
	AlertTriangle,
	Loader2,
	Calendar,
	FileText,
} from "lucide-react";
import { PageTransition } from "@/components/ui/motion";

interface ImportBatch {
	id: string;
	source: string;
	filename: string | null;
	row_count: number;
	created_count: number;
	skipped_count: number;
	error_count: number;
	status: string;
	column_mapping: Record<string, number>;
	validation_errors: Array<{ row: number; errors: string[] }>;
	created_at: string;
	committed_at: string | null;
}

export default function ImportsPage() {
	const { t, locale } = useI18n();
	const { toast } = useToast();
	const [batches, setBatches] = useState<ImportBatch[]>([]);
	const [loading, setLoading] = useState(true);
	const [expandedBatch, setExpandedBatch] = useState<string | null>(null);

	const isRTL = locale === "ar";

	const fetchBatches = useCallback(async () => {
		setLoading(true);
		try {
			const res = await fetch("/api/products/import-v2/batches");
			const data = await res.json();
			if (!res.ok) throw new Error(data.error);
			setBatches(data.batches || []);
		} catch (e) {
			toast({ type: "error", title: (e as Error).message });
		} finally {
			setLoading(false);
		}
	}, [toast]);

	useEffect(() => {
		fetchBatches();
	}, [fetchBatches]);

	function statusIcon(status: string) {
		switch (status) {
			case "completed":
				return <CheckCircle size={16} style={{ color: "#10b981" }} />;
			case "failed":
				return <XCircle size={16} style={{ color: "#ef4444" }} />;
			case "preview":
				return <AlertTriangle size={16} style={{ color: "#f59e0b" }} />;
			default:
				return (
					<Loader2
						size={16}
						style={{ color: "#3b82f6", animation: "spin 1s linear infinite" }}
					/>
				);
		}
	}

	function statusLabel(status: string) {
		const labels: Record<string, string> = {
			completed: t.imports.statusCompleted,
			failed: t.imports.statusFailed,
			preview: t.imports.statusPreview,
			pending: t.status.pending,
			processing: t.imports.statusProcessing,
			cancelled: t.status.cancelled,
		};
		return labels[status] || status;
	}

	function downloadErrorReport(batch: ImportBatch) {
		if (!batch.validation_errors?.length) return;
		const csv = [
			["row", "errors"].join(","),
			...batch.validation_errors.map((e) =>
				[e.row, `"${e.errors.join("; ").replace(/"/g, '""')}"`].join(","),
			),
		].join("\n");
		const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `import-errors-${batch.id.slice(0, 8)}.csv`;
		a.click();
		URL.revokeObjectURL(url);
	}

	return (
		<PageTransition>
			<div style={{ padding: "24px 16px" }}>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 10,
					marginBottom: 24,
				}}
			>
				<Import size={24} />
				<h1 style={{ fontSize: 20, fontWeight: 700 }}>
					{isRTL ? "سجل الاستيراد" : "Import History"}
				</h1>
			</div>

			{loading ? (
				<div style={{ textAlign: "center", padding: 40 }}>
					<Loader2 size={24} style={{ animation: "spin 1s linear infinite" }} />
				</div>
			) : batches.length === 0 ? (
				<div
					className="sf-card"
					style={{
						textAlign: "center",
						padding: 40,
						color: "var(--color-content-tertiary)",
					}}
				>
					<FileText size={32} style={{ marginBottom: 12, opacity: 0.5 }} />
					<p>{isRTL ? "لا توجد عمليات استيراد بعد" : "No imports yet"}</p>
					<p style={{ fontSize: 13, marginTop: 8 }}>
						{isRTL
							? "اذهب إلى المنتجات وانقر على استيراد"
							: "Go to Products and click Import to get started"}
					</p>
				</div>
			) : (
				<div style={{ display: "grid", gap: 12 }}>
					{batches.map((batch) => (
						<div
							key={batch.id}
							className="sf-card"
							style={{ padding: 16, cursor: "pointer" }}
							onClick={() =>
								setExpandedBatch(expandedBatch === batch.id ? null : batch.id)
							}
						>
							<div
								style={{
									display: "flex",
									alignItems: "center",
									gap: 12,
									flexWrap: "wrap",
								}}
							>
								{statusIcon(batch.status)}
								<div style={{ flex: 1, minWidth: 200 }}>
									<div style={{ fontWeight: 600, fontSize: 14 }}>
										{batch.filename || `${batch.source.toUpperCase()} Import`}
									</div>
									<div
										style={{
											fontSize: 12,
											color: "var(--color-content-tertiary)",
											display: "flex",
											alignItems: "center",
											gap: 6,
											marginTop: 2,
										}}
									>
										<Calendar size={11} />
										{new Date(batch.created_at).toLocaleDateString(
											isRTL ? "ar-DZ" : "en-US",
										)}
										{batch.committed_at && (
											<>
												{" "}
												• {isRTL ? "تم التأكيد" : "Committed"}{" "}
												{new Date(batch.committed_at).toLocaleDateString(
													isRTL ? "ar-DZ" : "en-US",
												)}
											</>
										)}
									</div>
								</div>
								<div style={{ display: "flex", gap: 16, fontSize: 13 }}>
									<div style={{ textAlign: "center" }}>
										<div style={{ fontWeight: 700 }}>{batch.row_count}</div>
										<div
											style={{
												fontSize: 11,
												color: "var(--color-content-tertiary)",
											}}
										>
											{isRTL ? "الصفوف" : "Rows"}
										</div>
									</div>
									<div style={{ textAlign: "center" }}>
										<div style={{ fontWeight: 700, color: "#10b981" }}>
											{batch.created_count}
										</div>
										<div
											style={{
												fontSize: 11,
												color: "var(--color-content-tertiary)",
											}}
										>
											{isRTL ? "تم الإنشاء" : "Created"}
										</div>
									</div>
									<div style={{ textAlign: "center" }}>
										<div
											style={{
												fontWeight: 700,
												color: batch.error_count > 0 ? "#ef4444" : "inherit",
											}}
										>
											{batch.error_count}
										</div>
										<div
											style={{
												fontSize: 11,
												color: "var(--color-content-tertiary)",
											}}
										>
											{isRTL ? "أخطاء" : "Errors"}
										</div>
									</div>
								</div>
								<div
									style={{
										padding: "3px 10px",
										borderRadius: 12,
										fontSize: 12,
										fontWeight: 500,
										background:
											batch.status === "completed"
												? "rgba(16,185,129,0.1)"
												: batch.status === "failed"
													? "rgba(239,68,68,0.1)"
													: "rgba(59,130,246,0.1)",
										color:
											batch.status === "completed"
												? "#10b981"
												: batch.status === "failed"
													? "#ef4444"
													: "#3b82f6",
									}}
								>
									{statusLabel(batch.status)}
								</div>
							</div>

							{expandedBatch === batch.id && (
								<div
									style={{
										marginTop: 14,
										paddingTop: 14,
										borderTop: "1px solid var(--color-line-secondary)",
									}}
								>
									<div style={{ marginBottom: 10 }}>
										<strong style={{ fontSize: 13 }}>
											{isRTL ? "ربط الأعمدة:" : "Column Mapping:"}
										</strong>
										<div
											style={{
												display: "flex",
												flexWrap: "wrap",
												gap: 8,
												marginTop: 6,
											}}
										>
											{Object.entries(batch.column_mapping).map(
												([field, col]) => (
													<span
														key={field}
														style={{
															fontSize: 12,
															padding: "3px 8px",
															background: "var(--color-surface-tertiary)",
															borderRadius: 6,
														}}
													>
														{field} → col #{Number(col) + 1}
													</span>
												),
											)}
										</div>
									</div>

									{batch.validation_errors &&
										batch.validation_errors.length > 0 && (
											<div>
												<div
													style={{
														display: "flex",
														justifyContent: "space-between",
														alignItems: "center",
													}}
												>
													<strong style={{ fontSize: 13 }}>
														{isRTL ? "أخطاء التحقق:" : "Validation Errors:"}
													</strong>
													<button
														className="sf-btn sf-btn-ghost"
														style={{ fontSize: 12, padding: "4px 8px" }}
														onClick={(e) => {
															e.stopPropagation();
															downloadErrorReport(batch);
														}}
													>
														<Download size={12} /> CSV
													</button>
												</div>
												<div
													style={{
														maxHeight: 200,
														overflow: "auto",
														marginTop: 8,
														background: "rgba(239,68,68,0.03)",
														borderRadius: 6,
														padding: 8,
													}}
												>
													{batch.validation_errors
														.slice(0, 20)
														.map((err, i) => (
															<div
																key={i}
																style={{
																	fontSize: 12,
																	color: "#ef4444",
																	padding: "3px 0",
																}}
															>
																Row {err.row}: {err.errors.join("; ")}
															</div>
														))}
													{batch.validation_errors.length > 20 && (
														<div
															style={{
																fontSize: 12,
																color: "var(--color-content-tertiary)",
															}}
														>
															+{batch.validation_errors.length - 20} more
														</div>
													)}
												</div>
											</div>
										)}
								</div>
							)}
						</div>
					))}
				</div>
			)}
			</div>
		</PageTransition>
	);
}
