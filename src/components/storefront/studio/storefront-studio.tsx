"use client";
import { useState } from "react";
import { Monitor, Smartphone, Tablet } from "lucide-react";
import type { StorefrontConfig } from "@/lib/storefront/service";
import { normalizeStorefrontTheme } from "@/lib/storefront/theme-normalize";
import { SaharaPreview } from "./sahara-preview";
import type { StorefrontStudioDevice, StorefrontStudioProduct } from "./studio-types";

export function StorefrontStudio({ config, products }: { config: StorefrontConfig; products: StorefrontStudioProduct[] }) {
  const [device, setDevice] = useState<StorefrontStudioDevice>("desktop");
  const theme = normalizeStorefrontTheme(config.theme);
  const draft = { name: config.name, slug: config.slug, description: config.description ?? "", theme, selectedProductIds: config.productIds, isActive: config.isActive };
  const width = device === "mobile" ? "max-w-[390px]" : device === "tablet" ? "max-w-[760px]" : "max-w-[1180px]";
  return <div className="flex min-h-[720px] flex-col overflow-hidden rounded-2xl border bg-muted/30">
    <div className="flex items-center justify-between border-b bg-background px-4 py-3"><strong>{config.name}</strong><div className="flex gap-1">{[["desktop",Monitor],["tablet",Tablet],["mobile",Smartphone]].map(([id,Icon]) => <button key={String(id)} onClick={() => setDevice(id as StorefrontStudioDevice)} className="rounded-lg p-2 hover:bg-muted"><Icon className="h-4 w-4" /></button>)}</div></div>
    <div className="flex flex-1"><aside className="w-64 border-e bg-background p-4 text-sm">Pages<br/><br/>Sections<br/><br/>Theme<br/><br/>COD checkout<br/><br/>Publish</aside><main className="flex flex-1 justify-center overflow-auto p-6"><div className={`w-full ${width} overflow-hidden rounded-2xl border bg-background shadow-xl`}><SaharaPreview draft={draft} products={products} /></div></main><aside className="hidden w-72 border-s bg-background p-4 text-sm xl:block">Inspector</aside></div>
  </div>;
}
