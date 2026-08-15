"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  Monitor,
  Plus,
  Redo2,
  Save,
  Smartphone,
  Tablet,
  Trash2,
  Undo2,
} from "lucide-react";

import { useI18n } from "@/hooks/use-i18n";
import {
  getStorefrontStudioContentCopy,
  type StorefrontStudioContentKey,
  type StorefrontStudioContentLocale,
} from "@/lib/i18n/storefront-studio-content";
import type { StorefrontStudioConfig } from "@/lib/storefront/service";
import type {
  StorefrontSection,
  StorefrontSectionType,
} from "@/lib/storefront/studio-sections";
import {
  addStorefrontBlock,
  addStorefrontSection,
  createStorefrontStudioDraft,
  deleteStorefrontBlock,
  deleteStorefrontSection,
  duplicateStorefrontSection,
  moveStorefrontSection,
  patchStorefrontBlockSettings,
  patchStorefrontSectionSettings,
  reorderStorefrontSection,
  storefrontDraftFingerprint,
  toggleStorefrontSection,
  type StorefrontStudioDraft,
} from "@/lib/storefront/studio-draft";
import {
  commitStorefrontStudioHistory,
  createStorefrontStudioHistory,
  redoStorefrontStudioHistory,
  undoStorefrontStudioHistory,
} from "@/lib/storefront/studio-history";
import { storefrontStudioDraftSchema } from "@/lib/storefront/studio-schema";
import { switchStorefrontTemplate } from "@/lib/storefront/theme-normalize";
import { cn } from "@/lib/utils";

import { SaharaPreview } from "./sahara-preview";
import { SECTION_LABEL_KEYS, SectionTree } from "./section-tree";
import { TemplateGallery } from "./template-gallery";
import type {
  StorefrontStudioDevice,
  StorefrontStudioProduct,
} from "./studio-types";

type StudioPanel =
  | "sections"
  | "theme"
  | "products"
  | "checkout"
  | "contact"
  | "seo";

type SaveState = "saved" | "pending" | "saving" | "error" | "conflict";

type SerializedConfig = Omit<
  StorefrontStudioConfig,
  "createdAt" | "updatedAt" | "draftUpdatedAt" | "liveUpdatedAt"
> & {
  createdAt: string;
  updatedAt: string;
  draftUpdatedAt: string | null;
  liveUpdatedAt: string;
};

const PANELS: readonly { id: StudioPanel; labelKey: string }[] = [
  { id: "sections", labelKey: "storefront.studio.panels.sections" },
  { id: "theme", labelKey: "storefront.studio.panels.theme" },
  { id: "products", labelKey: "storefront.studio.panels.products" },
  { id: "checkout", labelKey: "storefront.studio.panels.checkout" },
  { id: "contact", labelKey: "storefront.builder.contactInfo" },
  { id: "seo", labelKey: "storefront.studio.panels.seo" },
];

export function StorefrontStudio({
  config,
  products,
}: {
  config: StorefrontStudioConfig;
  products: StorefrontStudioProduct[];
}) {
  const { t, dir, locale } = useI18n();
  const initialDraft = useMemo(
    () => createStorefrontStudioDraft(config),
    [config],
  );
  const [history, setHistory] = useState(() =>
    createStorefrontStudioHistory(initialDraft),
  );
  const [device, setDevice] = useState<StorefrontStudioDevice>("desktop");
  const [panel, setPanel] = useState<StudioPanel>("sections");
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(
    initialDraft.theme.builder.composition.sections[0]?.id ?? null,
  );
  const [savedFingerprint, setSavedFingerprint] = useState(() =>
    storefrontDraftFingerprint(initialDraft),
  );
  const [version, setVersion] = useState<string | null>(() =>
    config.draftUpdatedAt ? dateIso(config.draftUpdatedAt) : null,
  );
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [conflict, setConflict] = useState<SerializedConfig | null>(null);
  const requestSequence = useRef(0);

  const draft = history.present;
  const fingerprint = storefrontDraftFingerprint(draft);
  const dirty = fingerprint !== savedFingerprint;
  const sections = draft.theme.builder.composition.sections;
  const selectedSection =
    sections.find((section) => section.id === selectedSectionId) ?? null;

  const commitDraft = useCallback((next: StorefrontStudioDraft) => {
    setHistory((current) =>
      storefrontDraftFingerprint(current.present) ===
      storefrontDraftFingerprint(next)
        ? current
        : commitStorefrontStudioHistory(current, next),
    );
    setMessage(null);
    setSaveState((current) =>
      current === "conflict" || current === "saving" ? current : "pending",
    );
  }, []);

  const persist = useCallback(
    async (candidate: StorefrontStudioDraft, manual = false) => {
      const parsed = storefrontStudioDraftSchema.safeParse(candidate);
      if (!parsed.success) {
        setSaveState("error");
        setMessage(
          parsed.error.issues[0]?.message ??
            t("storefront.studio.validationFailed"),
        );
        return;
      }

      const sequence = ++requestSequence.current;
      setSaveState("saving");
      setMessage(manual ? t("storefront.studio.savingDraft") : null);

      try {
        const response = await fetch(
          `/api/storefront/config/${encodeURIComponent(config.id)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              expectedDraftUpdatedAt: version,
              name: parsed.data.name,
              slug: parsed.data.slug,
              description: parsed.data.description || null,
              theme: parsed.data.theme,
              productIds: parsed.data.selectedProductIds,
              isActive: parsed.data.isActive,
            }),
          },
        );
        const body = (await response.json()) as {
          error?: string;
          config?: SerializedConfig;
        };

        if (sequence !== requestSequence.current) return;
        if (response.status === 409 && body.config) {
          setConflict(body.config);
          setSaveState("conflict");
          setMessage(t("storefront.studio.newerDraft"));
          return;
        }
        if (!response.ok || !body.config) {
          throw new Error(body.error ?? t("storefront.studio.saveFailed"));
        }

        setVersion(body.config.draftUpdatedAt);
        setSavedFingerprint(storefrontDraftFingerprint(candidate));
        setSavedAt(new Date());
        setSaveState("saved");
        setMessage(manual ? t("storefront.studio.draftSaved") : null);
      } catch {
        if (sequence !== requestSequence.current) return;
        setSaveState("error");
        setMessage(t("storefront.studio.localDraftRetained"));
      }
    },
    [config.id, t, version],
  );

  const publish = useCallback(async () => {
    if (draft.isActive && draft.theme.builder.shippingRules.length === 0) {
      setPanel("checkout");
      setMessage(t("storefront.studio.shippingEmpty"));
      return;
    }
    if (
      !version ||
      dirty ||
      saveState === "saving" ||
      saveState === "conflict"
    ) {
      setMessage(t("storefront.studio.saveBeforePublishing"));
      return;
    }

    const sequence = ++requestSequence.current;
    setSaveState("saving");
    setMessage(t("storefront.studio.publishing"));

    try {
      const response = await fetch(
        `/api/storefront/config/${encodeURIComponent(config.id)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedDraftUpdatedAt: version,
            locale: locale.startsWith("fr")
              ? "fr"
              : locale.startsWith("en")
                ? "en"
                : "ar",
          }),
        },
      );
      const body = (await response.json()) as {
        error?: string;
        config?: SerializedConfig;
      };

      if (sequence !== requestSequence.current) return;
      if (response.status === 409 && body.config) {
        setConflict(body.config);
        setVersion(body.config.draftUpdatedAt);
        setSaveState("conflict");
        setMessage(t("storefront.studio.newerDraft"));
        return;
      }
      if (!response.ok) {
        throw new Error(body.error ?? t("storefront.studio.publishFailed"));
      }

      setSaveState("saved");
      setMessage(
        draft.isActive
          ? t("storefront.studio.published")
          : t("storefront.inactive"),
      );
    } catch {
      if (sequence !== requestSequence.current) return;
      setSaveState("error");
      setMessage(t("storefront.studio.publishFailed"));
    }
  }, [
    config.id,
    dirty,
    draft.isActive,
    draft.theme.builder.shippingRules.length,
    locale,
    saveState,
    t,
    version,
  ]);

  useEffect(() => {
    if (!dirty || conflict || saveState === "saving" || saveState === "error") {
      return;
    }
    const timer = window.setTimeout(() => void persist(draft), 900);
    return () => window.clearTimeout(timer);
  }, [conflict, dirty, draft, fingerprint, persist, saveState]);

  function acceptServerDraft() {
    if (!conflict) return;
    const next = createStorefrontStudioDraft({
      ...conflict,
      createdAt: new Date(conflict.createdAt),
      updatedAt: new Date(conflict.updatedAt),
    });
    setHistory(createStorefrontStudioHistory(next));
    setVersion(conflict.draftUpdatedAt);
    setSavedFingerprint(storefrontDraftFingerprint(next));
    setConflict(null);
    setSaveState("saved");
    setMessage(t("storefront.studio.loadedSavedDraft"));
  }

  function keepLocalDraft() {
    if (!conflict) return;
    setVersion(conflict.draftUpdatedAt);
    setConflict(null);
    setSaveState("error");
    setMessage(t("storefront.studio.confirmOverwrite"));
  }

  function updateTheme(
    mutator: (
      theme: StorefrontStudioDraft["theme"],
    ) => StorefrontStudioDraft["theme"],
  ) {
    commitDraft({ ...draft, theme: mutator(draft.theme) });
  }

  function updateSelectedProducts(id: string, selected: boolean) {
    const ids = selected
      ? [...new Set([...draft.selectedProductIds, id])]
      : draft.selectedProductIds.filter((candidate) => candidate !== id);
    commitDraft({ ...draft, selectedProductIds: ids });
  }

  function generatedEntityId(type = "section") {
    return `${type}-${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
  }

  const width =
    device === "mobile"
      ? "max-w-[390px]"
      : device === "tablet"
        ? "max-w-[760px]"
        : "max-w-[1180px]";

  return (
    <div
      data-storefront-studio="v2"
      className="flex h-full min-h-0 flex-col overflow-hidden border bg-muted/20"
      dir={dir}
    >
      <header className="flex min-h-14 flex-wrap items-center gap-2 border-b bg-background px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{draft.name}</div>
          <div className="truncate text-[11px] text-muted-foreground">
            {t("storefront.studio.homePage", {
              template: draft.theme.template,
            })}
          </div>
        </div>

        <label className="inline-flex min-h-9 items-center gap-2 rounded-lg border px-2.5 text-[11px] font-medium">
          <input
            type="checkbox"
            checked={draft.isActive}
            onChange={(event) =>
              commitDraft({ ...draft, isActive: event.target.checked })
            }
          />
          <span>
            {draft.isActive ? t("storefront.active") : t("storefront.inactive")}
          </span>
        </label>

        <div
          className="flex rounded-lg border p-0.5"
          aria-label={t("storefront.studio.previewDevice")}
        >
          <DeviceButton
            id="desktop"
            label={t("storefront.studio.device.desktop")}
            active={device === "desktop"}
            onClick={setDevice}
            icon={<Monitor />}
          />
          <DeviceButton
            id="tablet"
            label={t("storefront.studio.device.tablet")}
            active={device === "tablet"}
            onClick={setDevice}
            icon={<Tablet />}
          />
          <DeviceButton
            id="mobile"
            label={t("storefront.studio.device.mobile")}
            active={device === "mobile"}
            onClick={setDevice}
            icon={<Smartphone />}
          />
        </div>

        <ToolbarButton
          label={t("storefront.studio.undo")}
          disabled={history.past.length === 0}
          onClick={() => setHistory(undoStorefrontStudioHistory)}
        >
          <Undo2 />
        </ToolbarButton>
        <ToolbarButton
          label={t("storefront.studio.redo")}
          disabled={history.future.length === 0}
          onClick={() => setHistory(redoStorefrontStudioHistory)}
        >
          <Redo2 />
        </ToolbarButton>

        <SaveStatus state={saveState} dirty={dirty} savedAt={savedAt} />

        <button
          type="button"
          onClick={() => {
            const result = storefrontStudioDraftSchema.safeParse(draft);
            setMessage(
              result.success
                ? t("storefront.studio.validDraft")
                : result.error.issues[0]?.message ??
                    t("storefront.studio.validationFailed"),
            );
          }}
          className="min-h-9 rounded-lg border px-3 text-xs font-medium hover:bg-muted"
        >
          {t("storefront.studio.validate")}
        </button>
        <button
          type="button"
          disabled={
            !dirty || saveState === "saving" || saveState === "conflict"
          }
          onClick={() => void persist(draft, true)}
          className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50"
        >
          <Save className="size-3.5" />
          {t("storefront.builder.save")}
        </button>
        <button
          type="button"
          disabled={
            dirty ||
            !version ||
            saveState === "saving" ||
            saveState === "conflict"
          }
          onClick={() => void publish()}
          className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-primary px-3 text-xs font-semibold text-primary hover:bg-primary/10 disabled:opacity-50"
        >
          <Cloud className="size-3.5" />
          {t("storefront.studio.publish")}
        </button>
      </header>

      {conflict ? (
        <div className="flex flex-wrap items-center gap-3 border-b border-warning/30 bg-warning/8 px-4 py-2 text-xs">
          <AlertTriangle className="size-4 text-warning" />
          <span className="flex-1">{t("storefront.studio.conflictNotice")}</span>
          <button
            type="button"
            onClick={acceptServerDraft}
            className="rounded-md border px-2 py-1 font-medium"
          >
            {t("storefront.studio.useSavedVersion")}
          </button>
          <button
            type="button"
            onClick={keepLocalDraft}
            className="rounded-md bg-foreground px-2 py-1 font-medium text-background"
          >
            {t("storefront.studio.keepChanges")}
          </button>
        </div>
      ) : null}

      {message ? (
        <div
          className="border-b bg-background px-4 py-2 text-xs text-muted-foreground"
          role="status"
        >
          {message}
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_288px]">
        <aside className="min-h-0 overflow-y-auto border-e bg-background">
          <nav
            className="grid grid-cols-2 gap-1 border-b p-2"
            aria-label={t("storefront.studio.panelsLabel")}
          >
            {PANELS.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={panel === item.id}
                onClick={() => setPanel(item.id)}
                className={cn(
                  "min-h-9 rounded-lg px-2 text-start text-[11px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                  panel === item.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {t(item.labelKey)}
              </button>
            ))}
          </nav>

          <div className="p-3">
            {panel === "sections" ? (
              <SectionTree
                sections={sections}
                selected={selectedSectionId}
                onSelect={(id) => {
                  setSelectedSectionId(id);
                  setPanel("sections");
                }}
                onMove={(id, direction) =>
                  commitDraft(moveStorefrontSection(draft, id, direction))
                }
                onReorder={(id, targetIndex) =>
                  commitDraft(
                    reorderStorefrontSection(draft, id, targetIndex),
                  )
                }
                onToggle={(id) =>
                  commitDraft(toggleStorefrontSection(draft, id))
                }
                onDuplicate={(id) => {
                  const nextId = generatedEntityId("section");
                  commitDraft(duplicateStorefrontSection(draft, id, nextId));
                  setSelectedSectionId(nextId);
                }}
                onDelete={(id) => {
                  const next = deleteStorefrontSection(draft, id);
                  commitDraft(next);
                  if (selectedSectionId === id) {
                    setSelectedSectionId(
                      next.theme.builder.composition.sections[0]?.id ?? null,
                    );
                  }
                }}
                onAdd={(type) => {
                  const id = generatedEntityId(type);
                  commitDraft(addStorefrontSection(draft, id, type));
                  setSelectedSectionId(id);
                  setPanel("sections");
                }}
              />
            ) : null}

            {panel === "theme" ? (
              <div className="space-y-5">
                <TemplateGallery
                  value={draft.theme.template}
                  onChange={(template) =>
                    updateTheme((theme) =>
                      switchStorefrontTemplate(theme, template),
                    )
                  }
                />
                <GlobalDesignPanel draft={draft} commit={commitDraft} />
              </div>
            ) : null}

            {panel === "products" ? (
              <ProductPicker
                products={products}
                selected={draft.selectedProductIds}
                onChange={updateSelectedProducts}
              />
            ) : null}

            {panel === "checkout" ? (
              <ShippingRulesPanel draft={draft} commit={commitDraft} />
            ) : null}

            {panel === "contact" ? (
              <ContactPanel draft={draft} commit={commitDraft} />
            ) : null}

            {panel === "seo" ? (
              <SeoPanel draft={draft} commit={commitDraft} />
            ) : null}
          </div>
        </aside>

        <main className="flex min-h-0 justify-center overflow-auto bg-muted/25 p-4 md:p-5">
          <div
            className={`w-full ${width} self-start overflow-hidden rounded-xl border bg-background shadow-lg transition-[max-width]`}
          >
            <SaharaPreview
              draft={draft}
              products={products}
              selectedSectionId={selectedSectionId}
              onInspectSection={(id) => {
                setSelectedSectionId(id);
                setPanel("sections");
              }}
            />
          </div>
        </main>

        <aside className="min-h-0 overflow-y-auto border-s bg-background p-4 max-xl:hidden">
          <SectionInspector
            draft={draft}
            selectedSection={selectedSection}
            commit={commitDraft}
            createId={generatedEntityId}
          />
        </aside>
      </div>
    </div>
  );
}

function ShippingRulesPanel({
  draft,
  commit,
}: {
  draft: StorefrontStudioDraft;
  commit: (draft: StorefrontStudioDraft) => void;
}) {
  const { t } = useI18n();
  const rules = draft.theme.builder.shippingRules;
  const setRules = (shippingRules: typeof rules) =>
    commit({
      ...draft,
      theme: {
        ...draft.theme,
        builder: { ...draft.theme.builder, shippingRules },
      },
    });

  function addRule() {
    for (let code = 1; code <= 69; code += 1) {
      const wilayaCode = String(code).padStart(2, "0");
      for (const deliveryMode of ["home", "desk"] as const) {
        if (
          !rules.some(
            (rule) =>
              rule.wilayaCode === wilayaCode &&
              rule.deliveryMode === deliveryMode,
          )
        ) {
          setRules([...rules, { wilayaCode, deliveryMode, feeDzd: 0 }]);
          return;
        }
      }
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-xs font-semibold">
          {t("storefront.studio.shippingRules")}
        </h2>
        <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
          {t("storefront.studio.checkoutGuidance")}
        </p>
      </div>

      {rules.length === 0 ? (
        <p className="rounded-lg border border-dashed p-3 text-[11px] text-muted-foreground">
          {t("storefront.studio.shippingEmpty")}
        </p>
      ) : null}

      {rules.map((rule, index) => (
        <div
          key={`${rule.wilayaCode}:${rule.deliveryMode}:${index}`}
          className="space-y-2 rounded-lg border p-2"
        >
          <Field label={t("storefront.studio.wilayaCode")}>
            <input
              value={rule.wilayaCode}
              inputMode="numeric"
              maxLength={2}
              onChange={(event) => {
                const wilayaCode = event.target.value
                  .replace(/\D/g, "")
                  .slice(0, 2);
                setRules(
                  rules.map((candidate, candidateIndex) =>
                    candidateIndex === index
                      ? { ...candidate, wilayaCode }
                      : candidate,
                  ),
                );
              }}
            />
          </Field>
          <SelectField
            label={t("storefront.studio.deliveryMode")}
            value={rule.deliveryMode}
            values={["home", "desk"]}
            onChange={(deliveryMode) =>
              setRules(
                rules.map((candidate, candidateIndex) =>
                  candidateIndex === index
                    ? {
                        ...candidate,
                        deliveryMode: deliveryMode as "home" | "desk",
                      }
                    : candidate,
                ),
              )
            }
          />
          <Field label={t("storefront.studio.deliveryFee")}>
            <input
              type="number"
              min={0}
              max={100000}
              step={50}
              value={rule.feeDzd}
              onChange={(event) =>
                setRules(
                  rules.map((candidate, candidateIndex) =>
                    candidateIndex === index
                      ? {
                          ...candidate,
                          feeDzd: Math.max(
                            0,
                            Math.min(100000, Number(event.target.value) || 0),
                          ),
                        }
                      : candidate,
                  ),
                )
              }
            />
          </Field>
          <button
            type="button"
            onClick={() =>
              setRules(
                rules.filter((_, candidateIndex) => candidateIndex !== index),
              )
            }
            className="text-[11px] font-medium text-destructive"
          >
            {t("storefront.studio.removeDeliveryRule")}
          </button>
        </div>
      ))}

      <button
        type="button"
        disabled={rules.length >= 138}
        onClick={addRule}
        className="min-h-9 w-full rounded-lg border px-3 text-xs font-medium hover:bg-muted disabled:opacity-40"
      >
        {t("storefront.studio.addDeliveryRule")}
      </button>
    </div>
  );
}

function ContactPanel({
  draft,
  commit,
}: {
  draft: StorefrontStudioDraft;
  commit: (draft: StorefrontStudioDraft) => void;
}) {
  const { t } = useI18n();
  const contact = draft.theme.builder.contact;
  const setContact = (patch: Partial<typeof contact>) =>
    commit({
      ...draft,
      theme: {
        ...draft.theme,
        builder: {
          ...draft.theme.builder,
          contact: { ...contact, ...patch },
        },
      },
    });

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-xs font-semibold">
          {t("storefront.builder.contactInfo")}
        </h2>
        <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
          {t("storefront.builder.contactInfoDesc")}
        </p>
      </div>
      <Field label={t("storefront.builder.phone")}>
        <input
          dir="ltr"
          value={contact.phone}
          maxLength={64}
          onChange={(event) => setContact({ phone: event.target.value })}
        />
      </Field>
      <Field label={t("storefront.builder.whatsapp")}>
        <input
          dir="ltr"
          value={contact.whatsapp}
          maxLength={64}
          onChange={(event) => setContact({ whatsapp: event.target.value })}
        />
      </Field>
      <Field label={t("storefront.builder.email")}>
        <input
          dir="ltr"
          type="email"
          value={contact.email}
          maxLength={254}
          onChange={(event) => setContact({ email: event.target.value })}
        />
      </Field>
      <Field label={t("storefront.builder.address")}>
        <input
          value={contact.address}
          maxLength={240}
          onChange={(event) => setContact({ address: event.target.value })}
        />
      </Field>
    </div>
  );
}

function GlobalDesignPanel({
  draft,
  commit,
}: {
  draft: StorefrontStudioDraft;
  commit: (draft: StorefrontStudioDraft) => void;
}) {
  const { t, locale } = useI18n();
  const c = useStorefrontContentCopy(locale);
  const theme = draft.theme;
  const patchTheme = (patch: Partial<StorefrontStudioDraft["theme"]>) =>
    commit({ ...draft, theme: { ...theme, ...patch } });

  return (
    <div className="space-y-4 border-t pt-4">
      <div>
        <h2 className="text-xs font-semibold">{c("globalDesign")}</h2>
      </div>
      <Field label={t("storefront.builder.shopName")}>
        <input
          value={draft.name}
          maxLength={100}
          onChange={(event) => commit({ ...draft, name: event.target.value })}
        />
      </Field>
      <Field label={t("storefront.builder.description")}>
        <textarea
          value={draft.description}
          maxLength={500}
          rows={3}
          onChange={(event) =>
            commit({ ...draft, description: event.target.value })
          }
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <ColorField
          label={t("storefront.studio.color.primary")}
          value={theme.primaryColor}
          onChange={(primaryColor) => patchTheme({ primaryColor })}
        />
        <ColorField
          label={t("storefront.studio.color.accent")}
          value={theme.accentColor}
          onChange={(accentColor) => patchTheme({ accentColor })}
        />
        <ColorField
          label={t("storefront.studio.color.background")}
          value={theme.backgroundColor}
          onChange={(backgroundColor) => patchTheme({ backgroundColor })}
        />
        <ColorField
          label={t("storefront.studio.color.surface")}
          value={theme.surfaceColor}
          onChange={(surfaceColor) => patchTheme({ surfaceColor })}
        />
        <ColorField
          label={t("storefront.studio.color.text")}
          value={theme.textColor}
          onChange={(textColor) => patchTheme({ textColor })}
        />
      </div>
      <SelectField
        label={t("storefront.studio.cardStyle")}
        value={theme.catalog.cardStyle}
        values={["minimal", "elevated", "outlined"]}
        onChange={(cardStyle) =>
          patchTheme({
            catalog: {
              ...theme.catalog,
              cardStyle: cardStyle as typeof theme.catalog.cardStyle,
            },
          })
        }
      />
      <SelectField
        label={t("storefront.studio.imageRatio")}
        value={theme.catalog.imageRatio}
        values={["square", "portrait", "landscape"]}
        onChange={(imageRatio) =>
          patchTheme({
            catalog: {
              ...theme.catalog,
              imageRatio: imageRatio as typeof theme.catalog.imageRatio,
            },
          })
        }
      />
    </div>
  );
}

function SectionInspector({
  draft,
  selectedSection,
  commit,
  createId,
}: {
  draft: StorefrontStudioDraft;
  selectedSection: StorefrontSection | null;
  commit: (draft: StorefrontStudioDraft) => void;
  createId: (type?: string) => string;
}) {
  const { t, locale } = useI18n();
  const c = useStorefrontContentCopy(locale);
  const theme = draft.theme;

  if (!selectedSection) {
    return (
      <div className="flex min-h-56 flex-col items-center justify-center text-center text-muted-foreground">
        <p className="max-w-52 text-xs leading-5">{c("contentHint")}</p>
      </div>
    );
  }

  const section = selectedSection;
  const sectionSetting = (key: string) => {
    const value = section.settings[key];
    return typeof value === "string" ? value : "";
  };
  const patchSection = (patch: StorefrontSection["settings"]) =>
    commit(patchStorefrontSectionSettings(draft, section.id, patch));
  const patchTheme = (patch: Partial<StorefrontStudioDraft["theme"]>) =>
    commit({ ...draft, theme: { ...theme, ...patch } });

  return (
    <div className="space-y-5">
      <div className="border-b pb-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t("storefront.studio.inspector")}
        </p>
        <h2 className="mt-1 text-sm font-semibold">
          {t(SECTION_LABEL_KEYS[section.type])}
        </h2>
      </div>

      {section.type === "announcement" ? (
        <InspectorGroup title={t(SECTION_LABEL_KEYS.announcement)}>
          <Toggle
            label={t("storefront.studio.section.announcement")}
            checked={theme.announcement.enabled}
            onChange={(enabled) =>
              patchTheme({
                announcement: { ...theme.announcement, enabled },
              })
            }
          />
          <Field label={c("announcementText")}>
            <input
              value={theme.announcement.text}
              maxLength={160}
              onChange={(event) =>
                patchTheme({
                  announcement: {
                    ...theme.announcement,
                    text: event.target.value,
                  },
                })
              }
            />
          </Field>
        </InspectorGroup>
      ) : null}

      {section.type === "hero" ? (
        <InspectorGroup title={t("storefront.studio.section.hero")}>
          <Field label={t("storefront.studio.eyebrow")}>
            <input
              value={theme.hero.eyebrow}
              maxLength={80}
              onChange={(event) =>
                patchTheme({
                  hero: { ...theme.hero, eyebrow: event.target.value },
                })
              }
            />
          </Field>
          <Field label={t("storefront.studio.headline")}>
            <input
              value={theme.hero.headline}
              maxLength={140}
              onChange={(event) =>
                patchTheme({
                  hero: { ...theme.hero, headline: event.target.value },
                })
              }
            />
          </Field>
          <Field label={t("storefront.studio.body")}>
            <textarea
              value={theme.hero.body}
              maxLength={320}
              rows={4}
              onChange={(event) =>
                patchTheme({
                  hero: { ...theme.hero, body: event.target.value },
                })
              }
            />
          </Field>
          <Field label={t("storefront.studio.ctaLabel")}>
            <input
              value={theme.hero.ctaLabel}
              maxLength={60}
              onChange={(event) =>
                patchTheme({
                  hero: { ...theme.hero, ctaLabel: event.target.value },
                })
              }
            />
          </Field>
          <SelectField
            label={t("storefront.studio.heroLayout")}
            value={theme.hero.style}
            values={["editorial", "split", "centered"]}
            onChange={(style) =>
              patchTheme({
                hero: {
                  ...theme.hero,
                  style: style as typeof theme.hero.style,
                },
              })
            }
          />
        </InspectorGroup>
      ) : null}

      {section.type === "featured-products" ||
      section.type === "product-grid" ||
      section.type === "categories" ? (
        <InspectorGroup title={t(SECTION_LABEL_KEYS[section.type])}>
          <Field label={c("sectionTitle")}>
            <input
              value={sectionSetting("title")}
              maxLength={120}
              onChange={(event) => patchSection({ title: event.target.value })}
            />
          </Field>
          {section.type !== "categories" ? (
            <>
              <Toggle
                label={t("storefront.builder.showPrices")}
                checked={theme.showPrices}
                onChange={(showPrices) => patchTheme({ showPrices })}
              />
              <Toggle
                label={t("storefront.builder.showStock")}
                checked={theme.showStock}
                onChange={(showStock) => patchTheme({ showStock })}
              />
            </>
          ) : null}
        </InspectorGroup>
      ) : null}

      {section.type === "media" ? (
        <InspectorGroup title={t(SECTION_LABEL_KEYS.media)}>
          <Field label={c("mediaEyebrow")}>
            <input
              value={sectionSetting("eyebrow")}
              maxLength={80}
              onChange={(event) => patchSection({ eyebrow: event.target.value })}
            />
          </Field>
          <Field label={c("mediaTitle")}>
            <input
              value={sectionSetting("title")}
              maxLength={140}
              onChange={(event) => patchSection({ title: event.target.value })}
            />
          </Field>
          <Field label={c("mediaBody")}>
            <textarea
              value={sectionSetting("body")}
              maxLength={1000}
              rows={5}
              onChange={(event) => patchSection({ body: event.target.value })}
            />
          </Field>
          <Field label={c("mediaImageUrl")}>
            <input
              dir="ltr"
              type="url"
              value={sectionSetting("imageUrl")}
              maxLength={2000}
              placeholder="https://"
              onChange={(event) => patchSection({ imageUrl: event.target.value })}
            />
          </Field>
          <Field label={c("mediaImageAlt")}>
            <input
              value={sectionSetting("imageAlt")}
              maxLength={240}
              onChange={(event) => patchSection({ imageAlt: event.target.value })}
            />
          </Field>
          <label className="block space-y-1 text-[11px] font-medium text-muted-foreground">
            <span>{c("mediaAlignment")}</span>
            <select
              value={sectionSetting("align") || "split"}
              onChange={(event) => patchSection({ align: event.target.value })}
              className="min-h-9 w-full rounded-lg border bg-background px-2.5 text-xs text-foreground"
            >
              <option value="split">{c("mediaStart")}</option>
              <option value="media-end">{c("mediaEnd")}</option>
            </select>
          </label>
        </InspectorGroup>
      ) : null}

      {section.type === "testimonials" ? (
        <InspectorGroup title={t(SECTION_LABEL_KEYS.testimonials)}>
          <Field label={c("sectionTitle")}>
            <input
              value={sectionSetting("title")}
              maxLength={120}
              onChange={(event) => patchSection({ title: event.target.value })}
            />
          </Field>
          <div className="space-y-3">
            {section.blocks.map((block, index) => (
              <div key={block.id} className="space-y-2 rounded-xl border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold tabular-nums text-muted-foreground">
                    {index + 1}
                  </span>
                  <button
                    type="button"
                    aria-label={c("removeItem")}
                    title={c("removeItem")}
                    onClick={() =>
                      commit(
                        deleteStorefrontBlock(draft, section.id, block.id),
                      )
                    }
                    className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
                <Field label={c("testimonialQuote")}>
                  <textarea
                    value={blockString(block.settings.quote)}
                    maxLength={1000}
                    rows={3}
                    onChange={(event) =>
                      commit(
                        patchStorefrontBlockSettings(
                          draft,
                          section.id,
                          block.id,
                          { quote: event.target.value },
                        ),
                      )
                    }
                  />
                </Field>
                <Field label={c("testimonialName")}>
                  <input
                    value={blockString(block.settings.name)}
                    maxLength={120}
                    onChange={(event) =>
                      commit(
                        patchStorefrontBlockSettings(
                          draft,
                          section.id,
                          block.id,
                          { name: event.target.value },
                        ),
                      )
                    }
                  />
                </Field>
                <Field label={c("testimonialRole")}>
                  <input
                    value={blockString(block.settings.role)}
                    maxLength={160}
                    onChange={(event) =>
                      commit(
                        patchStorefrontBlockSettings(
                          draft,
                          section.id,
                          block.id,
                          { role: event.target.value },
                        ),
                      )
                    }
                  />
                </Field>
              </div>
            ))}
            <button
              type="button"
              disabled={section.blocks.length >= 50}
              onClick={() =>
                commit(
                  addStorefrontBlock(draft, section.id, {
                    id: createId("testimonial"),
                    type: "testimonial",
                    settings: { quote: "", name: "", role: "" },
                  }),
                )
              }
              className="flex min-h-9 w-full items-center justify-center gap-2 rounded-lg border border-dashed text-xs font-semibold text-muted-foreground hover:border-primary/40 hover:text-foreground disabled:opacity-40"
            >
              <Plus className="size-3.5" />
              {c("addTestimonial")}
            </button>
          </div>
        </InspectorGroup>
      ) : null}

      {section.type === "faq" ? (
        <InspectorGroup title={t(SECTION_LABEL_KEYS.faq)}>
          <Field label={c("sectionTitle")}>
            <input
              value={sectionSetting("title")}
              maxLength={120}
              onChange={(event) => patchSection({ title: event.target.value })}
            />
          </Field>
          <div className="space-y-3">
            {section.blocks.map((block, index) => (
              <div key={block.id} className="space-y-2 rounded-xl border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold tabular-nums text-muted-foreground">
                    {index + 1}
                  </span>
                  <button
                    type="button"
                    aria-label={c("removeItem")}
                    title={c("removeItem")}
                    onClick={() =>
                      commit(
                        deleteStorefrontBlock(draft, section.id, block.id),
                      )
                    }
                    className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
                <Field label={c("faqQuestion")}>
                  <input
                    value={blockString(block.settings.question)}
                    maxLength={240}
                    onChange={(event) =>
                      commit(
                        patchStorefrontBlockSettings(
                          draft,
                          section.id,
                          block.id,
                          { question: event.target.value },
                        ),
                      )
                    }
                  />
                </Field>
                <Field label={c("faqAnswer")}>
                  <textarea
                    value={blockString(block.settings.answer)}
                    maxLength={1600}
                    rows={4}
                    onChange={(event) =>
                      commit(
                        patchStorefrontBlockSettings(
                          draft,
                          section.id,
                          block.id,
                          { answer: event.target.value },
                        ),
                      )
                    }
                  />
                </Field>
              </div>
            ))}
            <button
              type="button"
              disabled={section.blocks.length >= 50}
              onClick={() =>
                commit(
                  addStorefrontBlock(draft, section.id, {
                    id: createId("faq"),
                    type: "faq",
                    settings: { question: "", answer: "" },
                  }),
                )
              }
              className="flex min-h-9 w-full items-center justify-center gap-2 rounded-lg border border-dashed text-xs font-semibold text-muted-foreground hover:border-primary/40 hover:text-foreground disabled:opacity-40"
            >
              <Plus className="size-3.5" />
              {c("addFaq")}
            </button>
          </div>
        </InspectorGroup>
      ) : null}

      {section.type === "cod-checkout" ? (
        <InspectorGroup title={t("storefront.studio.section.codCheckout")}>
          <SelectField
            label={t("storefront.studio.checkoutLayout")}
            value={theme.checkout.layout}
            values={["drawer", "sticky", "inline"]}
            onChange={(layout) =>
              patchTheme({
                checkout: {
                  ...theme.checkout,
                  layout: layout as typeof theme.checkout.layout,
                },
              })
            }
          />
          <Toggle
            label={t("storefront.studio.showCodPromise")}
            checked={theme.checkout.showCodPromise}
            onChange={(showCodPromise) =>
              patchTheme({
                checkout: { ...theme.checkout, showCodPromise },
              })
            }
          />
          <Field label={t("storefront.studio.codPromise")}>
            <textarea
              value={theme.checkout.codPromiseText}
              maxLength={180}
              rows={3}
              onChange={(event) =>
                patchTheme({
                  checkout: {
                    ...theme.checkout,
                    codPromiseText: event.target.value,
                  },
                })
              }
            />
          </Field>
        </InspectorGroup>
      ) : null}

      {section.type === "trust" ? (
        <InspectorGroup title={t("storefront.studio.section.trust")}>
          <Toggle
            label={t("storefront.studio.cashOnDelivery")}
            checked={theme.trust.showCodBadge}
            onChange={(showCodBadge) =>
              patchTheme({
                trust: { ...theme.trust, showCodBadge },
              })
            }
          />
          <Toggle
            label={t("storefront.studio.phoneConfirmation")}
            checked={theme.trust.showPhoneConfirmationBadge}
            onChange={(showPhoneConfirmationBadge) =>
              patchTheme({
                trust: { ...theme.trust, showPhoneConfirmationBadge },
              })
            }
          />
          <Toggle
            label={t("storefront.studio.delivery")}
            checked={theme.trust.showDeliveryBadge}
            onChange={(showDeliveryBadge) =>
              patchTheme({
                trust: { ...theme.trust, showDeliveryBadge },
              })
            }
          />
          <Toggle
            label={t("storefront.studio.support")}
            checked={theme.trust.showSupportBadge}
            onChange={(showSupportBadge) =>
              patchTheme({
                trust: { ...theme.trust, showSupportBadge },
              })
            }
          />
        </InspectorGroup>
      ) : null}

      {section.type === "support" ? (
        <ContactPanel draft={draft} commit={commit} />
      ) : null}

      {section.type === "footer" ? (
        <InspectorGroup title={t(SECTION_LABEL_KEYS.footer)}>
          <Field label={c("footerTagline")}>
            <input
              value={sectionSetting("tagline")}
              maxLength={240}
              onChange={(event) => patchSection({ tagline: event.target.value })}
            />
          </Field>
        </InspectorGroup>
      ) : null}

      {section.type === "navbar" ? (
        <p className="rounded-lg border border-dashed p-3 text-xs leading-5 text-muted-foreground">
          {c("contentHint")}
        </p>
      ) : null}
    </div>
  );
}

function SeoPanel({
  draft,
  commit,
}: {
  draft: StorefrontStudioDraft;
  commit: (draft: StorefrontStudioDraft) => void;
}) {
  const { t } = useI18n();
  const seo = draft.theme.builder.seo;
  const setSeo = (patch: Partial<typeof seo>) =>
    commit({
      ...draft,
      theme: {
        ...draft.theme,
        builder: {
          ...draft.theme.builder,
          seo: { ...seo, ...patch },
        },
      },
    });

  return (
    <div className="space-y-3">
      <Field label={t("storefront.studio.seoTitle")}>
        <input
          value={seo.title}
          maxLength={120}
          onChange={(event) => setSeo({ title: event.target.value })}
        />
      </Field>
      <Field label={t("storefront.studio.seoDescription")}>
        <textarea
          value={seo.description}
          maxLength={320}
          rows={4}
          onChange={(event) => setSeo({ description: event.target.value })}
        />
      </Field>
      <Toggle
        label={t("storefront.studio.hideFromSearch")}
        checked={seo.noIndex}
        onChange={(noIndex) => setSeo({ noIndex })}
      />
      <div className="rounded-lg border p-2 text-[11px] leading-4 text-muted-foreground">
        <Cloud className="mb-1 size-4" />
        {t("storefront.studio.domainAuthority")}
      </div>
    </div>
  );
}

function ProductPicker({
  products,
  selected,
  onChange,
}: {
  products: StorefrontStudioProduct[];
  selected: readonly string[];
  onChange: (id: string, selected: boolean) => void;
}) {
  const { t } = useI18n();
  if (products.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        {t("storefront.builder.noActiveProducts")}
      </p>
    );
  }

  return (
    <div className="space-y-1">
      {products.map((product) => (
        <label
          key={product.id}
          className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-xs hover:bg-muted"
        >
          <input
            type="checkbox"
            checked={selected.includes(product.id)}
            onChange={(event) => onChange(product.id, event.target.checked)}
          />
          <span className="min-w-0 flex-1 truncate">{product.name}</span>
          <span className="text-[10px] text-muted-foreground">
            {t("storefront.studio.stockCount", { count: product.stock })}
          </span>
        </label>
      ))}
    </div>
  );
}

function SaveStatus({
  state,
  dirty,
  savedAt,
}: {
  state: SaveState;
  dirty: boolean;
  savedAt: Date | null;
}) {
  const { t, locale } = useI18n();
  const time = savedAt?.toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
  });
  const label =
    state === "saving"
      ? t("storefront.studio.saving")
      : state === "conflict"
        ? t("storefront.studio.conflict")
        : state === "error"
          ? t("storefront.studio.saveFailed")
          : dirty
            ? t("storefront.studio.unsaved")
            : time
              ? t("storefront.studio.savedAt", { time })
              : t("storefront.studio.saved");

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 text-[11px]",
        state === "error" || state === "conflict"
          ? "text-destructive"
          : "text-muted-foreground",
      )}
    >
      {state === "saved" && !dirty ? (
        <CheckCircle2 className="size-3.5" />
      ) : (
        <Cloud className="size-3.5" />
      )}
      {label}
    </div>
  );
}

function DeviceButton({
  id,
  label,
  active,
  onClick,
  icon,
}: {
  id: StorefrontStudioDevice;
  label: string;
  active: boolean;
  onClick: (id: StorefrontStudioDevice) => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={() => onClick(id)}
      className={cn(
        "flex size-8 items-center justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-3.5",
        active
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
    >
      {icon}
    </button>
  );
}

function ToolbarButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-9 items-center justify-center rounded-lg border text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-30 [&_svg]:size-3.5"
    >
      {children}
    </button>
  );
}

function InspectorGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="space-y-3">
      <legend className="mb-2 text-xs font-semibold">{title}</legend>
      {children}
    </fieldset>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1 text-[11px] font-medium text-muted-foreground">
      <span>{label}</span>
      <div className="[&_input]:min-h-9 [&_input]:w-full [&_input]:rounded-lg [&_input]:border [&_input]:bg-background [&_input]:px-2.5 [&_input]:text-xs [&_input]:text-foreground [&_textarea]:w-full [&_textarea]:resize-y [&_textarea]:rounded-lg [&_textarea]:border [&_textarea]:bg-background [&_textarea]:px-2.5 [&_textarea]:py-2 [&_textarea]:text-xs [&_textarea]:text-foreground">
        {children}
      </div>
    </label>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1 text-[10px] font-medium text-muted-foreground">
      <span>{label}</span>
      <span className="flex min-h-9 items-center gap-1 rounded-lg border p-1">
        <input
          type="color"
          aria-label={label}
          value={value}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
          className="h-7 w-7 cursor-pointer border-0 bg-transparent"
        />
        <span dir="ltr" className="truncate text-[10px] text-foreground">
          {value}
        </span>
      </span>
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex min-h-9 cursor-pointer items-center justify-between gap-3 text-xs">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  values,
  onChange,
}: {
  label: string;
  value: string;
  values: readonly string[];
  onChange: (value: string) => void;
}) {
  const { t } = useI18n();
  return (
    <label className="block space-y-1 text-[11px] font-medium text-muted-foreground">
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-9 w-full rounded-lg border bg-background px-2.5 text-xs capitalize text-foreground"
      >
        {values.map((candidate) => (
          <option key={candidate} value={candidate}>
            {t(`storefront.studio.option.${candidate}`)}
          </option>
        ))}
      </select>
    </label>
  );
}

function useStorefrontContentCopy(locale: string) {
  const normalized = (
    locale.startsWith("ar") ? "ar" : locale.startsWith("en") ? "en" : "fr"
  ) as StorefrontStudioContentLocale;
  return (key: StorefrontStudioContentKey) =>
    getStorefrontStudioContentCopy(normalized, key);
}

function blockString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function dateIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
