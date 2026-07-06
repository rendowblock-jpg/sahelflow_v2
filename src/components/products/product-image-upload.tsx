"use client";

import { useState, useRef, useCallback } from "react";
import { Plus, Loader2, X } from "lucide-react";
import { toast } from "@/lib/toast";

import { useI18n } from "@/hooks/use-i18n";
import { cn } from "@/lib/utils";

/**
 * Hard cap on the number of images a product can have. Mirrors the
 * merchant-facing copy ("up to 8 images") — bumping this requires updating
 * the i18n hint text `products.imagesHint` (which uses {{count}}) but the
 * default copy still says 8, so change both.
 */
export const MAX_PRODUCT_IMAGES = 8;

const MAX_SIZE = 5 * 1024 * 1024; // 5MB — matches /api/upload route limit
const ACCEPTED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

interface ProductImageUploadProps {
  /** Current list of image URLs (already uploaded). */
  value: string[];
  /** Called whenever the list changes (add or remove). */
  onChange: (urls: string[]) => void;
  /** Max number of images. Defaults to MAX_PRODUCT_IMAGES (8). */
  maxImages?: number;
  /** Upload endpoint (default /api/upload — multipart/form-data → { url }). */
  endpoint?: string;
  /** Disable interactions (e.g. while parent is submitting). */
  disabled?: boolean;
  className?: string;
}

/**
 * Multi-image uploader for the product form.
 *
 * - Renders a responsive grid of existing image thumbnails.
 * - The first image is badged "Main" — storefronts / catalogs treat it as
 *   the primary product image.
 * - Each thumbnail has a remove (X) button.
 * - An "Add image" tile opens the native file picker (supports `multiple`).
 * - Drag-and-drop onto the add tile is also supported.
 * - Files are validated client-side (type + size) then POSTed one-by-one
 *   to /api/upload. Successful URLs are appended to the array.
 *
 * The parent owns the `value`/`onChange` contract (controlled component) so
 * react-hook-form's Controller can wire it directly to the `images` field.
 */
export function ProductImageUpload({
  value,
  onChange,
  maxImages = MAX_PRODUCT_IMAGES,
  endpoint = "/api/upload",
  disabled = false,
  className,
}: ProductImageUploadProps) {
  const { t } = useI18n();
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const uploadFile = useCallback(
    async (file: File): Promise<string | null> => {
      if (!ACCEPTED_TYPES.has(file.type)) {
        toast.error(t("products.uploadInvalidType"));
        return null;
      }
      if (file.size > MAX_SIZE) {
        toast.error(t("products.uploadTooLarge"));
        return null;
      }
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch(endpoint, {
          method: "POST",
          body: formData,
        });
        const data = (await res.json().catch(() => null)) as
          | { url?: string; error?: string }
          | null;
        if (!res.ok || !data?.url) {
          throw new Error(data?.error ?? t("common.uploadFailed"));
        }
        return data.url;
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : t("products.uploadError"),
        );
        return null;
      }
    },
    [endpoint, t],
  );

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      if (fileArray.length === 0) return;

      const remaining = maxImages - value.length;
      if (remaining <= 0) {
        toast.error(t("products.imagesLimitReached", { count: maxImages }));
        return;
      }

      // If the user picked more files than we have room for, surface a
      // toast but still upload as many as we can.
      const toUpload = fileArray.slice(0, remaining);
      if (fileArray.length > remaining) {
        toast.error(t("products.imagesLimitReached", { count: maxImages }));
      }

      setUploading(true);
      try {
        const results = await Promise.all(toUpload.map(uploadFile));
        const successful = results.filter(
          (u): u is string => u !== null,
        );
        if (successful.length > 0) {
          onChange([...value, ...successful]);
        }
      } finally {
        setUploading(false);
      }
    },
    [value, onChange, maxImages, uploadFile, t],
  );

  const removeImage = useCallback(
    (index: number) => {
      // Remove without mutating the original array (controlled component).
      const next = value.filter((_, i) => i !== index);
      onChange(next);
    },
    [value, onChange],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (disabled || uploading) return;
      if (e.dataTransfer.files.length > 0) {
        void handleFiles(e.dataTransfer.files);
      }
    },
    [disabled, uploading, handleFiles],
  );

  const canAddMore = value.length < maxImages;
  const isInteractive = !disabled && !uploading;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
        {/* Existing image thumbnails */}
        {value.map((url, idx) => (
          <div
            key={`${url}-${idx}`}
            className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-muted"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded URLs, no optimization needed */}
            <img
              src={url}
              alt={t("products.productImage")}
              className="size-full object-cover"
              loading="lazy"
            />
            {idx === 0 && (
              <span className="absolute start-1 top-1 rounded bg-primary/90 px-1.5 py-0.5 text-xs font-medium text-primary-foreground">
                {t("products.imagePrimary")}
              </span>
            )}
            <button
              type="button"
              onClick={() => removeImage(idx)}
              disabled={disabled}
              className="absolute end-1 top-1 inline-flex size-5 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={t("products.removeImage")}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}

        {/* Add image tile (acts as both click target and drop zone) */}
        {canAddMore && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            disabled={!isInteractive}
            className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border bg-muted/30 p-2 text-muted-foreground transition-colors hover:border-primary hover:bg-primary/5 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={t("products.addImage")}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Plus className="h-4 w-4" />
                <span className="text-center text-xs font-medium leading-tight">
                  {t("products.addImage")}
                </span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Hidden file input — multiple selection, image types only */}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            void handleFiles(e.target.files);
          }
          // Reset so the same file can be picked again after removal.
          e.target.value = "";
        }}
      />
    </div>
  );
}
