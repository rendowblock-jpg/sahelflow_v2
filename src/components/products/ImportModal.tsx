"use client";

import { useState, useRef, useCallback } from "react";
import {
	Upload,
	FileText,
	CheckCircle,
	X,
	Loader2,
	FileSpreadsheet,
	ArrowRight,
	RefreshCw,
} from "lucide-react";
import { parseCSV, parseXLSX } from "@/lib/import/parsers";
import type { ParseResult } from "@/lib/import/parsers";
import { autoMapColumns } from "@/lib/import/engine";
import type { ColumnMapping, EngineResult } from "@/lib/import/engine";
import ColumnMapper from "./ColumnMapper";
import ImportPreview from "./ImportPreview";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/components/dashboard/ToastProvider";

type Step = "upload" | "map" | "preview" | "committing" | "result";

interface ImportModalProps {
	onClose: () => void;
	onImported: () => void;
}

export default function ImportModal({ onClose, onImported }: ImportModalProps) {
	const { locale } = useI18n();
	const { toast } = useToast();
	const fileRef = useRef<HTMLInputElement>(null);

	const [step, setStep] = useState<Step>("upload");
	const [parseResult, setParseResult] = useState<ParseResult | null>(null);
	const [mapping, setMapping] = useState<ColumnMapping>({});
	const [engineResult, setEngineResult] = useState<EngineResult | null>(null);
	const [batchId, setBatchId] = useState<string | null>(null);
	const [excludedIndices, setExcludedIndices] = useState<Set<number>>(
		new Set(),
	);
	const [loading, setLoading] = useState(false);
	const [pasteText, setPasteText] = useState("");
	const [sheetUrl, setSheetUrl] = useState("");
	const [sheetFetching, setSheetFetching] = useState(false);
	const [commitResult, setCommitResult] = useState<{
		created: number;
		skipped: number;
		errors: number;
	} | null>(null);

	const isRTL = locale === "ar";

	function reset() {
		setStep("upload");
		setParseResult(null);
		setMapping({});
		setEngineResult(null);
		setBatchId(null);
		setExcludedIndices(new Set());
		setCommitResult(null);
	}

	function handleFile(file: File) {
		const reader = new FileReader();
		reader.onload = async (e) => {
			try {
				let result: ParseResult;
				if (file.name.endsWith(".csv") || file.type === "text/csv") {
					result = parseCSV(e.target?.result as string);
				} else if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
					result = parseXLSX(e.target?.result as ArrayBuffer);
				} else {
					toast({
						type: "error",
						title: isRTL
							? "صيغة غير مدعومة"
							: "Unsupported format. Use CSV or XLSX.",
					});
					return;
				}
				if (result.rows.length === 0) {
					toast({
						type: "error",
						title: isRTL ? "لم يتم العثور على بيانات" : "No data found in file",
					});
					return;
				}
				setParseResult(result);
				const auto = autoMapColumns(result.headers) as ColumnMapping;
				setMapping(auto);
				setStep("map");
			} catch (err) {
				toast({ type: "error", title: (err as Error).message });
			}
		};
		if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
			reader.readAsArrayBuffer(file);
		} else {
			reader.readAsText(file);
		}
	}

	function handlePaste() {
		if (!pasteText.trim()) return;
		try {
			const result = parseCSV(pasteText);
			if (result.rows.length === 0) {
				toast({
					type: "error",
					title: isRTL ? "لم يتم العثور على بيانات" : "No data found",
				});
				return;
			}
			setParseResult(result);
			const auto = autoMapColumns(result.headers) as ColumnMapping;
			setMapping(auto);
			setStep("map");
		} catch (err) {
			toast({ type: "error", title: (err as Error).message });
		}
	}

	async function handleSheetsFetch() {
		if (!sheetUrl.includes("docs.google.com")) return;
		setSheetFetching(true);
		try {
			const proxyRes = await fetch("/api/products/import/sheets-proxy", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ url: sheetUrl }),
			});
			const proxyData = await proxyRes.json();
			if (!proxyRes.ok) throw new Error(proxyData.error || "Failed");
			const result = parseCSV(proxyData.csv);
			if (result.rows.length === 0) throw new Error("No products found");
			setParseResult(result);
			const auto = autoMapColumns(result.headers) as ColumnMapping;
			setMapping(auto);
			setStep("map");
		} catch {
			toast({
				type: "error",
				title: isRTL
					? "تعذر جلب البيانات"
					: "Could not fetch sheet. Make sure it is published as CSV.",
			});
		} finally {
			setSheetFetching(false);
		}
	}

	async function handlePreview() {
		if (!parseResult) return;
		const required = ["name", "price"];
		const missing = required.filter((f) => mapping[f] === undefined);
		if (missing.length > 0) {
			toast({
				type: "error",
				title: isRTL
					? `الحقول المطلوبة غير مربوطة: ${missing.join(", ")}`
					: `Required fields not mapped: ${missing.join(", ")}`,
			});
			return;
		}

		setLoading(true);
		try {
			const res = await fetch("/api/products/import-v2", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					headers: parseResult.headers,
					rows: parseResult.rows,
					mapping,
					source: "csv",
				}),
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || "Preview failed");

			setBatchId(data.batchId);
			setEngineResult({
				validRows: data.validRows,
				invalidRows: data.invalidRows,
				duplicateRows: data.duplicateRows,
				summary: data.summary,
			});
			setExcludedIndices(new Set());
			setStep("preview");
		} catch (e) {
			toast({ type: "error", title: (e as Error).message });
		} finally {
			setLoading(false);
		}
	}

	async function handleCommit() {
		if (!engineResult || !parseResult || !batchId) return;
		const included = engineResult.validRows.filter(
			(r) => !excludedIndices.has(r.index),
		);
		if (included.length === 0) {
			toast({
				type: "error",
				title: isRTL ? "لم يتم اختيار أي صفوف" : "No rows selected",
			});
			return;
		}

		setStep("committing");
		try {
			const res = await fetch("/api/products/import-v2", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					batchId,
					rows: parseResult.rows,
					mapping,
					rowIndices: included.map((r) => r.index),
				}),
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || "Commit failed");

			setCommitResult(data);
			setStep("result");
			onImported();
		} catch (e) {
			toast({ type: "error", title: (e as Error).message });
			setStep("preview");
		}
	}

	const toggleRow = useCallback((index: number, included: boolean) => {
		setExcludedIndices((prev) => {
			const next = new Set(prev);
			if (included) next.delete(index);
			else next.add(index);
			return next;
		});
	}, []);

	return (
		<div className="sf-modal-backdrop" onClick={onClose}>
			<div
				className="sf-modal"
				onClick={(e) => e.stopPropagation()}
				style={{ maxWidth: 720, maxHeight: "85vh", overflow: "auto" }}
			>
				<div className="sf-flex-between" style={{ marginBottom: 20 }}>
					<h2 style={{ fontSize: 18, fontWeight: 700 }}>
						{isRTL ? "استيراد المنتجات" : "Import Products"}
					</h2>
					<button
						onClick={onClose}
						className="sf-btn sf-btn-ghost"
						style={{ color: "var(--color-content-secondary)" }}
					>
						<X size={20} />
					</button>
				</div>

				{step === "upload" && (
					<div className="sf-flex-col sf-gap-lg">
						<div
							onClick={() => fileRef.current?.click()}
							className="sf-file-drop-zone"
						>
							<Upload
								size={32}
								style={{
									color: "var(--color-content-tertiary)",
									marginBottom: 12,
								}}
							/>
							<p style={{ fontWeight: 600, marginBottom: 4 }}>
								{isRTL
									? "اسحب ملفاً أو انقر للاستعراض"
									: "Drop CSV/XLSX file or click to browse"}
							</p>
							<p
								style={{ fontSize: 12, color: "var(--color-content-tertiary)" }}
							>
								{isRTL
									? "يدعم CSV و Excel (.xlsx)"
									: "Supports CSV and Excel (.xlsx)"}
							</p>
						</div>
						<input
							ref={fileRef}
							type="file"
							accept=".csv,.xlsx,.xls"
							style={{ display: "none" }}
							onChange={(e) =>
								e.target.files?.[0] && handleFile(e.target.files[0])
							}
						/>

						<div
							style={{
								textAlign: "center",
								color: "var(--color-content-tertiary)",
								fontSize: 12,
							}}
						>
							— {isRTL ? "أو الصق بيانات CSV" : "or paste CSV below"} —
						</div>

						<textarea
							className="sf-textarea"
							rows={5}
							placeholder={`name,price,stock,sku,category\nParfum Elite,3500,50,PE-001,Parfums`}
							value={pasteText}
							onChange={(e) => setPasteText(e.target.value)}
							style={{ fontFamily: "monospace", fontSize: 12 }}
						/>
						{pasteText.trim() && (
							<button className="sf-btn sf-btn-primary" onClick={handlePaste}>
								<FileText size={16} /> {isRTL ? "تحليل CSV" : "Parse CSV"}
							</button>
						)}

						<div
							style={{
								borderTop: "1px solid var(--color-line-primary)",
								paddingTop: 16,
							}}
						>
							<p
								style={{
									fontSize: 13,
									fontWeight: 600,
									marginBottom: 8,
									display: "flex",
									alignItems: "center",
									gap: 6,
								}}
							>
								<FileSpreadsheet size={16} />{" "}
								{isRTL ? "جوجل شيتس" : "Google Sheets"}
							</p>
							<p
								style={{
									fontSize: 12,
									color: "var(--color-content-tertiary)",
									marginBottom: 8,
								}}
							>
								{isRTL
									? "الصق رابط شيت منشور (ملف → مشاركة → نشر على الويب)"
									: "Paste a publicly-shared Google Sheets URL. File → Share → Publish to web."}
							</p>
							<div style={{ display: "flex", gap: 8 }}>
								<input
									className="sf-input"
									placeholder="https://docs.google.com/spreadsheets/d/..."
									value={sheetUrl}
									onChange={(e) => setSheetUrl(e.target.value)}
									dir="ltr"
									style={{ flex: 1 }}
								/>
								<button
									className="sf-btn sf-btn-ghost"
									disabled={
										sheetFetching || !sheetUrl.includes("docs.google.com")
									}
									onClick={handleSheetsFetch}
								>
									{sheetFetching ? (
										<Loader2 size={16} className="spin" />
									) : (
										<ArrowRight size={16} />
									)}
								</button>
							</div>
						</div>
					</div>
				)}

				{step === "map" && parseResult && (
					<div className="sf-flex-col sf-gap-lg">
						<ColumnMapper
							headers={parseResult.headers}
							sampleRows={parseResult.rows.slice(0, 5)}
							mapping={mapping}
							onChange={setMapping}
						/>
						<div
							style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}
						>
							<button className="sf-btn sf-btn-ghost" onClick={reset}>
								<RefreshCw size={14} /> {isRTL ? "إعادة" : "Reset"}
							</button>
							<button
								className="sf-btn sf-btn-primary"
								onClick={handlePreview}
								disabled={loading}
							>
								{loading ? (
									<Loader2 size={16} className="spin" />
								) : (
									<>
										{isRTL ? "معاينة" : "Preview"} <ArrowRight size={14} />
									</>
								)}
							</button>
						</div>
					</div>
				)}

				{step === "preview" && engineResult && (
					<div className="sf-flex-col sf-gap-lg">
						<ImportPreview
							validRows={engineResult.validRows}
							invalidRows={engineResult.invalidRows}
							duplicateRows={engineResult.duplicateRows}
							onToggleRow={toggleRow}
							excludedIndices={excludedIndices}
						/>
						<div
							style={{
								display: "flex",
								gap: 8,
								justifyContent: "space-between",
								alignItems: "center",
							}}
						>
							<button
								className="sf-btn sf-btn-ghost"
								onClick={() => setStep("map")}
							>
								{isRTL ? "رجوع" : "Back"}
							</button>
							<button className="sf-btn sf-btn-primary" onClick={handleCommit}>
								<CheckCircle size={16} />{" "}
								{isRTL
									? `تأكيد الاستيراد (${engineResult.validRows.filter((r) => !excludedIndices.has(r.index)).length})`
									: `Confirm Import (${engineResult.validRows.filter((r) => !excludedIndices.has(r.index)).length})`}
							</button>
						</div>
					</div>
				)}

				{step === "committing" && (
					<div style={{ textAlign: "center", padding: 40 }}>
						<Loader2
							size={40}
							style={{
								animation: "spin 1s linear infinite",
								marginBottom: 16,
								color: "var(--color-primary)",
							}}
						/>
						<p style={{ fontWeight: 600 }}>
							{isRTL ? "جاري الاستيراد..." : "Importing..."}
						</p>
					</div>
				)}

				{step === "result" && commitResult && (
					<div className="sf-flex-col sf-gap-lg">
						<div style={{ textAlign: "center", padding: 24 }}>
							<CheckCircle
								size={40}
								style={{ color: "#10b981", marginBottom: 12 }}
							/>
							<h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
								{isRTL ? "اكتمل الاستيراد" : "Import Complete"}
							</h3>
						</div>
						<div
							style={{
								display: "grid",
								gridTemplateColumns: "1fr 1fr 1fr",
								gap: 12,
							}}
						>
							<div
								className="sf-card"
								style={{ textAlign: "center", padding: 16 }}
							>
								<p
									style={{
										fontSize: 24,
										fontWeight: 700,
										color: "#10b981",
										fontFeatureSettings: '"tnum" 1',
									}}
								>
									{commitResult.created}
								</p>
								<p
									style={{
										fontSize: 12,
										color: "var(--color-content-tertiary)",
									}}
								>
									{isRTL ? "تم الإنشاء" : "Created"}
								</p>
							</div>
							<div
								className="sf-card"
								style={{ textAlign: "center", padding: 16 }}
							>
								<p
									style={{
										fontSize: 24,
										fontWeight: 700,
										color: "#f59e0b",
										fontFeatureSettings: '"tnum" 1',
									}}
								>
									{commitResult.skipped}
								</p>
								<p
									style={{
										fontSize: 12,
										color: "var(--color-content-tertiary)",
									}}
								>
									{isRTL ? "تم التخطي" : "Skipped"}
								</p>
							</div>
							<div
								className="sf-card"
								style={{ textAlign: "center", padding: 16 }}
							>
								<p
									style={{
										fontSize: 24,
										fontWeight: 700,
										color: commitResult.errors > 0 ? "#ef4444" : "#10b981",
										fontFeatureSettings: '"tnum" 1',
									}}
								>
									{commitResult.errors}
								</p>
								<p
									style={{
										fontSize: 12,
										color: "var(--color-content-tertiary)",
									}}
								>
									{isRTL ? "أخطاء" : "Errors"}
								</p>
							</div>
						</div>
						<button
							className="sf-btn sf-btn-primary"
							style={{ width: "100%" }}
							onClick={onClose}
						>
							{isRTL ? "إغلاق" : "Close"}
						</button>
					</div>
				)}
			</div>
		</div>
	);
}
