"use client";
import { useI18n } from "@/hooks/use-i18n";
import type { StorefrontTemplateId } from "@/lib/storefront/presentation-types";
const T: readonly [StorefrontTemplateId,string,string][]=[
["atlas","storefront.studio.template.atlas","storefront.studio.template.atlasRole"],["sahara","storefront.studio.template.sahara","storefront.studio.template.saharaRole"],["oasis","storefront.studio.template.oasis","storefront.studio.template.oasisRole"]];
export function TemplateGallery({value,onChange}:{value:StorefrontTemplateId;onChange:(v:StorefrontTemplateId)=>void}){
const {t}=useI18n();
return <div className="space-y-2">{T.map(([id,nameKey,roleKey])=><button key={id} type="button" onClick={()=>onChange(id)} className={`w-full rounded-xl border p-3 text-start ${value===id?"border-primary bg-primary/5":"hover:bg-muted/60"}`}><div className="text-sm font-semibold">{t(nameKey)}</div><div className="text-[11px] uppercase tracking-wider text-muted-foreground">{t(roleKey)}</div></button>)}</div>;
}
