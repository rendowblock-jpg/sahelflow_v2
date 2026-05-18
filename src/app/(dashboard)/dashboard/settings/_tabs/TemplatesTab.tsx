"use client";

import { Save, Loader2, MessageSquare } from "lucide-react";
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

  return (
    <div className="sf-card sf-flex-col sf-gap-lg">
      <div className="sf-flex-between">
        <div>
          <h3 className="sf-settings-card-title">{t.settings.templates}</h3>
          <p className="sf-settings-hint">{t.settings.templatesDesc}</p>
        </div>
        <button
          className="sf-btn sf-btn-primary"
          onClick={() => {
            setTemplateEditing(null);
            setTemplateForm({
              name: "",
              slug: "",
              content: "",
              category: "general",
              language: "ar",
            });
            setShowTemplateForm(true);
          }}
        >
          {t.common.add} <MessageSquare size={14} />
        </button>
      </div>

      <div className="sf-info-box">{t.settings.templateVariables}</div>

      {(showTemplateForm || templateEditing !== null) && (
        <div className="sf-card sf-flex-col sf-gap-md sf-card-brand-border">
          <h4 className="sf-heading-xs">
            {templateEditing ? t.settings.templateEdit : t.settings.templateNew}
          </h4>
          <div
            className={
              isMobile ? "sf-flex-col sf-gap-md" : "sf-grid-2 sf-gap-sm"
            }
          >
            <div>
              <label className="sf-label">{t.settings.templateName}</label>
              <input
                className="sf-input"
                value={templateForm.name}
                onChange={(e) =>
                  setTemplateForm((prev) => ({
                    ...prev,
                    name: e.target.value,
                  }))
                }
                placeholder="e.g. Welcome Message"
              />
            </div>
            <div>
              <label className="sf-label">{t.settings.templateSlug}</label>
              <input
                className="sf-input"
                value={templateForm.slug}
                onChange={(e) =>
                  setTemplateForm((prev) => ({
                    ...prev,
                    slug: e.target.value.replace(/[^a-z0-9_-]/g, ""),
                  }))
                }
                placeholder="e.g. welcome"
                dir="ltr"
              />
            </div>
          </div>
          <div
            className={
              isMobile ? "sf-flex-col sf-gap-md" : "sf-grid-2 sf-gap-sm"
            }
          >
            <div>
              <label className="sf-label">{t.settings.templateCategory}</label>
              <select
                className="sf-input"
                value={templateForm.category}
                onChange={(e) =>
                  setTemplateForm((prev) => ({
                    ...prev,
                    category: e.target.value,
                  }))
                }
              >
                <option value="welcome">{t.settings.catWelcome}</option>
                <option value="followup">{t.settings.catFollowup}</option>
                <option value="confirmation">
                  {t.settings.catConfirmation}
                </option>
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
                  setTemplateForm((prev) => ({
                    ...prev,
                    language: e.target.value,
                  }))
                }
              >
                <option value="ar">العربية (Darija)</option>
                <option value="fr">Français</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>
          <div>
            <label className="sf-label">{t.settings.templateContent}</label>
            <textarea
              className="sf-input"
              rows={4}
              value={templateForm.content}
              onChange={(e) =>
                setTemplateForm((prev) => ({
                  ...prev,
                  content: e.target.value,
                }))
              }
              placeholder="مرحبا {{customer_name}}! ..."
            />
          </div>
          <div className="sf-flex sf-gap-sm">
            <button
              className="sf-btn sf-btn-primary"
              onClick={onSave}
              disabled={templateSaving}
            >
              {templateSaving ? (
                <Loader2 size={16} className="sf-animate-spin" />
              ) : (
                <Save size={16} />
              )}{" "}
              {t.common.save}
            </button>
            <button
              className="sf-btn sf-btn-ghost"
              onClick={() => {
                setTemplateEditing(null);
                setTemplateForm({
                  name: "",
                  slug: "",
                  content: "",
                  category: "general",
                  language: "ar",
                });
                setShowTemplateForm(false);
              }}
            >
              {t.common.cancel}
            </button>
          </div>
        </div>
      )}

      {templateLoading ? (
        <div className="sf-flex-center sf-p-xl">
          <Loader2 size={20} className="sf-animate-spin" />
        </div>
      ) : templates.length === 0 ? (
        <div className="sf-card sf-empty">
          <MessageSquare size={32} className="sf-text-tertiary sf-mb-sm" />
          <p className="sf-font-semibold">{t.settings.templateNoTemplates}</p>
          <p className="sf-text-sm-tertiary sf-mt-sm">
            {t.settings.templateNoTemplatesDesc}
          </p>
        </div>
      ) : (
        <div className="sf-flex-col sf-gap-md">
          {templates.map((tpl) => (
            <div key={tpl.id} className="sf-card sf-card-muted">
              <div className="sf-flex-between sf-mb-md">
                <div className="sf-flex-center-gap-sm">
                  <span
                    className={`sf-badge ${tpl.active ? "sf-badge-success" : "sf-badge-default"} sf-text-xs sf-capitalize`}
                  >
                    {tpl.category}
                  </span>
                  <span className="sf-font-semibold sf-text-base">
                    {tpl.name}
                  </span>
                  <span className="sf-text-xs-tertiary sf-text-mono" dir="ltr">
                    {tpl.slug}
                  </span>
                </div>
                <div className="sf-flex-gap-sm-shrink">
                  <button
                    className="sf-btn sf-btn-ghost sf-text-sm"
                    onClick={() => onEdit(tpl)}
                  >
                    {t.common.edit}
                  </button>
                  <button
                    className="sf-btn sf-btn-ghost sf-text-sm"
                    onClick={() => onToggle(tpl.id, tpl.active)}
                  >
                    {tpl.active ? t.common.inactive : t.common.active}
                  </button>
                  <button
                    className="sf-btn sf-btn-ghost sf-text-sm sf-text-danger"
                    onClick={() => onDelete(tpl.id)}
                  >
                    {t.common.delete}
                  </button>
                </div>
              </div>
              <p className="sf-text-sm-secondary sf-pre-wrap">{tpl.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
