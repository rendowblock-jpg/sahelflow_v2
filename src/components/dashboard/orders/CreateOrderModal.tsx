"use client";

import { useState } from "react";
import { X, Plus, Loader2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { WILAYA_NAMES } from "@/lib/data/wilayas";
import type { ProductOption } from "./types";

interface Props {
  open: boolean;
  products: ProductOption[];
  saving: boolean;
  initialForm: {
    customerName: string;
    phone: string;
    wilaya: string;
    commune: string;
    address: string;
    items: { product_name: string; quantity: number; unit_price: number }[];
    deliveryCost: number;
    notes: string;
  };
  onClose: () => void;
  onCreate: (form: ReturnType<typeof useCreateOrderForm>["form"]) => void;
  onWilayaChange: (wilayaName: string) => Promise<number | undefined>;
}

export function useCreateOrderForm(initial: Props["initialForm"]) {
  // useState lazily initialises from `initial` only on the very first render;
  // subsequent renders (e.g. parent re-renders with a new object reference) do
  // NOT reset the form state, which is the correct behaviour for a modal form.
  const [form, setForm] = useState(initial);

  const removeItem = (idx: number) =>
    setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));

  return { form, setForm, removeItem };
}

export default function CreateOrderModal({
  open,
  products,
  saving,
  initialForm,
  onClose,
  onCreate,
  onWilayaChange,
}: Props) {
  const { t } = useI18n();
  const { form, setForm, removeItem } = useCreateOrderForm(initialForm);

  if (!open) return null;

  async function handleWilayaChange(wilayaName: string) {
    setForm((f) => ({ ...f, wilaya: wilayaName }));
    if (wilayaName) {
      const cost = await onWilayaChange(wilayaName);
      if (cost !== undefined) {
        setForm((f) => ({ ...f, deliveryCost: cost }));
      }
    }
  }

  return (
    <div className="sf-modal-backdrop" onClick={onClose}>
      <div
        className="sf-modal sf-orders-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sf-orders-modal__header">
          <h2 className="sf-orders-modal__title">{t.orders.newOrder}</h2>
          <button onClick={onClose} className="sf-orders-modal__close">
            <X size={20} />
          </button>
        </div>

        <div className="sf-flex-col sf-gap-md">
          <p className="sf-section-label">{t.orders.customerInfo}</p>
          <div className="sf-grid-2">
            <div>
              <label className="sf-label">{t.orders.customerName}</label>
              <input
                className="sf-input"
                value={form.customerName}
                onChange={(e) =>
                  setForm((f) => ({ ...f, customerName: e.target.value }))
                }
              />
            </div>
            <div>
              <label className="sf-label">{t.orders.phone}</label>
              <input
                className="sf-input"
                value={form.phone}
                onChange={(e) =>
                  setForm((f) => ({ ...f, phone: e.target.value }))
                }
                dir="ltr"
              />
            </div>
          </div>
          <div className="sf-grid-2">
            <div>
              <label className="sf-label">{t.dashboard.wilaya}</label>
              <select
                className="sf-input sf-input--native-select"
                value={form.wilaya}
                onChange={(e) => handleWilayaChange(e.target.value)}
              >
                <option value="">—</option>
                {WILAYA_NAMES.map((w: string) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="sf-label">{t.orders.commune}</label>
              <input
                className="sf-input"
                value={form.commune}
                onChange={(e) =>
                  setForm((f) => ({ ...f, commune: e.target.value }))
                }
              />
            </div>
          </div>
          <div>
            <label className="sf-label">{t.orders.address}</label>
            <input
              className="sf-input"
              value={form.address}
              onChange={(e) =>
                setForm((f) => ({ ...f, address: e.target.value }))
              }
            />
          </div>

          <p className="sf-section-label">{t.orders.items}</p>
          {form.items.map((item, idx) => (
            <div key={idx} className="sf-orders-modal__item-row">
              <button
                type="button"
                onClick={() => removeItem(idx)}
                className="sf-btn-icon"
                aria-label="Remove item"
              >
                ✕
              </button>
              <div className="sf-orders-modal__item-product">
                <label className="sf-label">{t.orders.productName}</label>
                <select
                  className="sf-input sf-input--native-select"
                  value={item.product_name}
                  onChange={(e) => {
                    const items = [...form.items];
                    const productName = e.target.value;
                    items[idx].product_name = productName;
                    const matchedProduct = products.find(
                      (p) => p.name === productName,
                    );
                    if (matchedProduct) {
                      items[idx].unit_price = matchedProduct.price;
                    }
                    setForm((f) => ({ ...f, items }));
                  }}
                >
                  <option value="">{t.orders.selectProduct}</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.name}>
                      {p.name} — {p.price} DA{" "}
                      {p.stock !== undefined
                        ? `(${p.stock} ${t.products.stock.toLowerCase()})`
                        : ""}
                    </option>
                  ))}
                  <option value="__custom__">{t.orders.customItem}</option>
                </select>
                {item.product_name === "__custom__" && (
                  <input
                    className="sf-input sf-orders-modal__input-mt"
                    placeholder={t.orders.productName}
                    onChange={(e) => {
                      const items = [...form.items];
                      items[idx].product_name = e.target.value;
                      setForm((f) => ({ ...f, items }));
                    }}
                  />
                )}
              </div>
              <div className="sf-orders-modal__item-qty">
                <label className="sf-label">{t.orders.quantity}</label>
                <input
                  className="sf-input"
                  type="number"
                  min="1"
                  value={item.quantity}
                  onChange={(e) => {
                    const items = [...form.items];
                    items[idx].quantity = Number(e.target.value);
                    setForm((f) => ({ ...f, items }));
                  }}
                />
              </div>
              <div className="sf-orders-modal__item-price">
                <label className="sf-label">{t.orders.price}</label>
                <input
                  className="sf-input"
                  type="number"
                  min="0"
                  value={item.unit_price}
                  onChange={(e) => {
                    const items = [...form.items];
                    items[idx].unit_price = Number(e.target.value);
                    setForm((f) => ({ ...f, items }));
                  }}
                />
              </div>
            </div>
          ))}
          <button
            className="sf-btn sf-btn-ghost sf-orders-modal__add-item"
            onClick={() =>
              setForm((f) => ({
                ...f,
                items: [
                  ...f.items,
                  { product_name: "", quantity: 1, unit_price: 0 },
                ],
              }))
            }
          >
            {t.orders.addItem}
          </button>

          <div className="sf-grid-2">
            <div>
              <label className="sf-label">{t.orders.deliveryCost}</label>
              <input
                className="sf-input"
                type="number"
                min="0"
                value={form.deliveryCost}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    deliveryCost: Number(e.target.value),
                  }))
                }
              />
            </div>
          </div>
          <div>
            <label className="sf-label">{t.orders.notes}</label>
            <textarea
              className="sf-textarea"
              rows={2}
              placeholder={t.orders.optionalNotes}
              value={form.notes}
              onChange={(e) =>
                setForm((f) => ({ ...f, notes: e.target.value }))
              }
            />
          </div>

          <button
            className="sf-btn sf-btn-primary sf-orders-modal__submit"
            disabled={saving || !form.customerName || !form.phone}
            onClick={() => onCreate(form)}
          >
            {saving ? (
              <>
                <Loader2 size={16} className="sf-animate-spin" />
                {t.orders.creating}
              </>
            ) : (
              <>
                <Plus size={16} />
                {t.orders.createOrder}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
