"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
	Receipt,
	Plus,
	Trash2,

	Loader2,

	ArrowLeft,
	ArrowRight,

	X,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useLayout } from "@/components/providers/Providers";
import { PageTransition, StaggerContainer } from "@/components/ui/motion";
import { SkeletonTable } from "@/components/ui/Skeleton";
import type { Expense } from "@/types";
import { ExpenseForm } from "@/components/accounting/ExpenseForm";
import { useToast } from "@/components/dashboard/ToastProvider";

const CATEGORIES = [
	{
		value: "all",
		labelEn: "All Categories",
		labelAr: "كل الفئات",
		labelFr: "Toutes les catégories",
	},
	{
		value: "ads",
		labelEn: "Advertising (Ads)",
		labelAr: "الإعلانات",
		labelFr: "Publicité (Ads)",
	},
	{
		value: "packaging",
		labelEn: "Packaging Supplies",
		labelAr: "التغليف",
		labelFr: "Emballage",
	},
	{
		value: "delivery_fees",
		labelEn: "Delivery Fees",
		labelAr: "رسوم التوصيل",
		labelFr: "Frais de livraison",
	},
	{
		value: "returns",
		labelEn: "Return Losses",
		labelAr: "خسائر المرتجعات",
		labelFr: "Pertes de retour",
	},
	{
		value: "supplies",
		labelEn: "Office/Store Supplies",
		labelAr: "لوازم ومعدات",
		labelFr: "Fournitures",
	},
	{
		value: "salary",
		labelEn: "Salaries & Wages",
		labelAr: "الرواتب والأجور",
		labelFr: "Salaires",
	},
	{
		value: "rent",
		labelEn: "Office/Warehouse Rent",
		labelAr: "الإيجار",
		labelFr: "Loyer",
	},
	{
		value: "other",
		labelEn: "Other Expenses",
		labelAr: "مصاريف أخرى",
		labelFr: "Autre",
	},
];

export default function ExpensesPage() {
	const { locale, formatCurrency, t } = useI18n();
	const { isMobile } = useLayout();
	const { toast } = useToast();

	const [expenses, setExpenses] = useState<Expense[]>([]);
	const [loading, setLoading] = useState(true);
	const [categoryFilter, setCategoryFilter] = useState("all");
	const [startDate, setStartDate] = useState("");
	const [endDate, setEndDate] = useState("");
	const [page, setPage] = useState(0);
	const [_totalCount, setTotalCount] = useState(0);
	const [hasMore, setHasMore] = useState(true);
	const [isModalOpen, setIsModalOpen] = useState(false);
	const [deletingId, setDeletingId] = useState<string | null>(null);

	const isAr = locale === "ar";
	const isFr = locale === "fr";
	const PAGE_SIZE = 20;

	// Translation dictionary
	const dict = {
		title: isAr
			? "سجل المصاريف"
			: isFr
				? "Registre des Dépenses"
				: "Expense Registry",
		subtitle: isAr
			? "إدارة وتصنيف وتتبع جميع نفقات وتكاليف متجرك"
			: isFr
				? "Gérez, catégorisez et suivez toutes les dépenses de votre boutique"
				: "Manage, categorize, and track all store expenditures",
		addExpense: isAr
			? "إضافة مصاريف"
			: isFr
				? "Ajouter une dépense"
				: "Add Expense",
		backToDashboard: isAr
			? "العودة للوحة التحكم"
			: isFr
				? "Retour au tableau"
				: "Back to dashboard",
		category: t.common.category,
		amount: t.common.amount,
		description: t.common.description,
		date: t.common.date,
		actions: t.common.actions,
		noExpenses: isAr
			? "لا توجد مصاريف مطابقة للبحث"
			: isFr
				? "Aucune dépense trouvée"
				: "No expenses match the filter",
		deleteConfirm: isAr
			? "هل أنت متأكد من حذف هذه المصاريف؟"
			: isFr
				? "Voulez-vous supprimer cette dépense ?"
				: "Are you sure you want to delete this expense?",
		deletedMsg: isAr
			? "تم حذف المصاريف بنجاح"
			: isFr
				? "Dépense supprimée"
				: "Expense deleted successfully",
		deleteError: isAr
			? "فشل حذف المصاريف"
			: isFr
				? "Échec de la suppression"
				: "Failed to delete expense",
		loadMore: t.common.loadMore,
		filter: t.expenses.filter,
		startDate: t.expenses.startDate,
		endDate: t.expenses.endDate,
	};

	const loadData = useCallback(
		async (reset = false) => {
			try {
				setLoading(true);
				const currentPage = reset ? 0 : page;
				const offset = currentPage * PAGE_SIZE;

				let url = `/api/expenses?limit=${PAGE_SIZE}&offset=${offset}&category=${categoryFilter}`;
				if (startDate) url += `&startDate=${startDate}`;
				if (endDate) url += `&endDate=${endDate}`;

				const res = await fetch(url);
				if (!res.ok) throw new Error("Failed to fetch expenses");
				const data = await res.json();

				if (reset || currentPage === 0) {
					setExpenses(data.expenses || []);
				} else {
					setExpenses((prev) => [...prev, ...(data.expenses || [])]);
				}

				setTotalCount(data.total || 0);
				setHasMore((data.expenses || []).length === PAGE_SIZE);
    } catch {

				toast({
					type: "error",
					title: t.expenses.loadFailed,
				});
			} finally {
				setLoading(false);
			}
		},
		[categoryFilter, startDate, endDate, page, isAr, toast],
	);

	useEffect(() => {
		loadData(true);
	}, [categoryFilter, startDate, endDate, loadData]);

	useEffect(() => {
		if (page > 0) {
			loadData(false);
		}
	}, [page, loadData]);

	const handleLoadMore = () => {
		setPage((p) => p + 1);
	};

	const handleDelete = async (id: string) => {
		if (!window.confirm(dict.deleteConfirm)) return;

		setDeletingId(id);
		try {
			const res = await fetch(`/api/expenses/${id}`, { method: "DELETE" });
			if (!res.ok) throw new Error("Delete failed");

			toast({ type: "success", title: dict.deletedMsg });
			setExpenses((prev) => prev.filter((exp) => exp.id !== id));
			setTotalCount((c) => c - 1);
    } catch {

			toast({ type: "error", title: dict.deleteError });
		} finally {
			setDeletingId(null);
		}
	};

	return (
		<PageTransition>
			<div
				className="sf-accounting-layout"
				style={{ direction: isAr ? "rtl" : "ltr" }}
			>
				{/* Header */}
				<div
					style={{
						display: "flex",
						flexDirection: isMobile ? "column" : "row",
						justifyContent: "space-between",
						alignItems: isMobile ? "flex-start" : "center",
						gap: 16,
					}}
				>
					<div>
						<div
							style={{
								display: "flex",
								alignItems: "center",
								gap: 8,
								marginBottom: 4,
							}}
						>
							<Link
								href="/dashboard/accounting"
								style={{
									display: "flex",
									alignItems: "center",
									gap: 4,
									fontSize: 13,
									color: "var(--color-brand-500)",
									fontWeight: 600,
								}}
							>
								{isAr ? <ArrowRight size={14} /> : <ArrowLeft size={14} />}
								{dict.backToDashboard}
							</Link>
						</div>
						<h1
							className="sf-page-title"
							style={{ margin: 0, fontSize: 24, fontWeight: 800 }}
						>
							{dict.title}
						</h1>
						<p
							style={{
								color: "var(--color-content-tertiary)",
								fontSize: 14,
								margin: "4px 0 0 0",
							}}
						>
							{dict.subtitle}
						</p>
					</div>

					<button
						onClick={() => setIsModalOpen(true)}
						className="sf-btn sf-btn-primary"
						style={{ display: "flex", alignItems: "center", gap: 8 }}
					>
						<Plus size={16} />
						{dict.addExpense}
					</button>
				</div>

				{/* Filters Panel */}
				<div
					className="sf-card"
					style={{
						display: "flex",
						flexWrap: "wrap",
						gap: 16,
						padding: "var(--space-4)",
						alignItems: "flex-end",
					}}
				>
					{/* Category filter */}
					<div
						style={{
							display: "flex",
							flexDirection: "column",
							gap: 6,
							flex: "1 1 200px",
						}}
					>
						<label
							style={{
								fontSize: 12,
								fontWeight: 600,
								color: "var(--color-content-secondary)",
							}}
						>
							{dict.category}
						</label>
						<select
							value={categoryFilter}
							onChange={(e) => {
								setCategoryFilter(e.target.value);
								setPage(0);
							}}
							style={{
								padding: "8px 12px",
								borderRadius: 8,
								border: "1px solid var(--color-line-secondary)",
								background: "var(--color-surface-tertiary)",
								fontSize: 14,
								color: "var(--color-content-primary)",
							}}
						>
							{CATEGORIES.map((cat) => (
								<option key={cat.value} value={cat.value}>
									{isAr ? cat.labelAr : isFr ? cat.labelFr : cat.labelEn}
								</option>
							))}
						</select>
					</div>

					{/* Start Date */}
					<div
						style={{
							display: "flex",
							flexDirection: "column",
							gap: 6,
							flex: "1 1 150px",
						}}
					>
						<label
							style={{
								fontSize: 12,
								fontWeight: 600,
								color: "var(--color-content-secondary)",
							}}
						>
							{dict.startDate}
						</label>
						<input
							type="date"
							value={startDate}
							onChange={(e) => {
								setStartDate(e.target.value);
								setPage(0);
							}}
							style={{
								padding: "8px 12px",
								borderRadius: 8,
								border: "1px solid var(--color-line-secondary)",
								background: "var(--color-surface-tertiary)",
								fontSize: 14,
								color: "var(--color-content-primary)",
								fontFamily: "inherit",
							}}
						/>
					</div>

					{/* End Date */}
					<div
						style={{
							display: "flex",
							flexDirection: "column",
							gap: 6,
							flex: "1 1 150px",
						}}
					>
						<label
							style={{
								fontSize: 12,
								fontWeight: 600,
								color: "var(--color-content-secondary)",
							}}
						>
							{dict.endDate}
						</label>
						<input
							type="date"
							value={endDate}
							onChange={(e) => {
								setEndDate(e.target.value);
								setPage(0);
							}}
							style={{
								padding: "8px 12px",
								borderRadius: 8,
								border: "1px solid var(--color-line-secondary)",
								background: "var(--color-surface-tertiary)",
								fontSize: 14,
								color: "var(--color-content-primary)",
								fontFamily: "inherit",
							}}
						/>
					</div>
				</div>

				{/* Expenses List */}
				{loading && expenses.length === 0 ? (
					<SkeletonTable rows={10} />
				) : (
					<StaggerContainer>
						<div className="sf-card" style={{ padding: 0, overflow: "hidden" }}>
							<div style={{ overflowX: "auto" }}>
								<table className="sf-table">
									<thead>
										<tr>
											<th style={{ textAlign: isAr ? "right" : "left" }}>
												{dict.description}
											</th>
											<th style={{ textAlign: "center" }}>{dict.category}</th>
											<th style={{ textAlign: "center" }}>{dict.date}</th>
											<th style={{ textAlign: isAr ? "left" : "right" }}>
												{dict.amount}
											</th>
											<th style={{ textAlign: "center", width: 80 }}>
												{dict.actions}
											</th>
										</tr>
									</thead>
									<tbody>
										{expenses.length === 0 ? (
											<tr>
												<td
													colSpan={5}
													style={{
														textAlign: "center",
														padding: "48px 0",
														color: "var(--color-content-tertiary)",
													}}
												>
													<Receipt
														size={32}
														style={{
															opacity: 0.3,
															marginBottom: 8,
															marginInline: "auto",
														}}
													/>
													{dict.noExpenses}
												</td>
											</tr>
										) : (
											expenses.map((exp) => (
												<tr key={exp.id}>
													<td style={{ fontWeight: 600 }}>
														{exp.description ||
															t.accounting.generalExpense}
													</td>
													<td style={{ textAlign: "center" }}>
														<span
															className={`sf-badge sf-badge-expense-${exp.category}`}
															style={{
																textTransform: "capitalize",
																fontSize: 11,
															}}
														>
															{exp.category}
														</span>
													</td>
													<td
														style={{
															textAlign: "center",
															color: "var(--color-content-secondary)",
															fontSize: 13,
														}}
													>
														{exp.expense_date}
													</td>
													<td
														style={{
															textAlign: isAr ? "left" : "right",
															fontWeight: 700,
															color: "var(--color-danger-400)",
															fontSize: 15,
														}}
													>
														-{formatCurrency(exp.amount)}
													</td>
													<td style={{ textAlign: "center" }}>
														<button
															disabled={deletingId === exp.id}
															onClick={() => handleDelete(exp.id)}
															style={{
																background: "none",
																border: "none",
																color: "var(--color-danger-400)",
																cursor: "pointer",
																padding: 6,
																borderRadius: 6,
																display: "inline-flex",
																alignItems: "center",
																justifyContent: "center",
															}}
															className="sf-btn-hover-danger"
															title={dict.actions}
														>
															{deletingId === exp.id ? (
																<Loader2 className="animate-spin" size={16} />
															) : (
																<Trash2 size={16} />
															)}
														</button>
													</td>
												</tr>
											))
										)}
									</tbody>
								</table>
							</div>

							{/* Load More Button */}
							{hasMore && (
								<div
									style={{
										padding: "var(--space-4)",
										display: "flex",
										justifyContent: "center",
										borderTop: "1px solid var(--color-line-secondary)",
									}}
								>
									<button
										onClick={handleLoadMore}
										disabled={loading}
										className="sf-btn sf-btn-ghost"
										style={{
											minWidth: 120,
											display: "flex",
											alignItems: "center",
											justifyContent: "center",
											gap: 8,
										}}
									>
										{loading && <Loader2 className="animate-spin" size={14} />}
										{dict.loadMore}
									</button>
								</div>
							)}
						</div>
					</StaggerContainer>
				)}

				{/* Modal Backdrop and Modal Box */}
				{isModalOpen && (
					<div
						className="sf-sidebar-backdrop mobile-open"
						style={{
							zIndex: 100,
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
						}}
					>
						<div
							className="sf-card stagger-item"
							style={{
								width: "90%",
								maxWidth: 450,
								padding: "24px",
								position: "relative",
								maxHeight: "90vh",
								overflowY: "auto",
								boxShadow: "var(--shadow-lg)",
							}}
						>
							{/* Close Button */}
							<button
								onClick={() => setIsModalOpen(false)}
								style={{
									position: "absolute",
									top: 16,
									[isAr ? "left" : "right"]: 16,
									background: "none",
									border: "none",
									color: "var(--color-content-tertiary)",
									cursor: "pointer",
									padding: 4,
								}}
							>
								<X size={18} />
							</button>

							<ExpenseForm
								onSuccess={() => {
									setIsModalOpen(false);
									loadData(true);
								}}
								onCancel={() => setIsModalOpen(false)}
							/>
						</div>
					</div>
				)}
			</div>
		</PageTransition>
	);
}
