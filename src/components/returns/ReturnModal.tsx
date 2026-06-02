"use client";
import { useToast } from "@/components/dashboard/ToastProvider";

import { useState, useEffect, useMemo } from "react";
import { X, Loader2, RotateCcw } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { createReturn } from "@/lib/data/returns-service";
import { getProducts } from "@/lib/data/service";
import type { ReturnReason, ReturnResolutionType, ReturnItem } from "@/types";

interface ReturnModalProps {
	order: {
		id: string;
		order_number: string;
		items?: Array<{
			product_name?: string;
			name?: string;
			quantity: number;
			unit_price?: number;
			price?: number;
			product_id?: string;
		}>;
		total_price: number;
	};
	onClose: () => void;
	onSuccess: (newReturn: Record<string, unknown>) => void;
}

export default function ReturnModal({
	order,
	onClose,
	onSuccess,
}: ReturnModalProps) {
	const { t: _t } = useI18n();
	const { toast } = useToast();
	const [loading, setLoading] = useState(false);
	const [products, setProducts] = useState<
		Array<{ id: string; name: string; price: number; sku?: string }>
	>([]);

	// Form states
	const [type, setType] = useState<"return" | "exchange" | "refund">("refund");
	const [reason, setReason] = useState<ReturnReason>("wrong_product");
	const [reasonDetails, setReasonDetails] = useState("");
	const [refundAmount, setRefundAmount] = useState(0);
	const [selectedItems, setSelectedItems] = useState<
		Record<
			string,
			{
				selected: boolean;
				qty: number;
				price: number;
				product_name: string;
				product_id: string;
			}
		>
	>({});

	// Initialize selected items from order items
	const orderItems = useMemo(() => order.items || [], [order.items]);

	useEffect(() => {
		// Fetch products catalog to ensure we match product_ids
		getProducts()
			.then((result) => setProducts(result.data || []))
			.catch(() => {});

		// Pre-populate items selection state
		const initialSelection: typeof selectedItems = {};
		orderItems.forEach((item, idx) => {
			const name = item.product_name || item.name || `Item ${idx + 1}`;
			const price = item.unit_price ?? item.price ?? 0;
			const key = `${name}-${idx}`;
			initialSelection[key] = {
				selected: true, // Default to all selected for return
				qty: item.quantity,
				price,
				product_name: name,
				product_id: item.product_id || "",
			};
		});
		setSelectedItems(initialSelection);
	}, [orderItems]);

	// Recalculate default refund amount when selections or quantities change
	useEffect(() => {
		let sum = 0;
		Object.values(selectedItems).forEach((sel) => {
			if (sel.selected) {
				sum += sel.qty * sel.price;
			}
		});
		setRefundAmount(sum);
	}, [selectedItems]);

	const handleToggleItem = (key: string) => {
		setSelectedItems((prev) => {
			const current = prev[key];
			return {
				...prev,
				[key]: {
					...current,
					selected: !current.selected,
				},
			};
		});
	};

	const handleQtyChange = (key: string, maxQty: number, val: number) => {
		const safeQty = Math.max(1, Math.min(maxQty, val));
		setSelectedItems((prev) => ({
			...prev,
			[key]: {
				...prev[key],
				qty: safeQty,
			},
		}));
	};

	const handleSubmit = async () => {
		const activeItems = Object.values(selectedItems)
			.filter((sel) => sel.selected)
			.map((sel) => {
				// Try to find correct product_id from catalog if missing
				let matchedId = sel.product_id;
				if (!matchedId) {
					const matchedProd = products.find((p) => p.name === sel.product_name);
					matchedId = matchedProd?.id || "00000000-0000-0000-0000-000000000000";
				}

				const returnItem: ReturnItem = {
					product_id: matchedId,
					product_name: sel.product_name,
					quantity: sel.qty,
					price: sel.price,
				};
				return returnItem;
			});

		if (activeItems.length === 0) {
			toast({
				type: "error",
				title: "Please select at least one item to return.",
			});
			return;
		}

		setLoading(true);
		try {
			// Map return resolution type
			let resolutionType: ReturnResolutionType = "refund";
			if (type === "exchange") resolutionType = "exchange";
			if (type === "return") resolutionType = "credit";

			const newReturn = await createReturn({
				orderId: order.id,
				type,
				reason,
				reason_details: reasonDetails,
				resolution_type: resolutionType,
				refund_amount: type === "refund" ? refundAmount : 0,
				items: activeItems,
			});

			onSuccess(newReturn);
			onClose();
		} catch (e: unknown) {
			toast({
				type: "error",
				title:
					e instanceof Error ? e.message : "Failed to create return request",
			});
		} finally {
			setLoading(false);
		}
	};

	const reasonsList: { value: ReturnReason; label: string }[] = [
		{ value: "wrong_product", label: "Wrong Product Received" },
		{ value: "damaged", label: "Damaged / Broken" },
		{ value: "changed_mind", label: "Changed Mind" },
		{ value: "not_as_described", label: "Not as Described" },
		{ value: "wrong_size", label: "Wrong Size" },
		{ value: "defective", label: "Defective / Malfunctioning" },
		{ value: "late_delivery", label: "Late Delivery" },
		{ value: "other", label: "Other" },
	];

	return (
		<div className="sf-modal-backdrop" onClick={onClose}>
			<div
				className="sf-modal sf-orders-modal"
				onClick={(e) => e.stopPropagation()}
			>
				<div className="sf-orders-modal__header">
					<h2
						className="sf-orders-modal__title"
						style={{ display: "flex", alignItems: "center", gap: 8 }}
					>
						<RotateCcw size={18} className="sf-text-brand" />
						Request Return / Exchange
					</h2>
					<button onClick={onClose} className="sf-orders-modal__close">
						<X size={20} />
					</button>
				</div>

				<div className="sf-flex-col sf-gap-md sf-py-sm">
					<p className="sf-section-label" style={{ margin: 0 }}>
						Order #{order.order_number}
					</p>

					{/* Return Type Select */}
					<div className="sf-grid-2">
						<div>
							<label className="sf-label">Resolution / Type</label>
							<select
								className="sf-input sf-input--native-select"
								value={type}
								onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
									setType(e.target.value as "return" | "exchange" | "refund")
								}
							>
								<option value="refund">Refund (Cash back)</option>
								<option value="exchange">Exchange (New Order)</option>
								<option value="return">Store Credit</option>
							</select>
						</div>

						<div>
							<label className="sf-label">Reason</label>
							<select
								className="sf-input sf-input--native-select"
								value={reason}
								onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
									setReason(e.target.value as ReturnReason)
								}
							>
								{reasonsList.map((r) => (
									<option key={r.value} value={r.value}>
										{r.label}
									</option>
								))}
							</select>
						</div>
					</div>

					{/* Items Selector */}
					<div>
						<label className="sf-label">Select Items for Return</label>
						<div className="sf-return-modal-items">
							{orderItems.map((item, idx) => {
								const name =
									item.product_name || item.name || `Item ${idx + 1}`;
								const key = `${name}-${idx}`;
								const selection = selectedItems[key] || {
									selected: false,
									qty: 1,
								};

								return (
									<div
										key={key}
										className={`sf-return-modal-item-checkbox ${selection.selected ? "is-selected" : ""}`}
										onClick={() => handleToggleItem(key)}
									>
										<input
											type="checkbox"
											checked={selection.selected}
											onChange={() => {}} // handled by click of parent wrapper
											onClick={(e) => e.stopPropagation()}
										/>
										<div style={{ display: "flex", flexDirection: "column" }}>
											<span className="sf-return-item-name">{name}</span>
											<span className="sf-return-item-qty">
												Max Qty: {item.quantity} |{" "}
												{item.unit_price ?? item.price} DA
											</span>
										</div>

										{selection.selected && (
											<input
												type="number"
												min="1"
												max={item.quantity}
												value={selection.qty}
												className="sf-input sf-return-modal-item-qty-input"
												onClick={(e) => e.stopPropagation()}
												onChange={(e) =>
													handleQtyChange(
														key,
														item.quantity,
														Number(e.target.value),
													)
												}
											/>
										)}
									</div>
								);
							})}
						</div>
					</div>

					{/* Refund Amount (only visible if refund type is chosen) */}
					{type === "refund" && (
						<div>
							<label className="sf-label">Refund Amount (DA)</label>
							<input
								type="number"
								min="0"
								className="sf-input"
								value={refundAmount}
								onChange={(e) => setRefundAmount(Number(e.target.value))}
							/>
						</div>
					)}

					{/* Reason Details */}
					<div>
						<label className="sf-label">Additional Reason Details</label>
						<textarea
							className="sf-textarea"
							rows={3}
							placeholder="Provide exact details (e.g. wrong size sent, customer claims defect...)"
							value={reasonDetails}
							onChange={(e) => setReasonDetails(e.target.value)}
						/>
					</div>

					{/* Submit Button */}
					<button
						className="sf-btn sf-btn-primary sf-orders-modal__submit"
						disabled={loading}
						onClick={handleSubmit}
						style={{ marginTop: 8 }}
					>
						{loading ? (
							<>
								<Loader2 size={16} className="sf-animate-spin" />
								Processing Return...
							</>
						) : (
							<>
								<RotateCcw size={16} />
								Create Return Request
							</>
						)}
					</button>
				</div>
			</div>
		</div>
	);
}
