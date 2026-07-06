"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/hooks/use-i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, Store, Truck, Bot, Package, ArrowRight, ArrowLeft, SkipForward } from "lucide-react";
import { toast } from "sonner";

const STEPS = [
  { id: "business", icon: Store, key: "onboarding.steps.business" },
  { id: "delivery", icon: Truck, key: "onboarding.steps.delivery" },
  { id: "ai", icon: Bot, key: "onboarding.steps.ai" },
  { id: "product", icon: Package, key: "onboarding.steps.product" },
] as const;

export function OnboardingWizard() {
  const { t } = useI18n();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);

  // Step 1: Business profile
  const [businessName, setBusinessName] = useState("");
  const [businessPhone, setBusinessPhone] = useState("");
  const [businessWilaya, setBusinessWilaya] = useState("");

  // Step 2: Delivery
  const [deliveryProvider, setDeliveryProvider] = useState("");
  const [deliveryToken, setDeliveryToken] = useState("");

  // Step 3: AI key
  const [geminiKey, setGeminiKey] = useState("");

  // Step 4: First product
  const [productName, setProductName] = useState("");
  const [productPrice, setProductPrice] = useState("");
  const [productStock, setProductStock] = useState("");

  async function saveBusinessProfile() {
    if (!businessName.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-requested-with": "sahelflow" },
        body: JSON.stringify({ name: businessName, phone: businessPhone }),
      });
      if (!res.ok) throw new Error(`Profile save failed (${res.status})`);
      // Also save wilaya as a setting
      if (businessWilaya) {
        const settingRes = await fetch("/api/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json", "x-requested-with": "sahelflow" },
          body: JSON.stringify({ settings: { business_wilaya: businessWilaya } }),
        });
        if (!settingRes.ok) throw new Error(`Settings save failed (${settingRes.status})`);
      }
    } catch (err) {
      // Session 29 fix (AUDIT-5 C3): re-throw so nextStep doesn't advance.
      // Previously this swallowed the error → wizard advanced with no profile saved.
      toast.error(err instanceof Error ? err.message : t('error.networkFailure'));
      throw err;
    }
    setLoading(false);
  }

  async function saveDelivery() {
    if (!deliveryProvider || !deliveryToken) return;
    setLoading(true);
    try {
      const res = await fetch("/api/delivery/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-requested-with": "sahelflow" },
        body: JSON.stringify({ provider: deliveryProvider, credentials: { apiToken: deliveryToken } }),
      });
      if (!res.ok) throw new Error(`Delivery credentials save failed (${res.status})`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('error.networkFailure'));
      throw err; // re-throw so nextStep doesn't advance
    }
    setLoading(false);
  }

  async function saveAiKey() {
    if (!geminiKey.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/secrets/gemini-key", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-requested-with": "sahelflow" },
        body: JSON.stringify({ key: geminiKey }),
      });
      // Session 29 fix (AUDIT-5 C3): throw on !res.ok AND re-throw on catch.
      // Previously this swallowed all errors → wizard advanced with no AI key
      // saved → AI features silently broken on dashboard.
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `AI key save failed (${res.status})`);
      }
      toast.success(t("onboarding.ai.keySaved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('error.networkFailure'));
      throw err;
    }
    setLoading(false);
  }

  async function saveProduct() {
    if (!productName.trim() || !productPrice) return;
    setLoading(true);
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-requested-with": "sahelflow" },
        body: JSON.stringify({
          name: productName,
          price: parseInt(productPrice, 10),
          stock: parseInt(productStock || "0", 10),
        }),
      });
      if (!res.ok) throw new Error(`Product save failed (${res.status})`);
      toast.success(t("onboarding.product.created"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('error.networkFailure'));
      throw err; // re-throw so nextStep doesn't advance
    }
    setLoading(false);
  }

  async function nextStep() {
    setLoading(true);
    try {
      if (step === 0 && businessName.trim()) await saveBusinessProfile();
      else if (step === 1 && deliveryProvider && deliveryToken) await saveDelivery();
      else if (step === 2 && geminiKey.trim()) await saveAiKey();
      else if (step === 3 && productName.trim() && productPrice) await saveProduct();
    } catch {
      // Save failed — don't advance to the next step. The save function
      // already showed the error toast.
      setLoading(false);
      return;
    } finally {
      setLoading(false);
    }

    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      // Finished — go to dashboard
      toast.success(t("onboarding.complete"));
      router.push("/dashboard");
      router.refresh();
    }
  }

  function skipStep() {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      router.push("/dashboard");
      router.refresh();
    }
  }

  const CurrentIcon = STEPS[step]!.icon;

  return (
    <div className="flex min-h-full items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-lg">
        {/* Progress indicator */}
        <div className="mb-8 flex items-center justify-center gap-2">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={s.id} className="flex items-center">
                <div
                  className={`flex size-10 items-center justify-center rounded-full transition-colors ${
                    i < step
                      ? "bg-primary text-primary-foreground"
                      : i === step
                        ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {i < step ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`h-0.5 w-8 ${i < step ? "bg-primary" : "bg-muted"}`} />
                )}
              </div>
            );
          })}
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
                <CurrentIcon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">
                  {t(`onboarding.step${step}.title`)}
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {t(`onboarding.step${step}.description`)}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {step === 0 && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="biz-name">{t("onboarding.business.name")}</Label>
                  <Input id="biz-name" value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Ma Boutique" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="biz-phone">{t("onboarding.business.phone")}</Label>
                  <Input id="biz-phone" value={businessPhone} onChange={(e) => setBusinessPhone(e.target.value)} placeholder="0555123456" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="biz-wilaya">{t("onboarding.business.wilaya")}</Label>
                  <Input id="biz-wilaya" value={businessWilaya} onChange={(e) => setBusinessWilaya(e.target.value)} placeholder="Alger" />
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <div className="space-y-2">
                  <Label>{t("onboarding.delivery.provider")}</Label>
                  <Select value={deliveryProvider} onValueChange={setDeliveryProvider}>
                    <SelectTrigger><SelectValue placeholder={t("onboarding.delivery.selectProvider")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yalidine">Yalidine</SelectItem>
                      <SelectItem value="maystro">Maystro</SelectItem>
                      <SelectItem value="zrexpress">ZR Express</SelectItem>
                      <SelectItem value="dhd">DHD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="del-token">{t("onboarding.delivery.apiToken")}</Label>
                  <Input id="del-token" value={deliveryToken} onChange={(e) => setDeliveryToken(e.target.value)} placeholder="API token" type="password" />
                </div>
              </>
            )}

            {step === 2 && (
              <div className="space-y-2">
                <Label htmlFor="ai-key">{t("onboarding.ai.key")}</Label>
                <Input id="ai-key" value={geminiKey} onChange={(e) => setGeminiKey(e.target.value)} placeholder="AIza..." type="password" />
                <p className="text-xs text-muted-foreground">{t("onboarding.ai.keyHelp")}</p>
              </div>
            )}

            {step === 3 && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="prod-name">{t("onboarding.product.name")}</Label>
                  <Input id="prod-name" value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="Produit Test" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="prod-price">{t("onboarding.product.price")}</Label>
                    <Input id="prod-price" value={productPrice} onChange={(e) => setProductPrice(e.target.value)} placeholder="2500" type="number" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="prod-stock">{t("onboarding.product.stock")}</Label>
                    <Input id="prod-stock" value={productStock} onChange={(e) => setProductStock(e.target.value)} placeholder="100" type="number" />
                  </div>
                </div>
              </>
            )}

            {/* Navigation */}
            <div className="flex items-center justify-between pt-4">
              {step > 0 ? (
                <Button variant="ghost" size="sm" onClick={() => setStep(step - 1)}>
                  <ArrowLeft className="h-4 w-4 icon-rtl-flip me-1" />
                  {t("common.back")}
                </Button>
              ) : <div />}

              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={skipStep}>
                  <SkipForward className="h-4 w-4 icon-rtl-flip me-1" />
                  {t("common.skip")}
                </Button>
                <Button onClick={nextStep} disabled={loading} size="sm">
                  {step === STEPS.length - 1 ? t("onboarding.finish") : t("common.next")}
                  {step < STEPS.length - 1 && <ArrowRight className="h-4 w-4 icon-rtl-flip ms-1" />}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
