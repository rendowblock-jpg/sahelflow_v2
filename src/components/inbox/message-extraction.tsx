"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Sparkles, CheckCircle2, AlertCircle, ArrowRight } from "lucide-react";
import type { ExtractedOrder } from "@/lib/ai/extraction";
import { dzPhone } from "@/lib/validation";

interface MessageExtractionProps {
  messageId: string;
  messageBody: string;
  knownPhone?: string;
}

interface ExtractionResult {
  order: ExtractedOrder | null;
  method: string;
  confidence: number;
  isComplete: boolean;
  missingFields?: string[];
}

export function MessageExtraction({ messageId, messageBody, knownPhone }: MessageExtractionProps) {
  const router = useRouter();
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  // Editable phone — pre-filled from extraction or known phone; user can correct
  // it before creating the order. Required: a customer cannot be created without
  // a valid Algerian phone (it's the @unique blind-index key).
  const [phone, setPhone] = useState<string>("");
  const [phoneTouched, setPhoneTouched] = useState(false);

  async function handleExtract() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/extraction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: messageBody, knownPhone }),
      });
      if (!res.ok) {
        throw new Error("Échec de l'extraction");
      }
      const data = await res.json();
      setResult(data.result);
      // Pre-fill the editable phone from the extraction result or the known phone.
      setPhone(data.result?.order?.phone || knownPhone || "");
      setPhoneTouched(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateOrder() {
    if (!result?.order) return;
    // Validate the phone before submitting — a customer cannot be created
    // without a valid Algerian phone (it's the @unique blind-index key).
    setPhoneTouched(true);
    const phoneCheck = dzPhone.safeParse(phone.trim());
    if (!phoneCheck.success) {
      setError("Téléphone invalide — format attendu: 0[5-7]XXXXXXXX");
      return;
    }
    const validPhone = phoneCheck.data;
    setCreating(true);
    setError(null);
    try {
      // First, find or create the customer
      const customerRes = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: result.order.customerName || "Client",
          phone: validPhone,
          wilaya: result.order.wilaya,
          commune: result.order.commune,
          address: result.order.address,
        }),
      });

      let customerId: string;
      if (customerRes.ok) {
        const customerData = await customerRes.json();
        customerId = customerData.customer.id;
      } else if (customerRes.status === 409) {
        // Customer already exists — find by phone
        const listRes = await fetch(`/api/customers?limit=100`);
        if (listRes.ok) {
          const listData = await listRes.json();
          const existing = listData.customers?.find((c: { phone: string }) => c.phone === validPhone);
          if (existing) {
            customerId = existing.id;
          } else {
            throw new Error("Client existant mais introuvable");
          }
        } else {
          throw new Error("Impossible de lister les clients");
        }
      } else {
        throw new Error("Échec de la création du client");
      }

      // Create the order
      const orderRes = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          items: result.order.items.map((item) => ({
            productName: item.productName,
            quantity: item.quantity,
            unitPrice: item.unitPrice || 0,
          })),
          wilaya: result.order.wilaya || "",
          commune: result.order.commune || "",
          address: result.order.address || "",
          phone: validPhone,
          source: "whatsapp",
          sourceMetadata: { messageId },
          deliveryCost: 600,
        }),
      });

      if (!orderRes.ok) {
        const errData = await orderRes.json();
        throw new Error(errData.error || "Échec de la création de la commande");
      }

      const { order } = await orderRes.json();
      router.push(`/orders/${order.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-3">
      {!result && !loading && (
        <Button variant="outline" size="sm" onClick={handleExtract}>
          <Sparkles className="h-4 w-4 mr-1.5" />
          Extraire la commande
        </Button>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Extraction en cours...
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive" role="alert">{error}</p>
      )}

      {result && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="space-y-3 pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {result.order ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="text-sm font-medium">
                  {result.order ? "Commande extraite" : "Extraction échouée"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {result.method === "regex" ? "Regex" : result.method === "gemini" ? "Gemini AI" : "—"}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {Math.round(result.confidence * 100)}%
                </Badge>
              </div>
            </div>

            {result.order && (
              <div className="space-y-1.5 text-sm">
                {result.order.customerName && (
                  <div className="flex gap-2">
                    <span className="text-muted-foreground min-w-[80px]">Client:</span>
                    <span className="font-medium">{result.order.customerName}</span>
                  </div>
                )}
                {result.order.phone && (
                  <div className="flex gap-2">
                    <span className="text-muted-foreground min-w-[80px]">Téléphone:</span>
                    <span className="font-mono">{result.order.phone}</span>
                  </div>
                )}
                {result.order.wilaya && (
                  <div className="flex gap-2">
                    <span className="text-muted-foreground min-w-[80px]">Wilaya:</span>
                    <span>{result.order.wilaya}</span>
                  </div>
                )}
                {result.order.items.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-muted-foreground">Articles:</span>
                    {result.order.items.map((item, i) => (
                      <div key={i} className="ml-4 flex justify-between">
                        <span>{item.quantity}× {item.productName}</span>
                        {item.unitPrice && <span className="font-medium">{item.unitPrice} DA</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {result.missingFields && result.missingFields.length > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-amber-600">
                <AlertCircle className="h-3 w-3" />
                <span>Champs manquants: {result.missingFields.join(", ")}</span>
              </div>
            )}

            {result.order && (
              <div className="space-y-2">
                <Label htmlFor={`phone-${messageId}`} className="text-xs">
                  Téléphone <span className="text-destructive">*</span>
                </Label>
                <Input
                  id={`phone-${messageId}`}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onBlur={() => setPhoneTouched(true)}
                  placeholder="0[5-7]XXXXXXXX"
                  className="font-mono h-8"
                  aria-invalid={phoneTouched && !dzPhone.safeParse(phone.trim()).success}
                  inputMode="tel"
                />
                {phoneTouched && !dzPhone.safeParse(phone.trim()).success && (
                  <p className="text-xs text-destructive" role="alert">
                    Format invalide — attendu: 0[5-7]XXXXXXXX
                  </p>
                )}
              </div>
            )}

            {result.order && result.order.items.length > 0 && (
              <Button
                size="sm"
                onClick={handleCreateOrder}
                disabled={creating || !dzPhone.safeParse(phone.trim()).success}
              >
                {creating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    Création...
                  </>
                ) : (
                  <>
                    Créer la commande
                    <ArrowRight className="h-4 w-4 ml-1.5" />
                  </>
                )}
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
