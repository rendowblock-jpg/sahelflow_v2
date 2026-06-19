"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Search, Package, Trash2, Edit, X, Layers, AlertTriangle, DollarSign } from "lucide-react";
import {
	getProducts,
	createProduct,
	updateProduct,
	deleteProduct,
	getCategories,
	createCategory,
	updateCategory,
	deleteCategory,
	uploadProductImage,
} from "@/lib/data/service";
import { useI18n } from "@/lib/i18n";
import { useLayout } from "@/components/providers/Providers";
import { useToast } from "@/components/dashboard/ToastProvider";
import { usePermissions } from "@/hooks/usePermissions";
import type { Product, ProductVariant, Category } from "@/types/database";
import ImageUploader from "@/components/dashboard/ImageUploader";
import { SkeletonCard, SkeletonTable } from "@/components/ui/Skeleton";
import { PageTransition, StaggerContainer, StaggerItem } from "@/components/ui/motion";
import ImportModal from "@/components/products/ImportModal";
import { AnimatedStatCard } from "@/components/ui/AnimatedStatCard";

interface VariantDraft {
	id: string;
	name: string;
	optionsText: string;
}

export default function ProductsPage() {
	const { t, formatCurrency } = useI18n();
	const { isMobile } = useLayout();
	const { toast } = useToast();
	const { hasPermission } = usePermissions();
	const [products, setProducts] = useState<Product[]>([]);
	const [loading, setLoading] = useState(true);
	const [search, setSearch] = useState("");
	const [showForm, setShowForm] = useState(false);
	const [editing, setEditing] = useState<Product | null>(null);
	const [saving, setSaving] = useState(false);
	const [formData, setFormData] = useState({
		name: "",
		description: "",
		price: 0,
		cost_price: 0,
		stock: 0,
		sku: "",
		category_id: "" as string,
		image_url: "" as string,
	});
	const [variantDrafts, setVariantDrafts] = useState<VariantDraft[]>([]);
	const [categories, setCategories] = useState<Category[]>([]);
	const [showCatForm, setShowCatForm] = useState(false);
	const [editingCat, setEditingCat] = useState<Category | null>(null);
	const [catFormData, setCatFormData] = useState({ name: "", slug: "" });
	const [deleteTarget, setDeleteTarget] = useState<{
		id: string;
		name: string;
		type: "product" | "category";
	} | null>(null);
	const [showImport, setShowImport] = useState(false);

	const loadData = useCallback(async () => {
		try {
			setLoading(true);
			let p: Product[] = [];
			let c: Category[] = [];
			try {
				const result = await getProducts();
				p = result.data as Product[];
			} catch (prodErr) {
				toast({ type: "error", title: (prodErr as Error).message });
			}
			try {
				c = (await getCategories()) as Category[];
			} catch {
				toast({
					type: "error",
					title: t.products?.loadFailed || t.common.error,
				});
			}
			setProducts(p);
			setCategories(c);
		} finally {
			setLoading(false);
		}
	}, [toast, t.products?.loadFailed, t.common.error]);

	useEffect(() => {
		loadData();
	}, [loadData]);

	const filtered = products.filter(
		(p) =>
			!search ||
			p.name?.toLowerCase()?.includes(search.toLowerCase()) ||
			p.sku?.toLowerCase()?.includes(search.toLowerCase()),
	);

	const totalStock = products.reduce((s, p) => s + (p.stock || 0), 0);
	const inventoryValue = products.reduce(
		(s, p) => s + (p.price || 0) * (p.stock || 0),
		0,
	);
	const lowStockCount = products.filter(
		(p) => (p.stock || 0) <= 5 && (p.stock || 0) > 0,
	).length;

	function openEdit(p: Product) {
		setEditing(p);
		setFormData({
			name: p.name || "",
			description: p.description || "",
			price: p.price || 0,
			cost_price: p.cost_price || 0,
			stock: p.stock || 0,
			sku: p.sku || "",
			category_id: p.category_id || "",
			image_url: p.image_url || "",
		});
		const existingVariants = (p.variants || []) as ProductVariant[];
		setVariantDrafts(
			existingVariants.map((v) => ({
				id: v.id,
				name: v.name,
				optionsText: v.options.join(", "),
			})),
		);
		setShowForm(true);
	}

	function openNew() {
		setEditing(null);
		setFormData({
			name: "",
			description: "",
			price: 0,
			cost_price: 0,
			stock: 0,
			sku: "",
			category_id: "",
			image_url: "",
		});
		setVariantDrafts([]);
		setShowForm(true);
	}

	async function handleSave() {
		if (!formData.name) return;
		setSaving(true);
		try {
			const variants: ProductVariant[] = variantDrafts
				.filter((v) => v.name.trim() && v.optionsText.trim())
				.map((v) => ({
					id: v.id,
					name: v.name.trim(),
					options: v.optionsText
						.split(",")
						.map((o) => o.trim())
						.filter(Boolean),
				}));

			if (editing) {
				await updateProduct(editing.id, {
					...formData,
					category_id: formData.category_id || null,
					image_url: formData.image_url || undefined,
					variants,
				});
			} else {
				await createProduct({
					...formData,
					category_id: formData.category_id || null,
					image_url: formData.image_url || undefined,
					variants,
				});
			}
			await loadData();
			setShowForm(false);
		} catch (e) {
			toast({ type: "error", title: (e as Error).message });
		} finally {
			setSaving(false);
		}
	}

	async function handleDelete(id: string) {
		const product = products.find((p) => p.id === id);
		setDeleteTarget({ id, name: product?.name || id, type: "product" });
	}

	function slugify(text: string) {
		return text
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/(^-|-$)/g, "");
	}

	function openNewCat() {
		setEditingCat(null);
		setCatFormData({ name: "", slug: "" });
		setShowCatForm(true);
	}

	function openEditCat(cat: Category) {
		setEditingCat(cat);
		setCatFormData({ name: cat.name, slug: cat.slug });
		setShowCatForm(true);
	}

	async function handleSaveCat() {
		if (!catFormData.name.trim()) return;
		const slug = catFormData.slug.trim() || slugify(catFormData.name);
		try {
			if (editingCat) {
				await updateCategory(editingCat.id, {
					name: catFormData.name.trim(),
					slug,
				});
			} else {
				const maxOrder = categories.reduce(
					(max, c) => Math.max(max, c.sort_order),
					0,
				);
				await createCategory({
					name: catFormData.name.trim(),
					slug,
					sort_order: maxOrder + 1,
				});
			}
			const c = await getCategories();
			setCategories(c as Category[]);
			setShowCatForm(false);
		} catch (e) {
			toast({ type: "error", title: (e as Error).message });
		}
	}

	async function handleDeleteCat(id: string) {
		const cat = categories.find((c) => c.id === id);
		setDeleteTarget({ id, name: cat?.name || id, type: "category" });
	}

	if (loading) {
		return (
			<div className="sf-flex-col sf-gap-xl sf-animate-fade">
				<div>
					<div className="sf-skeleton sf-skeleton-title" />
					<div
						className="sf-skeleton"
						style={{ width: 100, height: 14, borderRadius: "var(--radius-sm)" }}
					/>
				</div>
				<div className="sf-stats-grid">
					{Array.from({ length: 3 }).map((_, i) => (
						<SkeletonCard key={i} />
					))}
				</div>
				<SkeletonTable rows={5} />
			</div>
		);
	}

	return (
		<PageTransition className="sf-flex-col sf-gap-xl">
			<div className="sf-page-header">
				<div>
					<h1 className="sf-page-title">{t.products.title}</h1>
					<p className="sf-page-subtitle">
						{products.length} {t.products.title.toLowerCase()}
					</p>
				</div>
				<div className="sf-flex sf-gap-sm sf-items-center">
					{hasPermission("products:manage") && (
						<>
							<button
								className="sf-btn sf-btn-ghost"
								onClick={() => setShowImport(true)}
								style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
							>
								<Layers size={16} /> {t.imports.title}
							</button>
							<button className="sf-btn sf-btn-primary" onClick={openNew}>
								<Plus size={16} /> {t.products.addProduct}
							</button>
						</>
					)}
				</div>
			</div>

			{/* Stats */}
			<StaggerContainer className="sf-grid-3" stagger={0.05}>
				{[
					{
						label: t.products.totalStock,
						value: String(totalStock),
						icon: Package,
						variant: "brand" as const,
						pct: 100,
					},
					{
						label: t.products.inventoryValue,
						value: formatCurrency(inventoryValue),
						icon: DollarSign,
						variant: "success" as const,
						pct: 100,
					},
					{
						label: t.products.lowStock,
						value: String(lowStockCount),
						icon: AlertTriangle,
						variant: lowStockCount > 0 ? ("danger" as const) : ("brand" as const),
						pct: lowStockCount > 0 ? 30 : 100,
					},
				].map((s, i) => (
					<StaggerItem key={s.label}>
						<AnimatedStatCard
							label={s.label}
							value={s.value}
							variant={s.variant}
							icon={s.icon}
							delay={i * 80}
							sparklinePercent={s.pct}
						/>
					</StaggerItem>
				))}
			</StaggerContainer>

			{/* Search */}
			<div className="sf-search-wrap">
				<Search size={16} className="sf-search-icon" />
				<input
					className="sf-input sf-search-input"
					placeholder={t.products.searchProducts}
					value={search}
					onChange={(e) => setSearch(e.target.value)}
				/>
			</div>

			{/* Empty */}
			{products.length === 0 ? (
				<div className="sf-card sf-flex-center sf-flex-col sf-empty-xl">
					<Package size={48} className="sf-empty-icon-lg" />
					<h3 className="sf-empty-title">{t.products.noProductsTitle}</h3>
					<p className="sf-empty-desc">{t.products.noProductsDesc}</p>
					{hasPermission("products:manage") && (
						<button className="sf-btn sf-btn-primary" onClick={openNew}>
							<Plus size={16} /> {t.products.addFirstProduct}
						</button>
					)}
				</div>
			) : isMobile ? (
				<div className="sf-flex-col sf-gap-md">
					{filtered.map((p) => {
						const stockStatus =
							(p.stock ?? 0) <= 0 ? "danger" : (p.stock ?? 0) <= 5 ? "warning" : "success";
						return (
							<div
								key={p.id}
								className="sf-card sf-card-hover sf-product-card-padded"
							>
								<div className="sf-flex-between sf-mb-xs">
									<span className="sf-name">{p.name}</span>
									<span className={`sf-badge sf-badge-${stockStatus}`}>
										{(p.stock ?? 0) <= 0
											? t.products.out
											: (p.stock ?? 0) <= 5
												? `${t.products.low}: ${p.stock}`
												: p.stock}
									</span>
								</div>
								{p.sku && <p className="sf-sku">{p.sku}</p>}
								<div className="sf-flex-between sf-mt-sm">
									<span className="sf-font-semibold">
										{formatCurrency(p.price)}
									</span>
									{hasPermission("products:manage") && (
										<div className="sf-flex-gap-xs">
											<button
												className="sf-btn sf-btn-ghost sf-btn-compress"
												onClick={() => openEdit(p)}
											>
												<Edit size={14} />
											</button>
											<button
												className="sf-btn sf-btn-danger sf-btn-compress"
												onClick={() => handleDelete(p.id)}
											>
												<Trash2 size={14} />
											</button>
										</div>
									)}
								</div>
							</div>
						);
					})}
				</div>
			) : (
				<div className="sf-card sf-card-p-0">
					<div className="sf-table-wrap">
						<table className="sf-table-aaa">
							<thead>
								<tr>
									<th>{t.products.product}</th>
									<th>{t.products.sku}</th>
									<th className="sf-text-end">{t.orders.price}</th>
									<th className="sf-text-end">{t.products.cost}</th>
									<th className="sf-text-center">{t.products.stock}</th>
									<th className="sf-text-end">{t.products.value}</th>
									{hasPermission("products:manage") && <th>{t.common.actions}</th>}
								</tr>
							</thead>
							<tbody>
								{filtered.map((p) => {
									const initials = p.name ? p.name[0].toUpperCase() : "P";
									return (
										<tr key={p.id}>
											<td>
												<div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
													<div className={`sf-avatar ${
														(p.stock ?? 0) <= 0 
															? "sf-avatar--teal" 
															: (p.stock ?? 0) <= 5 
																? "sf-avatar--orange" 
																: "sf-avatar--purple"
													}`}>
														{initials}
													</div>
													<span className="sf-font-medium">{p.name}</span>
												</div>
											</td>
											<td className="sf-td-mono">{p.sku || "—"}</td>
											<td className="sf-td-price sf-text-end sf-font-semibold sf-text-tabular">{formatCurrency(p.price)}</td>
											<td className="sf-td-num sf-text-end sf-text-tabular">
												{p.cost_price ? formatCurrency(p.cost_price) : "—"}
											</td>
											<td className="sf-text-center">
												<div className="sf-stock-bar" style={{ justifyContent: "center" }}>
													<div className="sf-stock-bar__track">
														<div
															className={`sf-stock-bar__fill ${
																(p.stock ?? 0) <= 0 
																	? "sf-stock-bar__fill--out" 
																	: (p.stock ?? 0) <= 5 
																		? "sf-stock-bar__fill--low" 
																		: "sf-stock-bar__fill--ok"
															}`}
															style={{ width: `${Math.min(100, ((p.stock ?? 0) / 20) * 100)}%` }}
														/>
													</div>
													<span style={{ fontSize: "12px", minWidth: "24px" }} className="sf-text-tabular">
														{p.stock}
													</span>
												</div>
											</td>
											<td className="sf-td-num sf-text-end sf-font-semibold sf-text-tabular">
												{formatCurrency(p.price * (p.stock || 0))}
											</td>
											{hasPermission("products:manage") && (
												<td>
													<div className="sf-flex-gap-xs">
														<button
															className="sf-btn sf-btn-ghost sf-btn-compress-sm"
															onClick={() => openEdit(p)}
														>
															<Edit size={14} />
														</button>
														<button
															className="sf-btn sf-btn-danger sf-btn-compress-sm"
															onClick={() => handleDelete(p.id)}
														>
															<Trash2 size={14} />
														</button>
													</div>
												</td>
											)}
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				</div>
			)}

			{/* Create/Edit Modal */}
			{showForm && (
				<div className="sf-modal-backdrop" onClick={() => setShowForm(false)}>
					<div
						className="sf-modal sf-modal-md"
						onClick={(e) => e.stopPropagation()}
						style={{ maxWidth: "820px" }}
					>
						<div className="sf-flex-between sf-modal-header">
							<h2 className="sf-modal-title">
								{editing ? t.products.editProduct : t.products.newProduct}
							</h2>
							<button
								className="sf-btn-close"
								onClick={() => setShowForm(false)}
							>
								<X size={20} />
							</button>
						</div>
						<div className="sf-flex-col sf-gap-md">
							<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "20px" }}>
								{/* Left Column — Info */}
								<div className="sf-flex-col sf-gap-md">
									<div>
										<label className="sf-label">{t.products.productName}</label>
										<input
											className="sf-input"
											value={formData.name}
											onChange={(e) =>
												setFormData({ ...formData, name: e.target.value })
											}
										/>
									</div>
									<div>
										<label className="sf-label">{t.products.description}</label>
										<textarea
											className="sf-textarea"
											rows={4}
											value={formData.description}
											onChange={(e) =>
												setFormData({ ...formData, description: e.target.value })
											}
										/>
									</div>
									<div>
										<div className="sf-flex-between sf-mb-xs">
											<label className="sf-label sf-m-0">
												{t.products.category}
											</label>
											<button
												className="sf-btn sf-btn-ghost sf-btn-xs"
												onClick={openNewCat}
												type="button"
											>
												<Plus size={10} /> {t.categories.addCategory}
											</button>
										</div>
										<select
											className="sf-input"
											value={formData.category_id}
											onChange={(e) =>
												setFormData({ ...formData, category_id: e.target.value })
											}
										>
											<option value="">{t.products.noCategory}</option>
											{categories.map((c) => (
												<option key={c.id} value={c.id}>
													{c.name}
												</option>
											))}
										</select>
									</div>
								</div>

								{/* Right Column — Image & Pricing */}
								<div className="sf-flex-col sf-gap-md">
									<div>
										<label className="sf-label">Product Image</label>
										<ImageUploader
											value={formData.image_url}
											onChange={(url) => setFormData({ ...formData, image_url: url })}
											onUpload={uploadProductImage}
										/>
									</div>

									<div className="sf-grid-2 sf-product-grid-gap">
										<div>
											<label className="sf-label">{t.products.sellPrice}</label>
											<input
												className="sf-input"
												type="number"
												value={formData.price || ""}
												onChange={(e) =>
													setFormData({ ...formData, price: +e.target.value })
												}
											/>
										</div>
										<div>
											<label className="sf-label">{t.products.costPrice}</label>
											<input
												className="sf-input"
												type="number"
												value={formData.cost_price || ""}
												onChange={(e) =>
													setFormData({ ...formData, cost_price: +e.target.value })
												}
											/>
										</div>
										<div>
											<label className="sf-label">{t.products.stockQty}</label>
											<input
												className="sf-input"
												type="number"
												value={formData.stock || ""}
												onChange={(e) =>
													setFormData({ ...formData, stock: +e.target.value })
												}
											/>
										</div>
										<div>
											<label className="sf-label">{t.products.sku}</label>
											<input
												className="sf-input"
												value={formData.sku}
												onChange={(e) =>
													setFormData({ ...formData, sku: e.target.value })
												}
											/>
										</div>
									</div>
								</div>
							</div>

							<hr className="sf-divider" />

							<div>
								<div className="sf-flex-between sf-mb-md">
									<label className="sf-label sf-label-inline">
										<Layers size={14} /> {t.products.variantTitle}
									</label>
									<button
										className="sf-btn sf-btn-ghost sf-btn-sm"
										type="button"
										onClick={() =>
											setVariantDrafts((prev) => [
												...prev,
												{
													id: crypto.randomUUID(),
													name: "",
													optionsText: "",
												},
											])
										}
									>
										<Plus size={12} /> {t.products.addVariant}
									</button>
								</div>

								{variantDrafts.length === 0 && (
									<p className="sf-text-hint">{t.products.noVariants}</p>
								)}

								<div className="sf-flex-col sf-gap-sm">
									{variantDrafts.map((vd, idx) => (
										<div key={vd.id} className="sf-variant-card">
											<div className="sf-flex-between sf-mb-sm">
												<input
													className="sf-input sf-input-sm sf-input-grow sf-mr-sm"
													placeholder={t.products.variantNamePlaceholder}
													value={vd.name}
													onChange={(e) => {
														const updated = [...variantDrafts];
														updated[idx] = {
															...vd,
															name: e.target.value,
														};
														setVariantDrafts(updated);
													}}
												/>
												<button
													className="sf-btn-close-danger"
													type="button"
													onClick={() =>
														setVariantDrafts((prev) =>
															prev.filter((v) => v.id !== vd.id),
														)
													}
													aria-label={t.common.delete}
												>
													<Trash2 size={14} />
												</button>
											</div>
											<input
												className="sf-input sf-input-sm"
												placeholder={t.products.variantOptionsPlaceholder}
												value={vd.optionsText}
												onChange={(e) => {
													const updated = [...variantDrafts];
													updated[idx] = {
														...vd,
														optionsText: e.target.value,
													};
													setVariantDrafts(updated);
												}}
											/>
										</div>
									))}
								</div>
							</div>
							<button
								className="sf-btn sf-btn-primary sf-w-full"
								onClick={handleSave}
								disabled={saving}
							>
								{saving
									? t.products.saving
									: editing
										? t.products.updateProduct
										: t.common.create}
							</button>
						</div>
					</div>
				</div>
			)}

			{/* Category Management Modal */}
			{showCatForm && (
				<div
					className="sf-modal-backdrop"
					onClick={() => setShowCatForm(false)}
				>
					<div
						className="sf-modal sf-modal-sm"
						onClick={(e) => e.stopPropagation()}
					>
						<div className="sf-flex-between sf-modal-header">
							<h2 className="sf-modal-title">
								{editingCat
									? t.categories.editCategory
									: t.categories.addCategory}
							</h2>
							<button
								className="sf-btn-close"
								onClick={() => setShowCatForm(false)}
							>
								<X size={20} />
							</button>
						</div>
						<div className="sf-flex-col sf-gap-md">
							<div>
								<label className="sf-label">{t.categories.categoryName}</label>
								<input
									className="sf-input"
									value={catFormData.name}
									onChange={(e) =>
										setCatFormData({
											...catFormData,
											name: e.target.value,
											slug: editingCat
												? catFormData.slug
												: slugify(e.target.value),
										})
									}
								/>
							</div>
							<div>
								<label className="sf-label">{t.categories.categorySlug}</label>
								<input
									className="sf-input"
									value={catFormData.slug}
									onChange={(e) =>
										setCatFormData({
											...catFormData,
											slug: e.target.value,
										})
									}
								/>
							</div>

							{categories.length > 0 && (
								<div className="sf-border-top-pt-sm">
									<label className="sf-label">{t.categories.title}</label>
									<div className="sf-flex-col sf-gap-sm">
										{categories.map((cat) => (
											<div
												key={cat.id}
												className="sf-flex-between sf-list-item-muted"
											>
												<span className="sf-text-13">{cat.name}</span>
												<div className="sf-flex-gap-xs">
													<button
														className="sf-btn sf-btn-ghost sf-btn-xs"
														onClick={() => openEditCat(cat)}
													>
														<Edit size={12} />
													</button>
													<button
														className="sf-btn sf-btn-danger sf-btn-xs"
														onClick={() => handleDeleteCat(cat.id)}
													>
														<Trash2 size={12} />
													</button>
												</div>
											</div>
										))}
									</div>
								</div>
							)}

							<button
								className="sf-btn sf-btn-primary sf-w-full"
								onClick={handleSaveCat}
							>
								{editingCat ? t.common.update : t.common.create}
							</button>
						</div>
					</div>
				</div>
			)}

			{deleteTarget && (
				<div className="sf-modal-overlay" onClick={() => setDeleteTarget(null)}>
					<div
						className="sf-modal-confirm"
						onClick={(e) => e.stopPropagation()}
					>
						<h3 className="sf-modal-title-sm">{t.common.confirmDelete}</h3>
						<p className="sf-modal-desc">{t.common.deleteWarning}</p>
						<p className="sf-modal-target">{deleteTarget.name}</p>
						<div className="sf-modal-actions">
							<button
								className="sf-btn sf-btn-ghost"
								onClick={() => setDeleteTarget(null)}
							>
								{t.common.cancel}
							</button>
							<button
								className="sf-btn-danger"
								onClick={async () => {
									try {
										if (deleteTarget.type === "product") {
											await deleteProduct(deleteTarget.id);
											await loadData();
										} else {
											await deleteCategory(deleteTarget.id);
											const c = await getCategories();
											setCategories(c as Category[]);
										}
										toast({ type: "success", title: t.common.deleted });
									} catch (e) {
										toast({
											type: "error",
											title: (e as Error).message,
										});
									}
									setDeleteTarget(null);
								}}
							>
								{t.common.delete}
							</button>
						</div>
					</div>
				</div>
			)}
			{showImport && (
				<ImportModal
					onClose={() => setShowImport(false)}
					onImported={() => {
						setShowImport(false);
						loadData();
					}}
				/>
			)}
		</PageTransition>
	);
}
