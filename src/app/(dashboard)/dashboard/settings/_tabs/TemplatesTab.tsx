"use client";

import { Save, Loader2, MessageSquare, Plus, Pencil, Trash2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useLayout } from "@/components/providers/Providers";

interface Template {
  id: string;
  name: string;
  slug: string;
  content: string;
  category: string;
  language: string;
  active: boolean;
}

interface TemplatesTabProps {
  templates: Template[];
  templateLoading: boolean;
  templateSaving: boolean;
  templateEditing: string | null;
  templateForm: {
    name: string;
    slug: string;
    content: string;
    category: string;
    language: string;
  };
  showTemplateForm: boolean;
  setTemplateEditing: (id: string | null) => void;
  setTemplateForm: React.Dispatch<
    React.SetStateAction<{
      name: string;
      slug: string;
      content: string;
      category: string;
      language: string;
    }>
  >;
  setShowTemplateForm: (show: boolean) => void;
  onSave: () => void;
  onDelete: (id: string) => void;
  onEdit: (tpl: Template) => void;
  onToggle: (id: string, active: boolean) => void;
}

const VARIABLE_CHIPS = [
  "{{customer_name}}",
  "{{order_id}}",
  "{{order_total}}",
  "{{product_name}}",
  "{{store_name}}",
  "{{tracking_link}}",
];

const LANG_LABELS: Record<string, string> = {
  ar: "العربية",
  fr: "FR",
  en: "EN",
};

const CAT_COLORS: Record<string, string> = {
  welcome: "sf-badge-brand",
  followup: "sf-badge-warning",
  confirmation: "sf-badge-success",
  upsell: "sf-badge-default",
  general: "sf-badge-default",
};

function cancelForm(
  setTemplateEditing: (id: string | null) => void,
  setTemplateForm: React.Dispatch<React.SetStateAction<{
    name: string; slug: string; content: string; category: string; language: string;
  }>>,
  setShowTemplateForm: (show: boolean) => void
) {
  setTemplateEditing(null);
  setTemplateForm({ name: "", slug: "", content: "", category: "general", language: "ar" });
  setShowTemplateForm(false);
}

export default function TemplatesTab({
  templates,
  templateLoading,
  templateSaving,
  templateEditing,
  templateForm,
  showTemplateForm,
  setTemplateEditing,
  setTemplateForm,
  setShowTemplateForm,
  onSave,
  onDelete,
  onEdit,
  onToggle,
}: TemplatesTabProps) {
  const { t } = useI18n();
  const { isMobile } = useLayout();

  const insertVariable = (v: string) => {
    setTemplateForm((prev) => ({
      ...prev,
      content: prev.content + v,
    }));
  };

  const isFormOpen = showTemplateForm || templateEditing !== null;

  return (
    <div className="sf-flex-col sf-gap-lg sf-animate-fade">
      {/* Header section */}
      <div className="sf-settings-section">
        <div className="sf-settings-section-header">
          <div className="sf-flex sf-items-center" style={{ justifyContent: "space-between" }}>
            <div>
              <h3 className="sf-settings-section-title">{t.settings.templates}</h3>
              <p className="sf-settings-section-desc sf-mt-sm">{t.settings.templatesDesc}</p>
            </div>
            {!isFormOpen && (
              <button
                className="sf-btn sf-btn-primary"
                onClick={() => {
                  setTemplateEditing(null);
                  setTemplateForm({ name: "", slug: "", content: "", category: "general", language: "ar" });
                  setShowTemplateForm(true);
                }}
              >
                <Plus size={14} style={{ marginInlineEnd: "6px" }} />
                {t.common.add}
              </button>
            )}
          </div>
        </div>

        {/* Inline Template Form */}
        {isFormOpen && (
          <div className="sf-settings-section-body" style={{ borderBottom: "1px solid var(--color-line-primary)", marginBottom: 0 }}>
            <div
              style={{
                padding: "20px",
                background: "rgba(59,158,255,0.03)",
                border: "1px solid rgba(59,158,255,0.12)",
                borderRadius: "10px",
                display: "flex",
                flexDirection: "column",
                gap: "16px",
              }}
            >
              <p className="sf-font-semibold sf-text-sm" style={{ color: "var(--color-brand-400)" }}>
                {templateEditing ? t.settings.templateEdit : t.settings.templateNew}
              </p>

              <div className={isMobile ? "sf-flex-col sf-gap-md" : "sf-grid-2 sf-gap-md"}>
                <div className="sf-field-float">
                  <input
                    id="tpl_name"
                    className="sf-input"
                    placeholder=" "
                    value={templateForm.name}
                    onChange={(e) =>
                      setTemplateForm((prev) => ({ ...prev, name: e.target.value }))
                    }
                  />
                  <label htmlFor="tpl_name">{t.settings.templateName}</label>
                </div>
                <div className="sf-field-float">
                  <input
                    id="tpl_slug"
                    className="sf-input"
                    placeholder=" "
                    value={templateForm.slug}
                    onChange={(e) =>
                      setTemplateForm((prev) => ({
                        ...prev,
                        slug: e.target.value.replace(/[^a-z0-9_-]/g, ""),
                      }))
                    }
                    dir="ltr"
                  />
                  <label htmlFor="tpl_slug">{t.settings.templateSlug}</label>
                </div>
              </div>

              <div className={isMobile ? "sf-flex-col sf-gap-md" : "sf-grid-2 sf-gap-md"}>
                <div>
                  <label className="sf-label">{t.settings.templateCategory}</label>
                  <select
                    className="sf-input"
                    value={templateForm.category}
                    onChange={(e) =>
                      setTemplateForm((prev) => ({ ...prev, category: e.target.value }))
                    }
                  >
                    <option value="welcome">{t.settings.catWelcome}</option>
                    <option value="followup">{t.settings.catFollowup}</option>
                    <option value="confirmation">{t.settings.catConfirmation}</option>
                    <option value="upsell">{t.settings.catUpsell}</option>
                    <option value="general">{t.settings.catGeneral}</option>
                  </select>
                </div>
                <div>
                  <label className="sf-label">{t.settings.templateLanguage}</label>
                  <select
                    className="sf-input"
                    value={templateForm.language}
                    onChange={(e) =>
                      setTemplateForm((prev) => ({ ...prev, language: e.target.value }))
                    }
                  >
                    <option value="ar">العربية (Darija)</option>
                    <option value="fr">Français</option>
                    <option value="en">English</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="sf-label" style={{ marginBottom: "8px", display: "block" }}>
                  {t.settings.templateContent}
                </label>
                <textarea
                  className="sf-input"
                  rows={4}
                  value={templateForm.content}
                  onChange={(e) =>
                    setTemplateForm((prev) => ({ ...prev, content: e.target.value }))
                  }
                  placeholder="مرحبا {{customer_name}}! ..."
                  style={{ resize: "vertical" }}
                />
                {/* Variable Hint Chips */}
                <div className="sf-flex sf-flex-wrap sf-gap-sm" style={{ marginTop: "10px", gap: "6px", flexWrap: "wrap" }}>
                  {VARIABLE_CHIPS.map((v) => (
                    <button
                      key={v}
                      type="button"
                      className="sf-template-var-chip"
                      onClick={() => insertVariable(v)}
                      title={`Insert ${v}`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
                <p className="sf-text-xs sf-text-tertiary" style={{ marginTop: "6px" }}>
                  Click a variable chip to insert it at the end of your message.
                </p>
              </div>

              <div className="sf-flex sf-gap-sm">
                <button
                  className="sf-btn sf-btn-primary"
                  onClick={onSave}
                  disabled={templateSaving}
                >
                  {templateSaving ? (
                    <Loader2 size={14} className="sf-animate-spin" style={{ marginInlineEnd: "6px" }} />
                  ) : (
                    <Save size={14} style={{ marginInlineEnd: "6px" }} />
                  )}
                  {t.common.save}
                </button>
                <button
                  className="sf-btn sf-btn-ghost"
                  onClick={() =>
                    cancelForm(setTemplateEditing, setTemplateForm, setShowTemplateForm)
                  }
                >
                  {t.common.cancel}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Template Card Grid */}
      {templateLoading ? (
        <div className="sf-flex sf-items-center sf-gap-sm" style={{ justifyContent: "center", padding: "40px 0" }}>
          <Loader2 size={20} className="sf-animate-spin sf-text-tertiary" />
          <span className="sf-text-sm sf-text-tertiary">{t.common.loading}</span>
        </div>
      ) : templates.length === 0 ? (
        <div className="sf-empty">
          <div className="sf-empty-icon">
            <MessageSquare size={24} />
          </div>
          <p className="sf-empty-title">{t.settings.templateNoTemplates}</p>
          <p className="sf-empty-desc">{t.settings.templateNoTemplatesDesc}</p>
          <button
            className="sf-btn sf-btn-primary"
            style={{ marginTop: "8px" }}
            onClick={() => {
              setTemplateEditing(null);
              setTemplateForm({ name: "", slug: "", content: "", category: "general", language: "ar" });
              setShowTemplateForm(true);
            }}
          >
            <Plus size={14} style={{ marginInlineEnd: "6px" }} />
            {t.common.add}
          </button>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)",
            gap: "14px",
          }}
        >
          {templates.map((tpl) => (
            <div key={tpl.id} className="sf-template-card">
              <div className="sf-template-card__header">
                <div className="sf-flex sf-items-center sf-gap-sm">
                  <span
                    className={`sf-badge ${CAT_COLORS[tpl.category] || "sf-badge-default"}`}
                    style={{ fontSize: "10px", textTransform: "capitalize" }}
                  >
                    {tpl.category}
                  </span>
                  <span
                    style={{
                      fontSize: "10px",
                      padding: "2px 6px",
                      borderRadius: "4px",
                      background: "var(--color-surface-tertiary)",
                      color: "var(--color-content-tertiary)",
                      fontWeight: 500,
                    }}
                  >
                    {LANG_LABELS[tpl.language] || tpl.language}
                  </span>
                </div>
                <div
                  className={`sf-toggle ${tpl.active ? "sf-toggle-active" : ""}`}
                  style={{ transform: "scale(0.85)" }}
                  onClick={() => onToggle(tpl.id, tpl.active)}
                  title={tpl.active ? "Deactivate" : "Activate"}
                />
              </div>

              <div style={{ padding: "0 16px 10px" }}>
                <p className="sf-font-semibold sf-text-sm sf-text-primary">{tpl.name}</p>
                <p className="sf-text-mono sf-text-xs sf-text-tertiary" dir="ltr" style={{ marginTop: "2px" }}>
                  /{tpl.slug}
                </p>
              </div>

              <div className="sf-template-card__preview">
                {tpl.content.slice(0, 90)}{tpl.content.length > 90 ? "…" : ""}
              </div>

              <div className="sf-template-card__footer">
                <button
                  className="sf-btn sf-btn-ghost"
                  style={{ padding: "4px 10px", minHeight: "28px", fontSize: "12px" }}
                  onClick={() => onEdit(tpl)}
                >
                  <Pencil size={12} style={{ marginInlineEnd: "4px" }} />
                  {t.common.edit}
                </button>
                <button
                  className="sf-btn sf-btn-ghost"
                  style={{ padding: "4px 10px", minHeight: "28px", fontSize: "12px", color: "var(--color-danger-400)" }}
                  onClick={() => onDelete(tpl.id)}
                >
                  <Trash2 size={12} style={{ marginInlineEnd: "4px" }} />
                  {t.common.delete}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
