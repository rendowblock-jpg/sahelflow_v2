"use client";

import { useState, useRef, useCallback } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { useI18n } from "@/hooks/use-i18n";

interface PhotoUploadProps {
  /** Current photo URL (or null) */
  value: string | null;
  /** Called when a new photo is uploaded (receives the URL) */
  onChange: (url: string | null) => void;
  /** Fallback text for the avatar (initials) */
  fallback: string;
  /** Size in pixels (default 96) */
  size?: number;
  /** Upload endpoint (default /api/upload) */
  endpoint?: string;
  className?: string;
}

/**
 * Photo upload component — shows a circular avatar with a camera overlay.
 * Click to upload, hover to see the camera icon. Supports removal.
 * Uploads to /api/upload, calls onChange with the new URL.
 */
export function PhotoUpload({
  value,
  onChange,
  fallback,
  size = 96,
  endpoint = "/api/upload",
  className,
}: PhotoUploadProps) {
  const { t } = useI18n();
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
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
      const res = await fetch(endpoint, { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t("common.uploadFailed"));
      onChange(data.url);
      toast.success(t("profile.photoUpdated"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("profile.uploadFailed"));
    } finally {
      setUploading(false);
    }
  }, [endpoint, onChange, t]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  }, [handleFile]);

  return (
    <div className={cn("flex items-center gap-4", className)}>
      <div
        className="relative group cursor-pointer"
        style={{ width: size, height: size }}
        onClick={() => inputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
        aria-label={t("profile.uploadPhoto")}
      >
        <Avatar className="size-full ring-2 ring-border group-hover:ring-primary transition-all">
          {value ? <AvatarImage src={value} alt="" /> : null}
          <AvatarFallback className="bg-primary/10 text-primary text-2xl font-semibold">
            {fallback.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        {/* Camera overlay */}
        <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
          {uploading ? (
            <Loader2 className="h-6 w-6 text-white animate-spin" />
          ) : (
            <Camera className="h-6 w-6 text-white" />
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Camera className="me-2 h-4 w-4" />}
          {t("profile.changePhoto")}
        </Button>
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => onChange(null)}
          >
            <Trash2 className="me-2 h-4 w-4" />
            {t("profile.removePhoto")}
          </Button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = ""; // reset for re-upload
        }}
      />
    </div>
  );
}
