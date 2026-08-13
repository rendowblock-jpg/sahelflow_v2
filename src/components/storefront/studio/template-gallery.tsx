"use client";
import type { StorefrontTemplateId } from "@/lib/storefront/presentation-types";
const T: readonly [StorefrontTemplateId,string,string][]=[
["atlas","Atlas","Minimal conversion"],["sahara","Sahara","Visual editorial"],["oasis","Oasis","Bold COD landing"]];
export function TemplateGallery({value,onChange}:{value:StorefrontTemplateId;onChange:(v:StorefrontTemplateId)=>void}){
return <div className="space-y-2">{T.map(([id,name,role])=><button key={id} type="button" onClick={()=>onChange(id)} className={`w-full rounded-xl border p-3 text-start ${value===id?"border-primary bg-primary/5":"hover:bg-muted/60"}`}><div className="text-sm font-semibold">{name}</div><div className="text-[11px] uppercase tracking-wider text-muted-foreground">{role}</div></button>)}</div>;
}
