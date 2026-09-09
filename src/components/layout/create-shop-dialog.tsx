"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { Field } from "@/components/system";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/hooks/use-i18n";
import { translateServerError } from "@/lib/i18n/translate-server-error";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useShopStore } from "@/stores/shop-store";

const EMOJI_OPTIONS = [
  "🏪",
  "🛍️",
  "📦",
  "📱",
  "👕",
  "💻",
  "🏠",
  "💄",
  "⚽",
  "🎮",
] as const;

const NAME_FIELD_ID = "create-shop-name";

/**
 * Shop creation.
 *
 * This dialog existed but was imported by nothing, so a seller had no way to
 * create a shop at all — while `POST /api/shops`, the native provisioning
 * lifecycle and the signed slot entitlement were all in place, and multi-shop
 * is a paid entitlement under FD-017 (register FN-01). It is now reachable from
 * the topbar workspace switcher.
 *
 * Controlled by the caller rather than owning a `DialogTrigger`, because the
 * trigger lives inside a dropdown menu: a dialog nested in the menu would be
 * unmounted as the menu closes.
 *
 * Slot authority is NOT re-implemented here. The native layer rejects creation
 * beyond the signed `shop_slots` count, so this surface reports that refusal
 * truthfully instead of guessing at the seller's entitlement client-side.
 */
export function CreateShopDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<string>(EMOJI_OPTIONS[0]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const createShop = useShopStore((state) => state.createShop);

  function reset() {
    setName("");
    setIcon(EMOJI_OPTIONS[0]);
    setError(null);
  }

  function close(next: boolean) {
    if (pending) return;
    onOpenChange(next);
    if (!next) reset();
  }

  async function handleCreate() {
    const requestedName = name.trim();
    if (!requestedName) {
      setError(t("shops.nameRequired"));
      return;
    }

    setPending(true);
    setError(null);
    try {
      await createShop({ name: requestedName, icon });
      toast.success(t("shops.created", { name: requestedName }));
      onOpenChange(false);
      reset();
    } catch (caught) {
      // Slot exhaustion, permission refusal and native unavailability all
      // arrive here. Surface the server's own verdict rather than a generic
      // failure that hides why the seller was refused.
      setError(translateServerError(caught, t, t("shops.lifecycleError")));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("shops.createTitle")}</DialogTitle>
          <DialogDescription>{t("shops.createDescription")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <Field
            id={NAME_FIELD_ID}
            label={t("shops.nameLabel")}
            error={error ?? undefined}
            required
          >
            {(control) => (
              <Input
                {...control}
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  if (error) setError(null);
                }}
                placeholder={t("shops.namePlaceholder")}
                maxLength={50}
                autoFocus
                disabled={pending}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleCreate();
                  }
                }}
              />
            )}
          </Field>

          <div className="space-y-1.5">
            <span className="block text-body-sm font-medium text-foreground">
              {t("shops.iconLabel")}
            </span>
            {/*
              A radiogroup, not ten anonymous buttons: the previous markup gave
              assistive technology no way to tell the options apart or to know
              which was selected.
            */}
            <div
              role="radiogroup"
              aria-label={t("shops.iconLabel")}
              className="flex flex-wrap gap-2"
            >
              {EMOJI_OPTIONS.map((emoji) => {
                const selected = icon === emoji;
                return (
                  <button
                    key={emoji}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={emoji}
                    disabled={pending}
                    onClick={() => setIcon(emoji)}
                    className={cn(
                      "flex size-9 items-center justify-center rounded-control border text-lg outline-none transition-colors",
                      "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                      "disabled:opacity-50",
                      selected
                        ? "border-primary bg-primary-soft"
                        : "border-border hover:border-foreground/20 hover:bg-muted/60",
                    )}
                  >
                    <span aria-hidden="true">{emoji}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => close(false)}
            disabled={pending}
          >
            {t("shops.cancel")}
          </Button>
          <Button
            type="button"
            onClick={() => void handleCreate()}
            disabled={pending || !name.trim()}
          >
            {pending ? (
              <Loader2 className="me-2 size-4 animate-spin" aria-hidden="true" />
            ) : null}
            {t("shops.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
