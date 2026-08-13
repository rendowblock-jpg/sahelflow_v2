"use client";
import type { StorefrontPreviewProps } from "./studio-types";

export function SaharaPreview({ draft }: StorefrontPreviewProps) {
  const theme = draft.theme;
  return (
    <div className="min-h-full p-7" style={{ background: theme.backgroundColor, color: theme.textColor }}>
      <div className="text-xs font-semibold uppercase tracking-[0.18em]">{draft.name || "SahelFlow"}</div>
      <div className="mt-14 max-w-xl">
        <div className="text-[10px] font-semibold uppercase tracking-[0.22em]" style={{ color: theme.primaryColor }}>{theme.hero.eyebrow}</div>
        <h2 className="mt-3 text-4xl font-semibold leading-none tracking-[-0.04em]">{theme.hero.headline || draft.name}</h2>
        <p className="mt-4 text-sm leading-6 opacity-60">{theme.hero.body || draft.description}</p>
      </div>
      <div className="mt-10 h-40 rounded-[2rem]" style={{ background: theme.accentColor }} />
    </div>
  );
}
