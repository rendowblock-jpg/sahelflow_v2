"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ShieldAlert,
} from "lucide-react";
import type { ExtractedOrder } from "@/lib/ai/extraction";
import { dzPhone } from "@/lib/validation";
import { useI18n } from "@/hooks/use-i18n";
import { toast } from "@/lib/toast";

interface MessageExtractionProps {
  conversationId?: string;
  messageId: string;
  messageBody: string;
  knownPhone?: string;
}

interface ExtractionResult {
  order: ExtractedOrder | null;
  method: "regex" | "gemini" | "none";
  confidence: number;
  isComplete: boolean;
  missingFields?: string[];
}

function algerianPhoneToWhatsAppJid(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const international = digits.startsWith("0")
    ? `213${digits.slice(1)}`
    : digits.startsWith("213")
      ? digits
      : `213${digits}`;
  return `${international}@s.whatsapp.net`;
}

export function MessageExtraction({
  conversationId,
  messageId,
  messageBody,
  knownPhone,
}: MessageExtractionProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [phone, setPhone] = useState<string>("");
  const [phoneTouched, setPhoneTouched] = useState(false);

  async function handleExtract() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/extraction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: messageBody,
          channel: "whatsapp",
          knownPhone,
          messageId,
        }),
      });
      if (!res.ok) {
        let errData: { error?: string; message?: string } = {};
        try {
          errData = await res.json();
        } catch {
          // Ignore malformed error responses.
        }
        if (res.status === 403 && errData.error === "consent_required") {
          toast.error(t("inbox.extractionConsentRequired"), {
            duration: 9000,
            action: {
              label: t("inbox.extractionConsentGoToSettings"),
              onClick: () => router.push("/settings"),
            },
          });
          setError(t("inbox.extractionConsentRequired"));
          return;
        }
        throw new Error(t("inbox.extractionFailed"));
      }
      const data = (await res.json()) as { result: ExtractionResult };
      setResult(data.result);
      setPhone(data.result?.order?.phone || knownPhone || "");
      setPhoneTouched(false);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : t("inbox.extractionError"),
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateOrder() {
    if (!result?.order || result.method === "none") return;
    setPhoneTouched(true);
    const phoneCheck = dzPhone.safeParse(phone.trim());
    if (!phoneCheck.success) {
      setError(t("inbox.invalidPhoneFormat"));
      return;
    }
    const sourceConversationId =
      conversationId ?? algerianPhoneToWhatsAppJid(phoneCheck.data);

    setCreating(true);
    setError(null);
    try {
      const response = await fetch("/api/orders/source/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: sourceConversationId,
          messageId,
          extractionMethod: result.method,
          extractionConfidence: result.confidence,
          customer: {
            name:
              result.order.customerName || t("inbox.customerDefaultName"),
            phone: phoneCheck.data,
            wilaya: result.order.wilaya || "",
            commune: result.order.commune || "",
            address: result.order.address || "",
          },
          items: result.order.items.map((item) => ({
            productName: item.productName,
            quantity: item.quantity,
          })),
          deliveryCost: 600,
          notes: result.order.notes,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = body.error?.message ?? body.error;
        throw new Error(
          typeof message === "string" ? message : t("inbox.orderCreateFailed"),
        );
      }
      router.push(`/orders/${body.order.id}`);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : t("inbox.extractionError"),
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-3">
      {!result && !loading && (
        <Button variant="outline" size="sm" onClick={handleExtract}>
          <Sparkles className="h-4 w-4 me-1.5" />
          {t("inbox.extractOrder")}
        </Button>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("inbox.extractionInProgress")}
        </div>
      )}

      {error && (
        <div className="space-y-2" role="alert">
          <p className="text-sm text-destructive flex items-start gap-1.5">
            <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </p>
          {error === t("inbox.extractionConsentRequired") && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push("/settings")}
            >
              {t("inbox.extractionConsentGoToSettings")}
              <ArrowRight className="h-3.5 w-3.5 ms-1.5 rtl:rotate-180" />
            </Button>
          )}
        </div>
      )}

      {result && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="space-y-3 pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {result.order ? (
                  <CheckCircle2 className="h-4 w-4 text-success" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="text-sm font-medium">
                  {result.order
                    ? t("inbox.orderExtractedLabel")
                    : t("inbox.extractionFailedLabel")}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {result.method === "regex"
                    ? t("inbox.extractionMethodRegex")
                    : result.method === "gemini"
                      ? t("inbox.extractionMethodGemini")
                      : "—"}
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
                    <span className="text-muted-foreground min-w-[80px]">
                      {t("inbox.customerLabel")}
                    </span>
                    <span className="font-medium">
                      {result.order.customerName}
                    </span>
                  </div>
                )}
                {result.order.phone && (
                  <div className="flex gap-2">
                    <span className="text-muted-foreground min-w-[80px]">
                      {t("inbox.phoneLabel")}
                    </span>
                    <span className="font-mono">{result.order.phone}</span>
                  </div>
                )}
                {result.order.wilaya && (
                  <div className="flex gap-2">
                    <span className="text-muted-foreground min-w-[80px]">
                      {t("inbox.wilayaLabel")}
                    </span>
                    <span>{result.order.wilaya}</span>
                  </div>
                )}
                {result.order.items.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-muted-foreground">
                      {t("inbox.itemsLabel")}
                    </span>
                    {result.order.items.map((item, index) => (
                      <div key={index} className="ms-4 flex justify-between">
                        <span>
                          {item.quantity}× {item.productName}
                        </span>
                        {item.unitPrice ? (
                          <span className="font-medium">{item.unitPrice} DA</span>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {result.missingFields && result.missingFields.length > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-warning">
                <AlertCircle className="h-3 w-3" />
                <span>
                  {t("inbox.missingFields", {
                    fields: result.missingFields.join(", "),
                  })}
                </span>
              </div>
            )}

            {result.order && (
              <div className="space-y-2">
                <Label htmlFor={`phone-${messageId}`} className="text-xs">
                  {t("inbox.phoneRequired")} {" "}
                  <span className="text-destructive">*</span>
                </Label>
                <Input
                  id={`phone-${messageId}`}
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  onBlur={() => setPhoneTouched(true)}
                  placeholder="0[5-7]XXXXXXXX"
                  className="font-mono h-8"
                  aria-invalid={
                    phoneTouched && !dzPhone.safeParse(phone.trim()).success
                  }
                  inputMode="tel"
                />
                {phoneTouched &&
                  !dzPhone.safeParse(phone.trim()).success && (
                    <p className="text-xs text-destructive" role="alert">
                      {t("inbox.invalidFormatExpected")}
                    </p>
                  )}
              </div>
            )}

            {result.order && result.order.items.length > 0 && (
              <Button
                size="sm"
                onClick={handleCreateOrder}
                disabled={
                  creating || !dzPhone.safeParse(phone.trim()).success
                }
              >
                {creating ? (
                  <>
                    <Loader2 className="h-4 w-4 me-1.5 animate-spin" />
                    {t("inbox.creating")}
                  </>
                ) : (
                  <>
                    {t("inbox.createOrder")}
                    <ArrowRight className="h-4 w-4 ms-1.5 rtl:rotate-180" />
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
