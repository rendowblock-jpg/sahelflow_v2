"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

import { useI18n } from "@/hooks/use-i18n";
import type { StorefrontStudioConfig } from "@/lib/storefront/service";
import {
  addStorefrontSection,
  createStorefrontStudioDraft,
  deleteStorefrontSection,
  duplicateStorefrontSection,
  moveStorefrontSection,
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
import { cn } from "@/lib/utils";

import { SectionInspector } from "./section-inspector";
import { SectionTree } from "./section-tree";
import { StudioCanvas } from "./studio-canvas";
import { PanelHeader } from "./studio-controls";
import { ProductsPanel, ThemePanel } from "./studio-design-panels";
import { StudioRail, type StudioPanel } from "./studio-rail";
import { CheckoutPanel, ContactPanel, SeoPanel } from "./studio-settings-panels";
import { StudioTopBar, type StudioSaveState } from "./studio-top-bar";
import type { StorefrontStudioDevice, StorefrontStudioProduct } from "./studio-types";

type SerializedConfig = Omit<
  StorefrontStudioConfig,
  "createdAt" | "updatedAt" | "draftUpdatedAt" | "liveUpdatedAt"
> & {
  createdAt: string;
  updatedAt: string;
  draftUpdatedAt: string | null;
  liveUpdatedAt: string;
};

type Notice = { tone: "info" | "success" | "warning"; text: string };

/**
 * Storefront Studio: a three-pane editor (panels · live canvas · inspector).
 * Every edit is an undoable history step, autosaved as a private draft with
 * compare-and-set versioning; buyers only see it after an explicit Publish.
 */
export function StorefrontStudio({
  config,
  products,
}: {
  config: StorefrontStudioConfig;
  products: StorefrontStudioProduct[];
}) {
  const { t, dir, locale } = useI18n();
  const initialDraft = useMemo(() => createStorefrontStudioDraft(config), [config]);
  const [history, setHistory] = useState(() => createStorefrontStudioHistory(initialDraft));
  const [device, setDevice] = useState<StorefrontStudioDevice>("desktop");
  const [panel, setPanel] = useState<StudioPanel>("sections");
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(
    initialDraft.theme.builder.composition.sections[0]?.id ?? null,
  );
  const [reveal, setReveal] = useState<{ id: string; nonce: number } | null>(null);
  const [savedFingerprint, setSavedFingerprint] = useState(() => storefrontDraftFingerprint(initialDraft));
  const [version, setVersion] = useState<string | null>(() =>
    config.draftUpdatedAt ? dateIso(config.draftUpdatedAt) : null,
  );
  const [saveState, setSaveState] = useState<StudioSaveState>("saved");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [conflict, setConflict] = useState<SerializedConfig | null>(null);
  const requestSequence = useRef(0);

  const draft = history.present;
  const fingerprint = storefrontDraftFingerprint(draft);
  const dirty = fingerprint !== savedFingerprint;
  const sections = draft.theme.builder.composition.sections;
  const selectedSection = sections.find((section) => section.id === selectedSectionId) ?? null;
  const setMessage = useCallback(
    (text: string | null, tone: Notice["tone"] = "info") => setNotice(text ? { tone, text } : null),
    [],
  );

  const commitDraft = useCallback((next: StorefrontStudioDraft) => {
    setHistory((current) =>
      storefrontDraftFingerprint(current.present) === storefrontDraftFingerprint(next)
        ? current
        : commitStorefrontStudioHistory(current, next),
    );
    setNotice(null);
    setSaveState((current) => (current === "conflict" || current === "saving" ? current : "pending"));
  }, []);

  const persist = useCallback(
    async (candidate: StorefrontStudioDraft, manual = false) => {
      const parsed = storefrontStudioDraftSchema.safeParse(candidate);
      if (!parsed.success) {
        setSaveState("error");
        setMessage(parsed.error.issues[0]?.message ?? t("storefront.studio.validationFailed"), "warning");
        return;
      }

      const sequence = ++requestSequence.current;
      setSaveState("saving");
      if (manual) setMessage(t("storefront.studio.savingDraft"));

      try {
        const response = await fetch(`/api/storefront/config/${encodeURIComponent(config.id)}`, {
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
        });
        const body = (await response.json()) as { error?: string; config?: SerializedConfig };

        if (sequence !== requestSequence.current) return;
        if (response.status === 409 && body.config) {
          setConflict(body.config);
          setSaveState("conflict");
          setMessage(t("storefront.studio.newerDraft"), "warning");
          return;
        }
        if (!response.ok || !body.config) {
          throw new Error(body.error ?? t("storefront.studio.saveFailed"));
        }

        setVersion(body.config.draftUpdatedAt);
        setSavedFingerprint(storefrontDraftFingerprint(candidate));
        setSavedAt(new Date());
        setSaveState("saved");
        if (manual) setMessage(t("storefront.studio.draftSaved"), "success");
      } catch {
        if (sequence !== requestSequence.current) return;
        setSaveState("error");
        setMessage(t("storefront.studio.localDraftRetained"), "warning");
      }
    },
    [config.id, setMessage, t, version],
  );

  const publish = useCallback(async () => {
    if (draft.isActive && draft.theme.builder.shippingRules.length === 0) {
      setPanel("checkout");
      setPanelCollapsed(false);
      setMessage(t("storefront.studio.shippingEmpty"), "warning");
      return;
    }
    if (!version || dirty || saveState === "saving" || saveState === "conflict") {
      setMessage(t("storefront.studio.saveBeforePublishing"), "warning");
      return;
    }

    const sequence = ++requestSequence.current;
    setSaveState("saving");
    setMessage(t("storefront.studio.publishing"));

    try {
      const response = await fetch(`/api/storefront/config/${encodeURIComponent(config.id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedDraftUpdatedAt: version,
          locale: locale.startsWith("fr") ? "fr" : locale.startsWith("en") ? "en" : "ar",
        }),
      });
      const body = (await response.json()) as { error?: string; config?: SerializedConfig };

      if (sequence !== requestSequence.current) return;
      if (response.status === 409 && body.config) {
        setConflict(body.config);
        setVersion(body.config.draftUpdatedAt);
        setSaveState("conflict");
        setMessage(t("storefront.studio.newerDraft"), "warning");
        return;
      }
      if (!response.ok) {
        throw new Error(body.error ?? t("storefront.studio.publishFailed"));
      }

      setSaveState("saved");
      setMessage(
        draft.isActive ? t("storefront.studio.published") : t("storefront.inactive"),
        draft.isActive ? "success" : "info",
      );
    } catch {
      if (sequence !== requestSequence.current) return;
      setSaveState("error");
      setMessage(t("storefront.studio.publishFailed"), "warning");
    }
  }, [config.id, dirty, draft.isActive, draft.theme.builder.shippingRules.length, locale, saveState, setMessage, t, version]);

  // Autosave: a quiet pause after the last edit writes the private draft.
  useEffect(() => {
    if (!dirty || conflict || saveState === "saving" || saveState === "error") return;
    const timer = window.setTimeout(() => void persist(draft), 900);
    return () => window.clearTimeout(timer);
  }, [conflict, dirty, draft, fingerprint, persist, saveState]);

  // Never lose unsaved work to a tab close or reload.
  useEffect(() => {
    if (!dirty) return;
    const guard = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);

  // Keyboard: Ctrl/⌘+Z undo, Ctrl/⌘+Shift+Z or Ctrl+Y redo, Ctrl/⌘+S save.
  // Inside text fields the browser keeps its own text undo.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === "s") {
        event.preventDefault();
        if (dirty && saveState !== "saving" && saveState !== "conflict") void persist(draft, true);
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        setHistory(undoStorefrontStudioHistory);
      } else if ((key === "z" && event.shiftKey) || key === "y") {
        event.preventDefault();
        setHistory(redoStorefrontStudioHistory);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dirty, draft, persist, saveState]);

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
    setMessage(t("storefront.studio.loadedSavedDraft"), "success");
  }

  function keepLocalDraft() {
    if (!conflict) return;
    setVersion(conflict.draftUpdatedAt);
    setConflict(null);
    setSaveState("error");
    setMessage(t("storefront.studio.confirmOverwrite"), "warning");
  }

  function selectSection(id: string, from: "tree" | "canvas") {
    setSelectedSectionId(id);
    setInspectorOpen(true);
    if (from === "tree") setReveal({ id, nonce: Date.now() });
    else if (panel !== "sections") setPanel("sections");
  }

  function selectPanel(next: StudioPanel) {
    if (next === panel) setPanelCollapsed((current) => !current);
    else {
      setPanel(next);
      setPanelCollapsed(false);
    }
  }

  function generatedEntityId(type = "section") {
    return `${type}-${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
  }

  const shippingMissing = draft.isActive && draft.theme.builder.shippingRules.length === 0;

  return (
    <div
      data-storefront-studio="v2"
      className="flex h-full min-h-0 flex-col overflow-hidden bg-background"
      dir={dir}
    >
      <StudioTopBar
        storefrontId={config.id}
        draft={draft}
        liveSlug={config.slug}
        device={device}
        onDevice={setDevice}
        canUndo={history.past.length > 0}
        canRedo={history.future.length > 0}
        onUndo={() => setHistory(undoStorefrontStudioHistory)}
        onRedo={() => setHistory(redoStorefrontStudioHistory)}
        saveState={saveState}
        dirty={dirty}
        savedAt={savedAt}
        onActiveChange={(isActive) => commitDraft({ ...draft, isActive })}
        onValidate={() => {
          const result = storefrontStudioDraftSchema.safeParse(draft);
          setMessage(
            result.success
              ? t("storefront.studio.validDraft")
              : result.error.issues[0]?.message ?? t("storefront.studio.validationFailed"),
            result.success ? "success" : "warning",
          );
        }}
        onSave={() => void persist(draft, true)}
        onPublish={() => void publish()}
        publishDisabled={dirty || !version || saveState === "saving" || saveState === "conflict"}
      />

      {conflict ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 border-b border-warning/30 bg-warning-soft px-4 py-2 text-body-sm"
        >
          <AlertTriangle className="size-4 shrink-0 text-warning" aria-hidden="true" />
          <span className="min-w-0 flex-1">{t("storefront.studio.conflictNotice")}</span>
          <button
            type="button"
            onClick={acceptServerDraft}
            className="h-8 rounded-control border bg-background px-3 font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t("storefront.studio.useSavedVersion")}
          </button>
          <button
            type="button"
            onClick={keepLocalDraft}
            className="h-8 rounded-control bg-foreground px-3 font-medium text-background outline-none hover:bg-foreground/90 focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t("storefront.studio.keepChanges")}
          </button>
        </div>
      ) : null}

      <div data-studio-body="true" className="relative flex min-h-0 flex-1">
        <aside className="flex min-h-0 shrink-0" data-studio-panels="true">
          <StudioRail
            panel={panel}
            collapsed={panelCollapsed}
            onSelect={selectPanel}
            badges={{ checkout: shippingMissing }}
          />
          {panelCollapsed ? null : (
            <div
              data-studio-panel={panel}
              className="w-[272px] shrink-0 min-h-0 overflow-y-auto border-e bg-background px-3 py-4 max-lg:w-[248px]"
            >
              {panel === "sections" ? (
                <>
                  <PanelHeader title={t("storefront.studio.panels.sections")} />
                  <SectionTree
                    sections={sections}
                    selected={selectedSectionId}
                    onSelect={(id) => selectSection(id, "tree")}
                    onMove={(id, direction) => commitDraft(moveStorefrontSection(draft, id, direction))}
                    onReorder={(id, targetIndex) => commitDraft(reorderStorefrontSection(draft, id, targetIndex))}
                    onToggle={(id) => commitDraft(toggleStorefrontSection(draft, id))}
                    onDuplicate={(id) => {
                      const nextId = generatedEntityId("section");
                      commitDraft(duplicateStorefrontSection(draft, id, nextId));
                      setSelectedSectionId(nextId);
                    }}
                    onDelete={(id) => {
                      const next = deleteStorefrontSection(draft, id);
                      commitDraft(next);
                      if (selectedSectionId === id) {
                        setSelectedSectionId(next.theme.builder.composition.sections[0]?.id ?? null);
                      }
                    }}
                    onAdd={(type) => {
                      const id = generatedEntityId(type);
                      commitDraft(addStorefrontSection(draft, id, type));
                      selectSection(id, "tree");
                    }}
                  />
                </>
              ) : null}
              {panel === "theme" ? <ThemePanel draft={draft} commit={commitDraft} /> : null}
              {panel === "products" ? (
                <ProductsPanel
                  products={products}
                  selected={draft.selectedProductIds}
                  onChange={(id, selected) =>
                    commitDraft({
                      ...draft,
                      selectedProductIds: selected
                        ? [...new Set([...draft.selectedProductIds, id])]
                        : draft.selectedProductIds.filter((candidate) => candidate !== id),
                    })
                  }
                  onSetAll={(selectedProductIds) => commitDraft({ ...draft, selectedProductIds })}
                />
              ) : null}
              {panel === "checkout" ? <CheckoutPanel draft={draft} commit={commitDraft} /> : null}
              {panel === "contact" ? <ContactPanel draft={draft} commit={commitDraft} /> : null}
              {panel === "seo" ? <SeoPanel draft={draft} commit={commitDraft} /> : null}
            </div>
          )}
        </aside>

        <main className="relative min-h-0 min-w-0 flex-1">
          <StudioCanvas
            draft={draft}
            products={products}
            device={device}
            selectedSectionId={selectedSectionId}
            revealSectionId={reveal}
            onInspectSection={(id) => selectSection(id, "canvas")}
          />
          {notice ? (
            <div
              role="status"
              className={cn(
                "absolute inset-x-0 bottom-4 mx-auto flex w-fit max-w-[calc(100%-2rem)] items-center gap-2.5 rounded-full border bg-background py-1.5 ps-3 pe-1.5 text-body-sm shadow-(--elevation-3)",
                notice.tone === "warning" && "border-warning/40",
              )}
            >
              {notice.tone === "success" ? (
                <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden="true" />
              ) : notice.tone === "warning" ? (
                <AlertTriangle className="size-4 shrink-0 text-warning" aria-hidden="true" />
              ) : (
                <Info className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              )}
              <span className="min-w-0">{notice.text}</span>
              <button
                type="button"
                aria-label={t("common.close")}
                onClick={() => setNotice(null)}
                className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </div>
          ) : null}
        </main>

        <aside
          data-studio-inspector="true"
          className={cn(
            "min-h-0 w-[300px] shrink-0 overflow-y-auto border-s bg-background p-4",
            "max-xl:absolute max-xl:inset-y-0 max-xl:end-0 max-xl:z-20 max-xl:shadow-(--elevation-3)",
            !inspectorOpen && "max-xl:hidden",
          )}
        >
          <button
            type="button"
            aria-label={t("common.close")}
            onClick={() => setInspectorOpen(false)}
            className="float-end -me-1 -mt-1 flex size-8 items-center justify-center rounded-control text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring xl:hidden"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
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

function dateIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}
