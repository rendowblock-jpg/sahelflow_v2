"use client";
import type { Return, ReturnStatus, ReturnItem } from "@/types";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
	ArrowLeft,
	DollarSign,
	AlertCircle,
	Truck,
	CheckCircle,
	XCircle,
	Loader2,
	FileText,
	User,
	ShoppingBag,
	Send,
	RotateCcw,
} from "lucide-react";
import {
	getReturn,
	updateReturnStatus,
	addReturnNote,
	createExchangeOrder,
} from "@/lib/data/returns-service";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/components/dashboard/ToastProvider";
import { PageTransition } from "@/components/ui/motion";
import ReturnTimeline from "@/components/returns/ReturnTimeline";

export default function ReturnDetailPage() {
	const { id } = useParams() as { id: string };
	// useRouter available for future navigation
	const { t, formatCurrency, locale } = useI18n();
	const { toast } = useToast();

	const [ret, setRet] = useState<Return | null>(null);
	const [loading, setLoading] = useState(true);
	const [updating, setUpdating] = useState(false);
	const [noteContent, setNoteContent] = useState("");
	const [submittingNote, setSubmittingNote] = useState(false);

	// Return shipment inputs
	const [trackingId, setTrackingId] = useState("");
	const [deliveryCompany, setDeliveryCompany] = useState("");

	const loadReturn = useCallback(async () => {
		try {
			setLoading(true);
			const data = await getReturn(id);
			setRet(data);
			setTrackingId(data.return_tracking_id || "");
			setDeliveryCompany(data.return_delivery_company || "");
		} catch (e: unknown) {
			toast({
				type: "error",
				title: e instanceof Error ? e.message : t.returns.loadingDetails,
			});
		} finally {
			setLoading(false);
		}
	}, [id, toast, t]);

	useEffect(() => {
		loadReturn();
	}, [loadReturn]);

	const handleStatusChange = async (status: string, reasonNote?: string) => {
		setUpdating(true);
		try {
			const updates: {
				return_tracking_id?: string;
				return_delivery_company?: string;
				notes?: string;
			} = {};
			if (trackingId) updates.return_tracking_id = trackingId;
			if (deliveryCompany) updates.return_delivery_company = deliveryCompany;
			if (reasonNote) updates.notes = reasonNote;

			await updateReturnStatus(id, status as ReturnStatus, updates);
			const localizedStatus =
				(t.returns.statusMap as Record<string, string>)[status] || status;
			toast({
				type: "success",
				title: t.returns.successStatusUpdated.replace(
					"{status}",
					localizedStatus,
				),
			});
			await loadReturn();
		} catch (e: unknown) {
			toast({
				type: "error",
				title: e instanceof Error ? e.message : t.returns.errorStatusUpdate,
			});
		} finally {
			setUpdating(false);
		}
	};

	const handleAddNote = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!noteContent.trim()) return;

		setSubmittingNote(true);
		try {
			await addReturnNote(id, noteContent.trim(), "note");
			toast({ type: "success", title: t.returns.successNoteAdded });
			setNoteContent("");
			await loadReturn();
		} catch (e: unknown) {
			toast({
				type: "error",
				title: e instanceof Error ? e.message : t.returns.errorNoteAdd,
			});
		} finally {
			setSubmittingNote(false);
		}
	};

	const handleTriggerExchange = async () => {
		setUpdating(true);
		try {
			await createExchangeOrder(id);
			toast({ type: "success", title: t.returns.successExchangeCreated });
			await loadReturn();
		} catch (e: unknown) {
			toast({
				type: "error",
				title: e instanceof Error ? e.message : t.returns.errorExchangeCreate,
			});
		} finally {
			setUpdating(false);
		}
	};

	const statusColorMap: Record<string, string> = {
		requested: "sf-badge-return-requested",
		approved: "sf-badge-return-approved",
		pickup: "sf-badge-return-pickup",
		received: "sf-badge-return-received",
		inspected: "sf-badge-return-inspected",
		refunded: "sf-badge-return-refunded",
		exchanged: "sf-badge-return-exchanged",
		rejected: "sf-badge-return-rejected",
		closed: "sf-badge-return-closed",
	};

	const reasonLabelMap: Record<string, string> = {
		wrong_product: t.returnReasons.wrong_product,
		damaged: t.returnReasons.damaged,
		changed_mind: t.returnReasons.changed_mind,
		not_as_described: t.returnReasons.not_as_described,
		wrong_size: t.returnReasons.wrong_size,
		defective: t.returnReasons.defective,
		late_delivery: t.returnReasons.late_delivery,
		other: t.returnReasons.other,
	};

	const resolutionLabelMap: Record<string, string> = {
		refund:
			locale === "ar"
				? "استرداد مالي"
				: locale === "fr"
					? "Remboursement"
					: "Refund",
		exchange:
			locale === "ar" ? "استبدال" : locale === "fr" ? "Échange" : "Exchange",
		credit:
			locale === "ar"
				? "رصيد متجر"
				: locale === "fr"
					? "Crédit magasin"
					: "Store Credit",
	};

	if (loading) {
		return (
			<div
				className="sf-flex-col sf-gap-xl sf-animate-fade sf-items-center sf-justify-center"
				style={{ minHeight: "60vh" }}
			>
				<Loader2 size={32} className="sf-animate-spin sf-text-brand" />
				<span className="sf-text-secondary">{t.returns.loadingDetails}</span>
			</div>
		);
	}

	if (!ret) {
		return (
			<PageTransition className="sf-flex-col sf-gap-md sf-items-center sf-justify-center sf-py-xl">
				<AlertCircle size={48} className="sf-text-danger" />
				<h2 className="sf-text-xl sf-font-semibold">{t.returns.notFound}</h2>
				<p className="sf-text-secondary">{t.returns.notFoundDesc}</p>
				<Link href="/dashboard/returns" className="sf-btn sf-btn-primary">
					<ArrowLeft size={16} /> {t.returns.backToReturns}
				</Link>
			</PageTransition>
		);
	}

	return (
		<PageTransition className="sf-flex-col sf-gap-xl">
			{/* Detail Page Header */}
			<div className="sf-page-header">
				<div className="sf-flex sf-gap-md sf-items-center">
					<Link
						href="/dashboard/returns"
						className="sf-btn sf-btn-ghost sf-icon-box-sm"
					>
						<ArrowLeft size={16} />
					</Link>
					<div>
						<h1
							className="sf-page-title"
							style={{ display: "flex", alignItems: "center", gap: 10 }}
						>
							{ret.return_number}
							<span className={`sf-badge ${statusColorMap[ret.status] || ""}`}>
								{(t.returns.statusMap as Record<string, string>)[ret.status] ||
									ret.status.toUpperCase()}
							</span>
						</h1>
						<p className="sf-page-subtitle">
							{t.returns.requestedOn
								.replace(
									"{date}",
									new Date(ret.created_at).toLocaleDateString(),
								)
								.replace("{num}", ret.order?.order_number || "")}
						</p>
					</div>
				</div>
			</div>

			{/* Main Grid Layout */}
			<div className="sf-returns-detail-grid">
				{/* Left Column: Items, Timeline, Add Notes */}
				<div className="sf-flex-col sf-gap-lg">
					{/* Returned Items Card */}
					<div className="sf-card sf-p-lg">
						<h3
							className="sf-section-label"
							style={{ marginBlockEnd: "var(--space-4)" }}
						>
							{t.returns.returnedItems}
						</h3>
						<div className="sf-return-items-list">
							{((ret.items || []) as ReturnItem[]).map((item, idx: number) => (
								<div key={idx} className="sf-return-item-row">
									<div className="sf-return-item-info">
										<span className="sf-return-item-name">
											{item.product_name}
										</span>
										<span className="sf-return-item-qty">
											{t.returns.qty.replace("{qty}", String(item.quantity))}
										</span>
									</div>
									<span className="sf-return-item-price">
										{formatCurrency(item.price * item.quantity)}
									</span>
								</div>
							))}
						</div>

						{ret.reason_details && (
							<div
								className="sf-mt-lg sf-p-md sf-p-lg sf-card-flush"
								style={{
									background: "var(--color-surface-tertiary)",
									border: "1px solid var(--color-line-secondary)",
								}}
							>
								<h4
									className="sf-font-semibold sf-text-sm"
									style={{ marginBlockEnd: 4 }}
								>
									{t.returns.problemDetails}
								</h4>
								<p className="sf-text-secondary sf-text-sm">
									{ret.reason_details}
								</p>
							</div>
						)}
					</div>

					{/* Timeline and History log */}
					<div className="sf-card sf-p-lg">
						<h3
							className="sf-section-label"
							style={{ marginBlockEnd: "var(--space-4)" }}
						>
							{t.returns.activityTimeline}
						</h3>
						<ReturnTimeline notes={ret.notes || []} />

						{/* Note Submission Form */}
						<form
							onSubmit={handleAddNote}
							className="sf-return-note-form sf-divider-subtle sf-mt-lg sf-py-md"
						>
							<label className="sf-label">{t.returns.addNote}</label>
							<textarea
								className="sf-textarea"
								rows={2}
								placeholder={t.returns.notePlaceholder}
								value={noteContent}
								onChange={(e) => setNoteContent(e.target.value)}
							/>
							<button
								type="submit"
								disabled={submittingNote || !noteContent.trim()}
								className="sf-btn sf-btn-primary sf-self-end"
								style={{
									display: "flex",
									alignItems: "center",
									gap: 6,
									minHeight: 32,
								}}
							>
								{submittingNote ? (
									<Loader2 size={12} className="sf-animate-spin" />
								) : (
									<Send size={12} />
								)}
								{t.returns.postNote}
							</button>
						</form>
					</div>
				</div>

				{/* Right Column: Workflow Controls, Customer and Order details */}
				<div className="sf-flex-col sf-gap-lg">
					{/* Status Control Card */}
					<div className="sf-card sf-p-lg">
						<h3
							className="sf-section-label"
							style={{ marginBlockEnd: "var(--space-4)" }}
						>
							{t.returns.workflowControl}
						</h3>

						{updating && (
							<div className="sf-flex sf-gap-sm sf-items-center sf-py-sm sf-text-brand">
								<Loader2 size={16} className="sf-animate-spin" />
								<span>{t.returns.updatingState}</span>
							</div>
						)}

						<div className="sf-flex-col sf-gap-md">
							{/* Return Tracking Fields (Only editable when approved/pickup) */}
							{["approved", "pickup"].includes(ret.status) && (
								<div
									className="sf-flex-col sf-gap-sm sf-p-md sf-card-flush"
									style={{
										background: "var(--color-surface-tertiary)",
										border: "1px solid var(--color-line-secondary)",
									}}
								>
									<span className="sf-font-semibold sf-text-xs sf-text-secondary">
										{t.returns.returnShipping}
									</span>
									<div>
										<label className="sf-label" style={{ fontSize: 10 }}>
											{t.returns.deliveryCompany}
										</label>
										<input
											type="text"
											className="sf-input"
											style={{ height: 32, fontSize: 12 }}
											placeholder="e.g. Yalidine, Maystro"
											value={deliveryCompany}
											onChange={(e) => setDeliveryCompany(e.target.value)}
										/>
									</div>
									<div>
										<label className="sf-label" style={{ fontSize: 10 }}>
											{t.returns.trackingNumber}
										</label>
										<input
											type="text"
											className="sf-input"
											style={{ height: 32, fontSize: 12 }}
											placeholder="Tracking ID"
											value={trackingId}
											onChange={(e) => setTrackingId(e.target.value)}
										/>
									</div>
								</div>
							)}

							{/* Action Buttons based on Status */}
							<div className="sf-flex-col sf-gap-sm">
								{ret.status === "requested" && (
									<>
										<button
											className="sf-btn sf-btn-primary sf-w-full"
											disabled={updating}
											onClick={() =>
												handleStatusChange(
													"approved",
													"Return request approved by seller.",
												)
											}
										>
											<CheckCircle size={16} /> {t.returns.approveReturn}
										</button>
										<button
											className="sf-btn sf-btn-danger sf-w-full"
											disabled={updating}
											onClick={() => {
												const reason = prompt(t.returns.rejectPrompt);
												if (reason !== null) {
													handleStatusChange(
														"rejected",
														`Return request rejected: ${reason || "No reason given."}`,
													);
												}
											}}
										>
											<XCircle size={16} /> {t.returns.rejectReturn}
										</button>
									</>
								)}

								{ret.status === "approved" && (
									<button
										className="sf-btn sf-btn-primary sf-w-full"
										disabled={updating}
										onClick={() =>
											handleStatusChange(
												"pickup",
												"Package being collected / pickup initiated.",
											)
										}
									>
										<Truck size={16} /> {t.returns.markShipped}
									</button>
								)}

								{ret.status === "pickup" && (
									<button
										className="sf-btn sf-btn-primary sf-w-full"
										disabled={updating}
										onClick={() =>
											handleStatusChange(
												"received",
												"Seller received package from customer.",
											)
										}
									>
										<RotateCcw size={16} /> {t.returns.markReceived}
									</button>
								)}

								{ret.status === "received" && (
									<button
										className="sf-btn sf-btn-primary sf-w-full"
										disabled={updating}
										onClick={() =>
											handleStatusChange(
												"inspected",
												"Package inspected and approved.",
											)
										}
									>
										<FileText size={16} /> {t.returns.markInspected}
									</button>
								)}

								{ret.status === "inspected" && (
									<>
										{ret.resolution_type === "refund" && (
											<button
												className="sf-btn sf-btn-success sf-w-full"
												disabled={updating}
												onClick={() =>
													handleStatusChange(
														"refunded",
														`Refund of ${formatCurrency(ret.refund_amount)} issued.`,
													)
												}
											>
												<DollarSign size={16} /> {t.returns.processRefund}
											</button>
										)}

										{ret.resolution_type === "exchange" &&
											!ret.exchange_order_id && (
												<button
													className="sf-btn sf-btn-brand sf-w-full"
													disabled={updating}
													onClick={handleTriggerExchange}
												>
													<RotateCcw size={16} /> {t.returns.processExchange}
												</button>
											)}

										{ret.resolution_type === "credit" && (
											<button
												className="sf-btn sf-btn-primary sf-w-full"
												disabled={updating}
												onClick={() =>
													handleStatusChange(
														"closed",
														"Store credit issues. Case closed.",
													)
												}
											>
												<CheckCircle size={16} /> {t.returns.issueCredit}
											</button>
										)}
									</>
								)}

								{ret.status === "exchanged" && ret.exchange_order_id && (
									<div
										className="sf-p-md sf-card-flush sf-text-center"
										style={{
											background: "rgba(236, 72, 153, 0.05)",
											border: "1px solid rgba(236, 72, 153, 0.2)",
										}}
									>
										<span
											className="sf-text-xs sf-text-secondary"
											style={{ color: "#ec4899", fontWeight: 600 }}
										>
											{t.returns.exchangeInitiated}
										</span>
										<p className="sf-text-xs sf-text-tertiary sf-mt-sm">
											{t.returns.exchangeDesc}
										</p>
									</div>
								)}

								{/* General close case option for completed items */}
								{["refunded", "exchanged", "rejected"].includes(ret.status) && (
									<button
										className="sf-btn sf-btn-ghost sf-w-full"
										disabled={updating}
										onClick={() =>
											handleStatusChange(
												"closed",
												"Case finalized and archived.",
											)
										}
									>
										{t.returns.closeArchive}
									</button>
								)}
							</div>
						</div>
					</div>

					{/* Details & Meta Card */}
					<div className="sf-card sf-p-lg">
						<h3
							className="sf-section-label"
							style={{ marginBlockEnd: "var(--space-4)" }}
						>
							{t.returns.details}
						</h3>
						<div className="sf-returns-meta-list">
							<div className="sf-returns-meta-item">
								<span className="sf-returns-meta-label">
									{t.returns.resolution}
								</span>
								<span
									className="sf-returns-meta-value"
									style={{ textTransform: "capitalize" }}
								>
									{resolutionLabelMap[ret.resolution_type] ||
										ret.resolution_type}
								</span>
							</div>
							{ret.resolution_type === "refund" && (
								<div className="sf-returns-meta-item">
									<span className="sf-returns-meta-label">
										{t.returns.refundAmount}
									</span>
									<span className="sf-returns-meta-value sf-text-brand">
										{formatCurrency(ret.refund_amount)}
									</span>
								</div>
							)}
							{ret.exchange_order_id && (
								<div className="sf-returns-meta-item">
									<span className="sf-returns-meta-label">
										{t.returns.exchangeOrderId}
									</span>
									<span className="sf-returns-meta-value sf-text-mono">
										{ret.exchange_order_id.slice(0, 8)}...
									</span>
								</div>
							)}
							<div className="sf-returns-meta-item">
								<span className="sf-returns-meta-label">
									{t.returns.reasonCategory}
								</span>
								<span className="sf-returns-meta-value">
									{reasonLabelMap[ret.reason] || ret.reason}
								</span>
							</div>
							{ret.return_delivery_company && (
								<div className="sf-returns-meta-item">
									<span className="sf-returns-meta-label">
										{t.returns.deliveryCompany}
									</span>
									<span className="sf-returns-meta-value">
										{ret.return_delivery_company}
									</span>
								</div>
							)}
							{ret.return_tracking_id && (
								<div className="sf-returns-meta-item">
									<span className="sf-returns-meta-label">
										{t.returns.trackingNumber}
									</span>
									<span className="sf-returns-meta-value sf-text-mono">
										{ret.return_tracking_id}
									</span>
								</div>
							)}
						</div>
					</div>

					{/* Customer & Original Order Details */}
					<div className="sf-card sf-p-lg">
						<h3
							className="sf-section-label"
							style={{ marginBlockEnd: "var(--space-4)" }}
						>
							{t.returns.customerAndOrder}
						</h3>
						<div className="sf-flex-col sf-gap-md">
							{/* Customer */}
							<div className="sf-flex sf-gap-sm sf-items-center">
								<div
									className="sf-icon-box-sm sf-icon-brand"
									style={{ borderRadius: "50%" }}
								>
									<User size={14} />
								</div>
								<div className="sf-flex-col">
									<span className="sf-font-semibold sf-text-sm">
										{ret.order?.customer?.name || "—"}
									</span>
									<span className="sf-text-xs sf-text-tertiary">
										{ret.order?.customer?.phone || "—"}
									</span>
								</div>
							</div>

							{/* Order Details Link */}
							<div className="sf-flex sf-gap-sm sf-items-center sf-divider-subtle sf-py-sm">
								<div
									className="sf-icon-box-sm sf-icon-success"
									style={{ borderRadius: "50%" }}
								>
									<ShoppingBag size={14} />
								</div>
								<div className="sf-flex-col">
									<span className="sf-font-semibold sf-text-sm">
										Order #{ret.order?.order_number}
									</span>
									<span className="sf-text-xs sf-text-tertiary">
										Total: {formatCurrency(ret.order?.total_price ?? 0)}
									</span>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</PageTransition>
	);
}
