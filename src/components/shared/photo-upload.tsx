"use client";

import { useCallback, useRef, useState } from "react";
import { Camera, Loader2, Trash2 } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/hooks/use-i18n";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

interface PhotoUploadProps {
  value: string | null;
  onChange: (url: string | null) => void;
  fallback: string;
  size?: number;
  endpoint?: string;
  className?: string;
  disabled?: boolean;
}

/** Photo upload with a genuine read-only mode for permission-truthful forms. */
export function PhotoUpload({
  value,
  onChange,
  fallback,
  size = 96,
  endpoint = "/api/upload",
  className,
  disabled = false,
}: PhotoUploadProps) {
  const { t } = useI18n();
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    if (disabled) return;
    if (!file.type.startsWith("image/")) {
      toast.error(t("profile.invalidImage"));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error(t("profile.imageTooLarge"));
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(endpoint, { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? t("common.uploadFailed"));
      onChange(data.url);
      toast.success(t("profile.photoUpdated"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("profile.uploadFailed"));
    } finally {
      setUploading(false);
    }
  }, [disabled, endpoint, onChange, t]);

  const handleDrop = useCallback((event: React.DragEvent) => {
    if (disabled) return;
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) void handleFile(file);
  }, [disabled, handleFile]);

  return (
    <div className={cn("flex items-center gap-4", className)}>
      <div
        className={cn("relative group", disabled ? "cursor-default" : "cursor-pointer")}
        style={{ width: size, height: size }}
        onClick={disabled ? undefined : () => inputRef.current?.click()}
        onDrop={disabled ? undefined : handleDrop}
        onDragOver={disabled ? undefined : (event) => event.preventDefault()}
        role={disabled ? undefined : "button"}
        tabIndex={disabled ? undefined : 0}
        onKeyDown={disabled ? undefined : (event) => {
          if (event.key === "Enter" || event.key === " ") inputRef.current?.click();
        }}
        aria-label={disabled ? undefined : t("profile.uploadPhoto")}
      >
        <Avatar className={cn("size-full ring-2 ring-border", !disabled && "group-hover:ring-primary")}>
          {value ? <AvatarImage src={value} alt="" /> : null}
          <AvatarFallback className="bg-primary/10 text-2xl font-semibold text-primary">
            {fallback.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        {!disabled ? (
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
            {uploading ? (
              <Loader2 className="size-6 animate-spin text-white" aria-hidden="true" />
            ) : (
              <Camera className="size-6 text-white" aria-hidden="true" />
            )}
          </div>
        ) : null}
      </div>

      {!disabled ? (
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? <Loader2 className="me-2 size-4 animate-spin" aria-hidden="true" /> : <Camera className="me-2 size-4" aria-hidden="true" />}
            {t("profile.changePhoto")}
          </Button>
          {value ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => onChange(null)}
            >
              <Trash2 className="me-2 size-4" aria-hidden="true" />
              {t("profile.removePhoto")}
            </Button>
          ) : null}
        </div>
      ) : null}

      {!disabled ? (
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFile(file);
            event.target.value = "";
          }}
        />
      ) : null}
    </div>
  );
}
