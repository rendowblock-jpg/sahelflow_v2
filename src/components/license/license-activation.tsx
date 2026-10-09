"use client";

import { useRef, useState, type DragEvent, type ReactNode } from "react";
import { FileUp, Loader2, LockKeyhole } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/hooks/use-i18n";
import { useLicense } from "@/hooks/use-license";
import {
  ActivationCodeError,
  LICENSE_FILE_EXTENSION,
  parseActivationInput,
} from "@/lib/license/activation-code";
import {
  activationParseErrorKey,
  activationServerErrorKey,
} from "@/lib/license/activation-errors";
import { toast } from "@/lib/toast";
import { localizeServerMessage } from "@/lib/i18n/localize-server-message";

const MAX_LICENSE_FILE_BYTES = 64 * 1024;

type ActivationOutcome = "activated" | "needs_pin" | "failed";

/**
 * The two licence mutations, shared by the Settings panel and the first-run
 * lockout. Each refreshes the client entitlement projection on success.
 *
 * Replacing an installed licence requires a recent PIN. That challenge is a
 * step of the flow, not a failure: the parsed licence is kept and activation
 * resumes as soon as the PIN is confirmed.
 */
export function useLicenseActions() {
  const { t } = useI18n();
  const { refresh } = useLicense();
  const [error, setError] = useState<string | null>(null);
  const [activating, setActivating] = useState(false);
  const [requestingTrial, setRequestingTrial] = useState(false);
  const [pendingEntitlement, setPendingEntitlement] = useState<Record<string, unknown> | null>(
    null,
  );

  async function postEntitlement(entitlement: Record<string, unknown>): Promise<ActivationOutcome> {
    setActivating(true);
    try {
      const response = await fetch("/api/license/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-requested-with": "sahelflow",
        },
        body: JSON.stringify(entitlement),
      });
      if (response.ok) {
        setPendingEntitlement(null);
        await refresh();
        toast.success(t("license.activation.success"));
        return "activated";
      }
      const body = (await response.json().catch(() => ({}))) as {
        code?: unknown;
        error?: unknown;
      };
      if (response.status === 403 && body.code === "REAUTHENTICATION_REQUIRED") {
        setPendingEntitlement(entitlement);
        return "needs_pin";
      }
      setError(t(activationServerErrorKey(body)));
      return "failed";
    } catch {
      setError(t("license.activationFailed"));
      return "failed";
    } finally {
      setActivating(false);
    }
  }

  async function activate(input: string): Promise<ActivationOutcome> {
    setError(null);
    let entitlement: Record<string, unknown>;
    try {
      entitlement = parseActivationInput(input);
    } catch (caught) {
      setError(
        t(
          caught instanceof ActivationCodeError
            ? activationParseErrorKey(caught.code)
            : "license.activation.error.unreadable",
        ),
      );
      return "failed";
    }
    return postEntitlement(entitlement);
  }

  async function confirmPinAndActivate(pin: string): Promise<ActivationOutcome> {
    if (!pendingEntitlement) return "failed";
    setError(null);
    setActivating(true);
    try {
      const response = await fetch("/api/auth/reauthenticate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (!response.ok) {
        setError(
          t(
            response.status === 429
              ? "license.activation.pinLocked"
              : "license.activation.pinIncorrect",
          ),
        );
        return "needs_pin";
      }
    } catch {
      setError(t("license.activationFailed"));
      return "needs_pin";
    } finally {
      setActivating(false);
    }
    return postEntitlement(pendingEntitlement);
  }

  async function startOrRecoverTrial(): Promise<boolean> {
    setError(null);
    setRequestingTrial(true);
    try {
      const response = await fetch("/api/license/trial", {
        method: "POST",
        headers: { "x-requested-with": "sahelflow" },
      });
      if (!response.ok) throw new Error(t("license.trialFailed"));
      await refresh();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? localizeServerMessage(caught.message) : t("license.trialFailed"));
      return false;
    } finally {
      setRequestingTrial(false);
    }
  }

  return {
    error,
    setError,
    activating,
    requestingTrial,
    awaitingPin: pendingEntitlement !== null,
    cancelPin: () => setPendingEntitlement(null),
    activate,
    confirmPinAndActivate,
    startOrRecoverTrial,
  };
}

export type LicenseActions = ReturnType<typeof useLicenseActions>;

/**
 * Activation dialog for a Founder-signed licence: paste the SFLA1 code, open
 * or drop the `.sflicense` file, and confirm with the PIN when asked.
 */
export function LicenseKeyDialog({
  actions,
  trigger,
}: {
  actions: LicenseActions;
  trigger: ReactNode;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [pin, setPin] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  function close() {
    setOpen(false);
    setKeyInput("");
    setPin("");
    actions.cancelPin();
    actions.setError(null);
  }

  async function submit() {
    const outcome = actions.awaitingPin
      ? await actions.confirmPinAndActivate(pin)
      : await actions.activate(keyInput);
    if (outcome === "activated") close();
    if (outcome !== "needs_pin") setPin("");
  }

  async function loadFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_LICENSE_FILE_BYTES) {
      actions.setError(t("license.activation.error.unrecognized"));
      return;
    }
    setKeyInput(await file.text());
    actions.setError(null);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    void loadFile(event.dataTransfer.files[0]);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {actions.awaitingPin ? t("license.activation.pinTitle") : t("license.activatePermanent")}
          </DialogTitle>
          <DialogDescription>
            {actions.awaitingPin
              ? t("license.activation.pinDescription")
              : t("license.protectedBindingHelp")}
          </DialogDescription>
        </DialogHeader>

        {actions.awaitingPin ? (
          <div className="space-y-2 py-2">
            <Label htmlFor="license-activation-pin">{t("license.activation.pinLabel")}</Label>
            <Input
              id="license-activation-pin"
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              autoFocus
              value={pin}
              onChange={(event) => setPin(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && pin.trim()) void submit();
              }}
              dir="ltr"
            />
          </div>
        ) : (
          <div
            className="space-y-2 py-2"
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            data-dragging={dragging ? "true" : "false"}
          >
            <Label htmlFor="license-entitlement">{t("license.licenseKey")}</Label>
            <Textarea
              id="license-entitlement"
              value={keyInput}
              onChange={(event) => setKeyInput(event.target.value)}
              placeholder={t("license.pasteJsonPlaceholder")}
              className={
                dragging
                  ? "min-h-32 border-primary bg-primary-subtle font-mono text-caption"
                  : "min-h-32 font-mono text-caption"
              }
              dir="ltr"
              spellCheck={false}
              autoComplete="off"
              aria-describedby="license-entitlement-hint"
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p id="license-entitlement-hint" className="text-caption text-muted-foreground">
                {t("license.activation.dropHint")}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInput.current?.click()}
              >
                <FileUp className="me-1.5 size-4" aria-hidden="true" />
                {t("license.activation.openFile")}
              </Button>
              <input
                ref={fileInput}
                type="file"
                accept={`${LICENSE_FILE_EXTENSION},.txt,.json`}
                className="hidden"
                onChange={(event) => {
                  void loadFile(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </div>
          </div>
        )}

        {actions.error ? (
          <p className="text-body-sm text-destructive" role="alert">
            {actions.error}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={close}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={
              actions.activating || (actions.awaitingPin ? !pin.trim() : !keyInput.trim())
            }
          >
            {actions.activating ? (
              <Loader2 className="me-1.5 size-4 animate-spin" aria-hidden="true" />
            ) : actions.awaitingPin ? (
              <LockKeyhole className="me-1.5 size-4" aria-hidden="true" />
            ) : null}
            {actions.awaitingPin ? t("license.activation.confirmPin") : t("license.activate")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
