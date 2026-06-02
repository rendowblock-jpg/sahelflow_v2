"use client";

import React, { useState } from "react";
import { useToast } from "@/components/dashboard/ToastProvider";
import { useI18n } from "@/lib/i18n";
import type { ExpenseCategory } from "@/types";

interface ExpenseFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

const CATEGORIES: { value: ExpenseCategory; labelEn: string; labelAr: string; labelFr: string }[] = [
  { value: "ads", labelEn: "Advertising (Ads)", labelAr: "الإعلانات", labelFr: "Publicité (Ads)" },
  { value: "packaging", labelEn: "Packaging Supplies", labelAr: "التغليف", labelFr: "Emballage" },
  { value: "delivery_fees", labelEn: "Delivery Fees", labelAr: "رسوم التوصيل", labelFr: "Frais de livraison" },
  { value: "returns", labelEn: "Return Losses", labelAr: "خسائر المرتجعات", labelFr: "Pertes de retour" },
  { value: "supplies", labelEn: "Office/Store Supplies", labelAr: "لوازم ومعدات", labelFr: "Fournitures" },
  { value: "salary", labelEn: "Salaries & Wages", labelAr: "الرواتب والأجور", labelFr: "Salaires" },
  { value: "rent", labelEn: "Office/Warehouse Rent", labelAr: "الإيجار", labelFr: "Loyer" },
  { value: "other", labelEn: "Other Expenses", labelAr: "مصاريف أخرى", labelFr: "Autre" },
];

export const ExpenseForm: React.FC<ExpenseFormProps> = ({ onSuccess, onCancel }) => {
  const { locale } = useI18n();
  const { toast } = useToast();
  
  const [category, setCategory] = useState<ExpenseCategory>("ads");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split("T")[0]);
  const [loading, setLoading] = useState(false);

  const isAr = locale === "ar";
  const isFr = locale === "fr";

  const tTitle = isAr ? "إضافة مصاريف جديدة" : isFr ? "Ajouter une dépense" : "Add New Expense";
  const tAmount = isAr ? "المبلغ (دينار جزائري)" : isFr ? "Montant (DA)" : "Amount (DA)";
  const tCategory = isAr ? "الفئة" : isFr ? "Catégorie" : "Category";
  const tDescription = isAr ? "الوصف" : isFr ? "Description" : "Description";
  const tDate = isAr ? "التاريخ" : isFr ? "Date" : "Date";
  const tCancel = isAr ? "إلغاء" : isFr ? "Annuler" : "Cancel";
  const tSubmit = isAr ? "حفظ المصاريف" : isFr ? "Enregistrer" : "Save Expense";
  const tSuccessMsg = isAr ? "تم حفظ المصاريف بنجاح" : isFr ? "Dépense enregistrée avec succès" : "Expense added successfully";
  const tErrorMsg = isAr ? "فشل حفظ المصاريف" : isFr ? "Échec de l'enregistrement" : "Failed to add expense";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) {
      toast({
        type: "error",
        title: isAr ? "المبلغ غير صالح" : "Invalid amount",
      });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          amount: Number(amount),
          description: description || null,
          expense_date: expenseDate,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save");
      }

      toast({
        type: "success",
        title: tSuccessMsg,
      });

      if (onSuccess) onSuccess();
    } catch {
      toast({
        type: "error",
        title: tErrorMsg,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="sf-returns-note-form" style={{ gap: 16 }}>
      <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{tTitle}</h3>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-content-secondary)" }}>
          {tAmount}
        </label>
        <input
          type="number"
          required
          min="1"
          placeholder="5000"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          style={{
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid var(--color-line-primary)",
            background: "var(--color-surface-primary)",
            fontSize: 14,
            color: "var(--color-content-primary)",
          }}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-content-secondary)" }}>
          {tCategory}
        </label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
          style={{
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid var(--color-line-primary)",
            background: "var(--color-surface-primary)",
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

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-content-secondary)" }}>
          {tDate}
        </label>
        <input
          type="date"
          required
          value={expenseDate}
          onChange={(e) => setExpenseDate(e.target.value)}
          style={{
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid var(--color-line-primary)",
            background: "var(--color-surface-primary)",
            fontSize: 14,
            color: "var(--color-content-primary)",
            fontFamily: "inherit",
          }}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-content-secondary)" }}>
          {tDescription}
        </label>
        <textarea
          placeholder={isAr ? "مثال: إعلانات فيسبوك لشهر ماي" : "e.g. Facebook Ads campaign May"}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          style={{
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid var(--color-line-primary)",
            background: "var(--color-surface-primary)",
            fontSize: 14,
            color: "var(--color-content-primary)",
            resize: "none",
            fontFamily: "inherit",
          }}
        />
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        <button
          type="submit"
          disabled={loading}
          className="sf-btn sf-btn-primary"
          style={{ flex: 1, minHeight: 40, fontSize: 14 }}
        >
          {loading ? "..." : tSubmit}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="sf-btn sf-btn-ghost"
            style={{ flex: 1, minHeight: 40, fontSize: 14 }}
          >
            {tCancel}
          </button>
        )}
      </div>
    </form>
  );
};
