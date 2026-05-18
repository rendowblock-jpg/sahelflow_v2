"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import {
  ShoppingCart,
  CheckCircle,
  Phone,
  MapPin,
  Package,
  Loader2,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { WILAYA_NAMES } from "@/lib/data/wilayas";
import "../form.css";

interface Product {
  id: string;
  name: string;
  price: number;
  stock: number;
  image_url: string | null;
  sku: string | null;
}

interface FormConfig {
  showPrices: boolean;
  requirePhone: boolean;
  showWilaya: boolean;
  showCommune: boolean;
  showAddress: boolean;
  showNotes: boolean;
  customFields: Array<{ label: string; required: boolean }>;
}

interface SellerInfo {
  business_name: string;
  slug: string;
  form_enabled: boolean;
  form_config: FormConfig;
  phone?: string;
}

export default function PublicOrderForm() {
  const params = useParams();
  const { t } = useI18n();
  const sellerSlug = params.sellerSlug as string;

  const [seller, setSeller] = useState<SellerInfo | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  // Form state
  const [cart, setCart] = useState<Record<string, number>>({});
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [wilaya, setWilaya] = useState("");
  const [commune, setCommune] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [customValues, setCustomValues] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch(`/api/form/seller-info?slug=${encodeURIComponent(sellerSlug)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else {
          setSeller(data.seller);
          setProducts(data.products || []);
        }
      })
      .catch(() => setError(t.publicForm.loadError))
      .finally(() => setLoading(false));
  }, [sellerSlug, t.publicForm.loadError]);

  function addToCart(productId: string) {
    const product = products.find((p) => p.id === productId);
    if (!product || product.stock === 0) return;
    setCart((prev) => {
      const currentQty = prev[productId] || 0;
      if (currentQty >= product.stock) return prev;
      return { ...prev, [productId]: currentQty + 1 };
    });
  }

  function removeFromCart(productId: string) {
    setCart((prev) => {
      const next = { ...prev };
      if (next[productId] > 1) next[productId]--;
      else delete next[productId];
      return next;
    });
  }

  const cartTotal = Object.entries(cart).reduce((sum, [pid, qty]) => {
    const p = products.find((x) => x.id === pid);
    return sum + (p?.price || 0) * qty;
  }, 0);

  const cartCount = Object.values(cart).reduce((a, b) => a + b, 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (cartCount === 0) {
      setError(t.publicForm.selectProductFirst);
      return;
    }
    if (
      seller?.form_config?.requirePhone &&
      !/^\+?[0-9]{8,12}$/.test(phone.replace(/\s/g, ""))
    ) {
      setError(t.publicForm.phoneInvalid);
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/form/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sellerSlug,
          customer: { name, phone, wilaya, commune, address },
          items: Object.entries(cart).map(([productId, quantity]) => {
            const p = products.find((x) => x.id === productId)!;
            return {
              product_id: productId,
              name: p.name,
              quantity,
              price: p.price,
            };
          }),
          notes,
          customFields: customValues,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t.publicForm.loadError);
      setSuccess(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="sf-form-loading">
        <Loader2 size={32} className="sf-form-spin" />
      </div>
    );
  }

  if (error && !seller) {
    return (
      <div className="sf-form-fatal">
        <h2 className="sf-form-fatal-title">{t.publicForm.error}</h2>
        <p className="sf-form-fatal-text">{error}</p>
      </div>
    );
  }

  if (success) {
    return (
      <div className="sf-form-success">
        <CheckCircle size={64} className="sf-form-success-icon" />
        <h2 className="sf-form-success-title">{t.publicForm.orderReceived}</h2>
        <p className="sf-form-success-desc">{t.publicForm.orderReceivedDesc}</p>
      </div>
    );
  }

  const config = seller?.form_config || {
    showPrices: true,
    requirePhone: true,
    showWilaya: true,
    showCommune: true,
    showAddress: true,
    showNotes: true,
    customFields: [],
  };

  return (
    <div className="sf-form-page">
      <header className="sf-form-header">
        <h1 className="sf-form-brand">
          <ShoppingCart size={22} />
          {seller?.business_name}
        </h1>
        <p className="sf-form-subtitle">{t.publicForm.subtitle}</p>
      </header>

      {/* Products */}
      <section>
        <h2 className="sf-form-section-title">
          <Package size={18} />
          {t.publicForm.products}
        </h2>
        <div className="sf-form-products">
          {products.length === 0 ? (
            <p className="sf-form-label">{t.publicForm.noProducts}</p>
          ) : (
            products.map((p) => {
              const qty = cart[p.id] || 0;
              return (
                <div key={p.id} className="sf-form-product">
                  <div className="sf-form-product-image">
                    {p.image_url ? (
                      <Image
                        src={p.image_url}
                        alt={p.name}
                        fill
                        sizes="56px"
                        style={{ objectFit: "cover" }}
                      />
                    ) : (
                      <div className="sf-form-product-image-fallback">
                        <Package size={20} />
                      </div>
                    )}
                  </div>
                  <div className="sf-form-product-info">
                    <div className="sf-form-product-name">{p.name}</div>
                    {config.showPrices && (
                      <div className="sf-form-product-price">
                        {p.price.toLocaleString("fr-DZ")} DA
                      </div>
                    )}
                    {p.sku && (
                      <div className="sf-form-product-sku">
                        {t.publicForm.sku}: {p.sku}
                      </div>
                    )}
                    {p.stock === 0 && (
                      <div
                        className="sf-form-product-sku"
                        style={{ color: "var(--danger, #ef4444)" }}
                      >
                        نفذت الكمية / Rupture de stock
                      </div>
                    )}
                  </div>
                  <div className="sf-form-product-qty">
                    {qty > 0 && (
                      <>
                        <button
                          className="sf-form-qty-btn"
                          onClick={() => removeFromCart(p.id)}
                          type="button"
                          aria-label={t.publicForm.removeItem || "-"}
                        >
                          −
                        </button>
                        <span className="sf-form-qty-value">{qty}</span>
                      </>
                    )}
                    <button
                      className="sf-form-qty-btn sf-form-qty-btn-add"
                      onClick={() => addToCart(p.id)}
                      type="button"
                      aria-label={t.publicForm.add}
                      disabled={p.stock === 0 || qty >= p.stock}
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Cart summary */}
      {cartCount > 0 && (
        <div className="sf-form-cart">
          <div className="sf-form-cart-info">
            <ShoppingCart size={18} />
            <span>
              {cartCount}{" "}
              {cartCount === 1 ? t.publicForm.item : t.publicForm.items}
            </span>
          </div>
          {config.showPrices && (
            <div className="sf-form-cart-total">
              {cartTotal.toLocaleString("fr-DZ")} DA
            </div>
          )}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="sf-form-fieldset">
        <h2 className="sf-form-section-title">
          <MapPin size={18} />
          {t.publicForm.deliveryInfo}
        </h2>

        <div className="sf-form-field">
          <label className="sf-form-label sf-form-label-required">
            {t.publicForm.fullName}
          </label>
          <input
            className="sf-form-input"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t.publicForm.fullNamePlaceholder}
          />
        </div>

        <div className="sf-form-field">
          <label
            className={`sf-form-label ${config.requirePhone ? "sf-form-label-required" : ""}`}
          >
            {t.publicForm.phone}
          </label>
          <div className="sf-form-input-wrap">
            <Phone size={16} className="sf-form-input-icon" />
            <input
              className="sf-form-input"
              required={config.requirePhone}
              value={phone}
              dir="ltr"
              onChange={(e) => setPhone(e.target.value)}
              placeholder={t.publicForm.phonePlaceholder}
            />
          </div>
        </div>

        {config.showWilaya && (
          <div className="sf-form-field">
            <label className="sf-form-label sf-form-label-required">
              {t.publicForm.wilaya}
            </label>
            <select
              className="sf-form-select"
              required
              value={wilaya}
              onChange={(e) => setWilaya(e.target.value)}
            >
              <option value="">{t.publicForm.selectWilaya}</option>
              {WILAYA_NAMES.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </div>
        )}

        {config.showCommune && (
          <div className="sf-form-field">
            <label className="sf-form-label sf-form-label-required">
              {t.publicForm.commune}
            </label>
            <input
              className="sf-form-input"
              required
              value={commune}
              onChange={(e) => setCommune(e.target.value)}
              placeholder={t.publicForm.communePlaceholder}
            />
          </div>
        )}

        {config.showAddress && (
          <div className="sf-form-field">
            <label className="sf-form-label">{t.publicForm.address}</label>
            <textarea
              className="sf-form-textarea"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={t.publicForm.addressPlaceholder}
              rows={2}
            />
          </div>
        )}

        {config.showNotes && (
          <div className="sf-form-field">
            <label className="sf-form-label">{t.publicForm.notes}</label>
            <textarea
              className="sf-form-textarea"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t.publicForm.notesPlaceholder}
              rows={2}
            />
          </div>
        )}

        {config.customFields?.length > 0 && (
          <div className="sf-form-custom-fields">
            {config.customFields.map((field, i) => (
              <div key={i} className="sf-form-field">
                <label
                  className={`sf-form-label ${field.required ? "sf-form-label-required" : ""}`}
                >
                  {field.label}
                </label>
                <input
                  className="sf-form-input"
                  required={field.required}
                  value={customValues[field.label] || ""}
                  onChange={(e) =>
                    setCustomValues((prev) => ({
                      ...prev,
                      [field.label]: e.target.value,
                    }))
                  }
                />
              </div>
            ))}
          </div>
        )}

        {error && <div className="sf-form-error">{error}</div>}

        <button
          type="submit"
          className="sf-form-submit"
          disabled={submitting || cartCount === 0}
        >
          {submitting ? (
            <>
              <Loader2 size={18} className="sf-form-spin" />
              {t.publicForm.submitting}
            </>
          ) : (
            <>
              <ShoppingCart size={18} />
              {t.publicForm.confirmOrder}
            </>
          )}
        </button>
      </form>

      <footer className="sf-form-footer">
        {t.publicForm.poweredBy} <strong>SahelFlow</strong>
      </footer>
    </div>
  );
}
