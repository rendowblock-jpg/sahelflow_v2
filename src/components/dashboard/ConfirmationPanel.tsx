"use client";

import { useState } from "react";
import {
	Phone,
	MessageCircle,
	AlertTriangle,
	CheckCircle,
	XCircle,
	Voicemail,
	Copy,
	ChevronRight,
	TrendingUp,
	Plus,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/components/dashboard/ToastProvider";
import type { ConfirmationStatus, ReturnReason } from "@/types/database";

interface OrderData {
	id: string;
	order_number: string;
	status: string;
	total_price: number;
	delivery_cost?: number;
	wilaya?: string;
	commune?: string;
	address?: string;
	notes?: string;
	items?: {
		product_id?: string;
		product_name?: string;
		name?: string;
		quantity: number;
		unit_price: number;
	}[];
	customer?: { name?: string; phone?: string } | null;
	customer_id?: string;
	created_at: string;
	confirmation_status?: string | null;
	confirmation_attempts?: number;
	confirmation_notes?: string | null;
}

interface Props {
	order: OrderData;
	onStatusChange: (
		orderId: string,
		newStatus: string,
		extra?: Record<string, unknown>,
	) => void;
	onClose: () => void;
}

const CONFIRMATION_STEPS = [
	"step1_greet",
	"step2_identify",
	"step3_confirm_product",
	"step4_confirm_address",
	"step5_get_details",
	"step6_delivery_type",
	"step7_upsell",
	"step8_close",
] as const;

export default function ConfirmationPanel({
	order,
	onStatusChange,
	onClose: _onClose,
}: Props) {
	const { t, locale } = useI18n();
	const { toast } = useToast();
	const [stepChecked, setStepChecked] = useState<Set<number>>(new Set());
	const [confirmationStatus, setConfirmationStatus] = useState<string | null>(
		order.confirmation_status || null,
	);
	const [attempts, setAttempts] = useState(order.confirmation_attempts || 0);
	const [notes, setNotes] = useState(order.confirmation_notes || "");
	const [saving, setSaving] = useState(false);
	const [showReturnReason, setShowReturnReason] = useState(false);
	const [returnReason, setReturnReason] = useState<ReturnReason | "">("");
	const [upsellSuggestions, setUpsellSuggestions] = useState<
		Array<{
			product_id: string;
			name: string;
			price: number;
			margin: number;
			marginPercent: number;
			stock: number;
			reason: string;
		}>
	>([]);
	const [upsellLoading, setUpsellLoading] = useState(false);
	const [upsellOffered, setUpsellOffered] = useState(false);

	function toggleStep(index: number) {
		const next = new Set(stepChecked);
		if (next.has(index)) next.delete(index);
		else next.add(index);
		setStepChecked(next);
		if (
			index === 6 &&
			next.has(6) &&
			upsellSuggestions.length === 0 &&
			!upsellLoading
		) {
			fetchUpsellSuggestions();
		}
	}

	async function fetchUpsellSuggestions() {
		setUpsellLoading(true);
		try {
			const res = await fetch("/api/upsell/suggestions", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ order_id: order.id }),
			});
			const data = await res.json();
			setUpsellSuggestions(data.suggestions || []);
		} catch {
			toast({
				type: "error",
				title:
					t.confirmation?.upsellFailed || "Failed to load upsell suggestions",
			});
		} finally {
			setUpsellLoading(false);
		}
	}

	async function markConfirmationStatus(status: ConfirmationStatus) {
		setSaving(true);
		try {
			const newAttempts =
				status === "rappel" || status === "boite_vocale"
					? attempts + 1
					: attempts;
			const res = await fetch(`/api/orders/${order.id}/confirm`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					confirmation_status: status,
					confirmation_attempts: newAttempts,
					confirmation_notes: notes || null,
				}),
			});

			if (!res.ok) {
				const errData = await res.json();
				throw new Error(errData.error || "Failed to update status");
			}

			setConfirmationStatus(status);
			setAttempts(newAttempts);

			if (status === "annule") {
				onStatusChange(order.id, "cancelled", { confirmation_status: status });
			} else if (status === "confirmed") {
				onStatusChange(order.id, "confirmed", { confirmation_status: status });
			} else if (status === "doublon") {
				onStatusChange(order.id, order.status, { confirmation_status: status });
			}
		} catch (err: unknown) {
			const msg =
				err instanceof Error
					? err.message
					: t.confirmation?.statusUpdateFailed || "Failed to update status";
			toast({ type: "error", title: msg });
		} finally {
			setSaving(false);
		}
	}

	async function handleConfirmOrder() {
		setSaving(true);
		try {
			const res = await fetch(`/api/orders/${order.id}/confirm`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					confirmation_status: "confirmed",
					confirmation_attempts: attempts,
					confirmation_notes: notes || null,
				}),
			});

			if (!res.ok) {
				const errData = await res.json();
				throw new Error(errData.error || "Failed to confirm order");
			}

			onStatusChange(order.id, "confirmed", {
				confirmation_status: "confirmed",
			});
		} catch (err: unknown) {
			const msg =
				err instanceof Error
					? err.message
					: t.confirmation?.confirmFailed || "Failed to confirm order";
			toast({ type: "error", title: msg });
		} finally {
			setSaving(false);
		}
	}

	async function handleReturnWithReason() {
		if (!returnReason) return;
		setSaving(true);
		try {
			// 1. Fetch returns to see if a return request already exists for this order
			const resList = await fetch("/api/returns", { method: "GET" });
			const listData = await resList.json();
			const existing = (listData.returns || []).find(
				(r: Record<string, unknown>) => r.order_id === order.id,
			);

			if (existing) {
				// Update existing return
				const resUpdate = await fetch(`/api/returns/${existing.id}`, {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						reason: returnReason,
					}),
				});
				if (!resUpdate.ok) {
					const errData = await resUpdate.json();
					throw new Error(errData.error || "Failed to update return");
				}
			} else {
				// Create new return request
				const resCreate = await fetch("/api/returns", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						orderId: order.id,
						type: "return",
						reason: returnReason,
						resolution_type: "refund",
						items: (order.items || []).map((item) => ({
							product_id: item.product_id || "",
							product_name: item.product_name || item.name || "Unknown Product",
							quantity: item.quantity || 1,
							price: item.unit_price || 0,
						})),
					}),
				});
				if (!resCreate.ok) {
					const errData = await resCreate.json();
					throw new Error(errData.error || "Failed to create return");
				}
			}

			onStatusChange(order.id, "returned", {});
		} catch (err: unknown) {
			const msg =
				err instanceof Error
					? err.message
					: t.confirmation?.returnFailed || "Failed to process return";
			toast({ type: "error", title: msg });
		} finally {
			setSaving(false);
		}
	}

	const customer = order.customer;
	const phone = customer?.phone;
	const name = customer?.name || "—";
	const statusColor: Record<string, string> = {
		rappel: "#f59e0b",
		en_attente: "#6366f1",
		doublon: "#8b5cf6",
		faux_numero: "#ef4444",
		boite_vocale: "#f97316",
		confirmed: "#10b981",
		annule: "#6b7280",
	};

	return (
		<div
			style={{ display: "flex", flexDirection: "column", gap: 20, padding: 4 }}
		>
			{/* Header */}
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
				}}
			>
				<h2 style={{ fontSize: 18, fontWeight: 700 }}>
					{t.confirmationFlow.title}
				</h2>
				<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
					{confirmationStatus && (
						<span
							style={{
								padding: "4px 10px",
								borderRadius: 6,
								fontSize: 11,
								fontWeight: 600,
								background: `${statusColor[confirmationStatus] || "#6b7280"}18`,
								color: statusColor[confirmationStatus] || "#6b7280",
								border: `1px solid ${statusColor[confirmationStatus] || "#6b7280"}40`,
							}}
						>
							{t.confirmationStatuses[
								confirmationStatus as keyof typeof t.confirmationStatuses
							] || confirmationStatus}
						</span>
					)}
					{attempts > 0 && (
						<span
							style={{ fontSize: 11, color: "var(--color-content-tertiary)" }}
						>
							{t.confirmationFlow.attempts.replace("{n}", String(attempts))}
						</span>
					)}
				</div>
			</div>

			{/* Customer Info + Call Button */}
			<div
				style={{
					background: "var(--color-surface-primary)",
					border: "1px solid var(--color-line-primary)",
					borderRadius: 10,
					padding: 14,
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
				}}
			>
				<div>
					<p style={{ fontWeight: 600, fontSize: 14 }}>{name}</p>
					{phone && (
						<p
							style={{
								fontSize: 13,
								color: "var(--color-content-secondary)",
								fontFamily: "monospace",
							}}
						>
							{phone}
						</p>
					)}
					{order.wilaya && (
						<p style={{ fontSize: 12, color: "var(--color-content-tertiary)" }}>
							{order.wilaya}
							{order.commune ? `, ${order.commune}` : ""}
						</p>
					)}
				</div>
				<div style={{ display: "flex", gap: 8 }}>
					{phone && (
						<>
							<a
								href={`tel:${phone}`}
								style={{
									display: "inline-flex",
									alignItems: "center",
									gap: 6,
									padding: "8px 14px",
									borderRadius: 8,
									background: "#10b981",
									color: "#fff",
									textDecoration: "none",
									fontWeight: 600,
									fontSize: 13,
								}}
							>
								<Phone size={14} /> Call
							</a>
							<a
								href={`https://wa.me/${phone.replace(/[^0-9]/g, "")}`}
								target="_blank"
								rel="noopener noreferrer"
								style={{
									display: "inline-flex",
									alignItems: "center",
									gap: 6,
									padding: "8px 14px",
									borderRadius: 8,
									background: "#25D366",
									color: "#fff",
									textDecoration: "none",
									fontWeight: 600,
									fontSize: 13,
								}}
							>
								<MessageCircle size={14} /> WhatsApp
							</a>
						</>
					)}
				</div>
			</div>

			{/* Order Details */}
			<div
				style={{
					background: "var(--color-surface-primary)",
					border: "1px solid var(--color-line-primary)",
					borderRadius: 10,
					padding: 14,
				}}
			>
				<p
					style={{
						fontWeight: 600,
						fontSize: 13,
						marginBottom: 8,
						fontFamily: "monospace",
					}}
				>
					{order.order_number}
				</p>
				{(order.items || []).map((item, i) => (
					<div
						key={i}
						style={{
							display: "flex",
							justifyContent: "space-between",
							fontSize: 13,
							padding: "3px 0",
						}}
					>
						<span>
							{item.quantity}x {item.product_name || item.name}
						</span>
						<span style={{ fontFamily: "monospace" }}>
							{item.unit_price.toLocaleString(
								locale === "ar" ? "ar-DZ" : locale === "en" ? "en-US" : "fr-DZ",
							)}{" "}
							DA
						</span>
					</div>
				))}
				<div
					style={{
						borderTop: "1px solid var(--color-line-primary)",
						marginTop: 6,
						paddingTop: 6,
						display: "flex",
						justifyContent: "space-between",
						fontWeight: 700,
						fontSize: 14,
					}}
				>
					<span>{t.store.total}</span>
					<span style={{ color: "var(--color-brand-400)" }}>
						{Number(order.total_price).toLocaleString(
							locale === "ar" ? "ar-DZ" : locale === "en" ? "en-US" : "fr-DZ",
						)}{" "}
						DA
					</span>
				</div>
			</div>

			{/* 8-Step Confirmation Script */}
			<div>
				<h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>
					{t.confirmationFlow.callScript}
				</h3>
				<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
					{CONFIRMATION_STEPS.map((stepKey, i) => (
						<label
							key={i}
							style={{
								display: "flex",
								alignItems: "center",
								gap: 10,
								padding: "8px 12px",
								borderRadius: 8,
								cursor: "pointer",
								fontSize: 13,
								background: stepChecked.has(i)
									? "rgba(16,185,129,0.06)"
									: "transparent",
								border: `1px solid ${stepChecked.has(i) ? "rgba(16,185,129,0.3)" : "var(--color-line-primary)"}`,
								transition: "all 0.15s",
							}}
						>
							<input
								type="checkbox"
								checked={stepChecked.has(i)}
								onChange={() => toggleStep(i)}
								style={{ accentColor: "#10b981", width: 16, height: 16 }}
							/>
							<span style={{ flex: 1 }}>{t.confirmationFlow[stepKey]}</span>
							<ChevronRight size={14} style={{ opacity: 0.3 }} />
						</label>
					))}
				</div>
			</div>

			{/* Upsell Suggestions (shown when step 7 is checked) */}
			{stepChecked.has(6) && (
				<div>
					<h3
						style={{
							fontSize: 14,
							fontWeight: 700,
							marginBottom: 10,
							display: "flex",
							alignItems: "center",
							gap: 6,
						}}
					>
						<TrendingUp size={16} style={{ color: "#f59e0b" }} />{" "}
						{t.confirmationFlow.upsellPrompt}
					</h3>
					{upsellLoading ? (
						<p style={{ fontSize: 13, color: "var(--color-content-tertiary)" }}>
							{t.common.loading}
						</p>
					) : upsellSuggestions.length === 0 ? (
						<p style={{ fontSize: 13, color: "var(--color-content-tertiary)" }}>
							No upsell suggestions available
						</p>
					) : (
						<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
							{upsellSuggestions.map((s) => (
								<div
									key={s.product_id}
									style={{
										display: "flex",
										justifyContent: "space-between",
										alignItems: "center",
										padding: "8px 12px",
										borderRadius: 8,
										border: "1px solid var(--color-line-primary)",
										background: "var(--color-surface-primary)",
									}}
								>
									<div style={{ flex: 1 }}>
										<p style={{ fontWeight: 600, fontSize: 13 }}>{s.name}</p>
										<p
											style={{
												fontSize: 11,
												color: "var(--color-content-tertiary)",
											}}
										>
											{s.reason}
										</p>
									</div>
									<div style={{ textAlign: "right" }}>
										<p style={{ fontWeight: 700, fontSize: 13 }}>
											{s.price.toLocaleString(
												locale === "ar"
													? "ar-DZ"
													: locale === "en"
														? "en-US"
														: "fr-DZ",
											)}{" "}
											DA
										</p>
										<p style={{ fontSize: 11, color: "#10b981" }}>
											{s.marginPercent}% margin
										</p>
									</div>
								</div>
							))}
							{!upsellOffered && (
								<button
									className="sf-btn sf-btn-primary"
									style={{ fontSize: 12, marginTop: 4 }}
									onClick={async () => {
										try {
											const res = await fetch(
												`/api/orders/${order.id}/confirm`,
												{
													method: "PATCH",
													headers: { "Content-Type": "application/json" },
													body: JSON.stringify({
														upsell_offered: true,
													}),
												},
											);
											if (!res.ok) {
												const errData = await res.json();
												throw new Error(
													errData.error || "Failed to update upsell status",
												);
											}
											setUpsellOffered(true);
										} catch (err: unknown) {
											const msg =
												err instanceof Error
													? err.message
													: "Failed to update upsell status";
											toast({ type: "error", title: msg });
										}
									}}
								>
									<Plus size={14} /> Offer to customer
								</button>
							)}
							{upsellOffered && (
								<span
									style={{
										fontSize: 12,
										color: "#10b981",
										display: "flex",
										alignItems: "center",
										gap: 4,
									}}
								>
									<CheckCircle size={14} /> Upsell offered
								</span>
							)}
						</div>
					)}
				</div>
			)}

			{/* Confirmation Notes */}
			<div>
				<label
					style={{
						fontSize: 12,
						fontWeight: 600,
						color: "var(--color-content-secondary)",
						marginBottom: 4,
						display: "block",
					}}
				>
					Notes
				</label>
				<textarea
					value={notes}
					onChange={(e) => setNotes(e.target.value)}
					placeholder={t.orders.callNotesPlaceholder}
					style={{
						width: "100%",
						padding: 10,
						borderRadius: 8,
						fontSize: 13,
						border: "1px solid var(--color-line-primary)",
						background: "var(--color-surface-primary)",
						resize: "vertical",
						minHeight: 60,
						fontFamily: "inherit",
					}}
				/>
			</div>

			{/* Quick Action Buttons */}
			<div>
				<h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>
					Status
				</h3>
				<div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
					<button
						onClick={() => markConfirmationStatus("rappel")}
						disabled={saving}
						style={actionBtnStyle("#f59e0b")}
					>
						<Phone size={14} /> {t.confirmationFlow.markAsRappel}
					</button>
					<button
						onClick={() => markConfirmationStatus("faux_numero")}
						disabled={saving}
						style={actionBtnStyle("#ef4444")}
					>
						<XCircle size={14} /> {t.confirmationFlow.markAsFauxNumero}
					</button>
					<button
						onClick={() => markConfirmationStatus("boite_vocale")}
						disabled={saving}
						style={actionBtnStyle("#f97316")}
					>
						<Voicemail size={14} /> {t.confirmationFlow.markAsBoiteVocale}
					</button>
					<button
						onClick={() => markConfirmationStatus("doublon")}
						disabled={saving}
						style={actionBtnStyle("#8b5cf6")}
					>
						<Copy size={14} /> {t.confirmationFlow.markAsDoublon}
					</button>
				</div>
			</div>

			{/* Primary Actions */}
			<div style={{ display: "flex", gap: 10, marginTop: 4 }}>
				<button
					className="sf-btn sf-btn-success"
					style={{ flex: 1, minHeight: 44, fontSize: 14, fontWeight: 700 }}
					onClick={handleConfirmOrder}
					disabled={saving}
				>
					<CheckCircle size={18} /> {t.confirmationFlow.confirmOrder}
				</button>
				<button
					className="sf-btn sf-btn-ghost"
					style={{ flex: 1, minHeight: 44, fontSize: 14, color: "#ef4444" }}
					onClick={() => markConfirmationStatus("annule")}
					disabled={saving}
				>
					<XCircle size={18} /> {t.confirmationFlow.cancelOrder}
				</button>
			</div>

			{/* Return Reason (shown when status is returned/refused) */}
			{(order.status === "returned" || order.status === "refused") &&
				!showReturnReason && (
					<button
						className="sf-btn sf-btn-ghost"
						style={{ width: "100%", fontSize: 13 }}
						onClick={() => setShowReturnReason(true)}
					>
						<AlertTriangle size={14} /> {t.returnReasons.selectReason}
					</button>
				)}

			{showReturnReason && (
				<div
					style={{
						background: "var(--color-surface-primary)",
						border: "1px solid var(--color-line-primary)",
						borderRadius: 10,
						padding: 14,
					}}
				>
					<p style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>
						{t.returnReasons.selectReason}
					</p>
					<select
						value={returnReason}
						onChange={(e) => setReturnReason(e.target.value as ReturnReason)}
						style={{
							width: "100%",
							padding: 10,
							borderRadius: 8,
							fontSize: 13,
							border: "1px solid var(--color-line-primary)",
							background: "var(--color-surface-primary)",
						}}
					>
						<option value="">{t.returnReasons.selectReason}</option>
						<option value="wrong_product">
							{t.returnReasons.wrong_product}
						</option>
						<option value="damaged">{t.returnReasons.damaged}</option>
						<option value="changed_mind">{t.returnReasons.changed_mind}</option>
						<option value="not_as_described">
							{t.returnReasons.not_as_described}
						</option>
						<option value="wrong_size">{t.returnReasons.wrong_size}</option>
						<option value="other">{t.returnReasons.other}</option>
					</select>
					<button
						className="sf-btn sf-btn-primary"
						style={{
							width: "100%",
							marginTop: 10,
							minHeight: 40,
							fontSize: 13,
						}}
						onClick={handleReturnWithReason}
						disabled={!returnReason || saving}
					>
						{t.common.save}
					</button>
				</div>
			)}
		</div>
	);
}

function actionBtnStyle(color: string): React.CSSProperties {
	return {
		display: "inline-flex",
		alignItems: "center",
		gap: 6,
		padding: "6px 12px",
		borderRadius: 8,
		border: `1px solid ${color}40`,
		background: `${color}10`,
		color,
		fontWeight: 600,
		fontSize: 12,
		cursor: "pointer",
		transition: "all 0.15s",
	};
}
