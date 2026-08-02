"use client";

import { useCallback, useRef, useState } from "react";
import { ArrowRight, KeyRound, Loader2, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";

import { RuntimeUiReadyBeacon } from "@/components/runtime/runtime-ui-ready-beacon";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/hooks/use-i18n";

const COPY = {
  en: {
    title: "Join a SahelFlow team",
    description:
      "Use the single-use invitation from the workspace owner, then create your individual local profile and PIN.",
    token: "Invitation token",
    tokenPlaceholder: "sf-invite-v1.…",
    name: "Display name",
    namePlaceholder: "Your name",
    login: "Login ID",
    loginPlaceholder: "e.g. amina.ops",
    loginHelp: "3–32 lowercase letters, numbers, dots, dashes or underscores.",
    pin: "Create PIN",
    confirmPin: "Confirm PIN",
    submit: "Accept invitation",
    mismatch: "The PIN confirmation does not match.",
    failed: "The invitation could not be accepted.",
    success: "Team profile created. Opening SahelFlow…",
    loginLink: "Back to login",
  },
  fr: {
    title: "Rejoindre une équipe SahelFlow",
    description:
      "Utilisez l’invitation à usage unique du propriétaire, puis créez votre profil local individuel et votre code PIN.",
    token: "Jeton d’invitation",
    tokenPlaceholder: "sf-invite-v1.…",
    name: "Nom affiché",
    namePlaceholder: "Votre nom",
    login: "Identifiant de connexion",
    loginPlaceholder: "ex. amina.ops",
    loginHelp: "3 à 32 lettres minuscules, chiffres, points, tirets ou underscores.",
    pin: "Créer le PIN",
    confirmPin: "Confirmer le PIN",
    submit: "Accepter l’invitation",
    mismatch: "La confirmation du PIN ne correspond pas.",
    failed: "Impossible d’accepter l’invitation.",
    success: "Profil d’équipe créé. Ouverture de SahelFlow…",
    loginLink: "Retour à la connexion",
  },
  ar: {
    title: "الانضمام إلى فريق SahelFlow",
    description:
      "استخدم دعوة الاستخدام الواحد من مالك مساحة العمل، ثم أنشئ ملفك المحلي الفردي ورمز PIN الخاص بك.",
    token: "رمز الدعوة",
    tokenPlaceholder: "sf-invite-v1.…",
    name: "الاسم الظاهر",
    namePlaceholder: "اسمك",
    login: "معرّف تسجيل الدخول",
    loginPlaceholder: "مثال: amina.ops",
    loginHelp: "من 3 إلى 32 حرفًا لاتينيًا صغيرًا أو رقمًا أو نقطة أو شرطة أو شرطة سفلية.",
    pin: "إنشاء رمز PIN",
    confirmPin: "تأكيد رمز PIN",
    submit: "قبول الدعوة",
    mismatch: "تأكيد رمز PIN غير مطابق.",
    failed: "تعذر قبول الدعوة.",
    success: "تم إنشاء ملف الفريق. جارٍ فتح SahelFlow…",
    loginLink: "العودة إلى تسجيل الدخول",
  },
} as const;

type ApiError = { error?: string };
type AcceptanceAttempt = Readonly<{ fingerprint: string; requestId: string }>;

export default function JoinPage() {
  const router = useRouter();
  const { locale } = useI18n();
  const copy = COPY[locale];
  const [token, setToken] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loginId, setLoginId] = useState("");
  const [pin, setPin] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const acceptanceAttempt = useRef<AcceptanceAttempt | null>(null);

  const submit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setError("");
      if (pin !== confirmation) {
        setError(copy.mismatch);
        return;
      }

      const normalizedToken = token.trim();
      const normalizedName = displayName.trim();
      const normalizedLogin = loginId.trim().toLowerCase();
      const fingerprint = JSON.stringify([
        normalizedToken,
        normalizedName,
        normalizedLogin,
        pin,
      ]);
      if (acceptanceAttempt.current?.fingerprint !== fingerprint) {
        acceptanceAttempt.current = {
          fingerprint,
          requestId: globalThis.crypto.randomUUID(),
        };
      }
      const requestId = acceptanceAttempt.current.requestId;

      setLoading(true);
      try {
        const response = await fetch("/api/auth/invitations/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: normalizedToken,
            requestId,
            displayName: normalizedName,
            loginId: normalizedLogin,
            pin,
          }),
        });
        const body = (await response.json()) as ApiError;
        if (!response.ok) throw new Error(body.error ?? copy.failed);
        setSuccess(true);
        router.replace("/");
        router.refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : copy.failed);
      } finally {
        setLoading(false);
      }
    },
    [confirmation, copy.failed, copy.mismatch, displayName, loginId, pin, router, token],
  );

  return (
    <div className="relative flex min-h-dvh items-center justify-center bg-muted/30 p-4">
      <RuntimeUiReadyBeacon />
      <div
        className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/5"
        aria-hidden="true"
      />
      <Card className="relative w-full max-w-lg border shadow-popover">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <UserPlus className="h-7 w-7" aria-hidden="true" />
          </div>
          <CardTitle>{copy.title}</CardTitle>
          <CardDescription>{copy.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="invite-token">{copy.token}</Label>
              <Input
                id="invite-token"
                dir="ltr"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder={copy.tokenPlaceholder}
                autoComplete="off"
                disabled={loading || success}
                required
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="display-name">{copy.name}</Label>
                <Input
                  id="display-name"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder={copy.namePlaceholder}
                  autoComplete="name"
                  minLength={1}
                  maxLength={80}
                  disabled={loading || success}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="login-id">{copy.login}</Label>
                <Input
                  id="login-id"
                  dir="ltr"
                  value={loginId}
                  onChange={(event) => setLoginId(event.target.value.toLowerCase())}
                  placeholder={copy.loginPlaceholder}
                  pattern="[a-z0-9][a-z0-9._-]{2,31}"
                  autoComplete="username"
                  disabled={loading || success}
                  required
                />
                <p className="text-xs text-muted-foreground">{copy.loginHelp}</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="member-pin">{copy.pin}</Label>
                <Input
                  id="member-pin"
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  value={pin}
                  onChange={(event) => setPin(event.target.value)}
                  minLength={8}
                  maxLength={32}
                  disabled={loading || success}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="member-pin-confirmation">{copy.confirmPin}</Label>
                <Input
                  id="member-pin-confirmation"
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  minLength={8}
                  maxLength={32}
                  disabled={loading || success}
                  required
                />
              </div>
            </div>

            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            {success ? (
              <p role="status" className="text-sm text-primary">
                {copy.success}
              </p>
            ) : null}

            <Button
              type="submit"
              className="w-full"
              disabled={
                loading ||
                success ||
                !token.trim() ||
                !displayName.trim() ||
                loginId.length < 3 ||
                pin.length < 8 ||
                confirmation.length < 8
              }
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <KeyRound className="me-2 h-4 w-4" aria-hidden="true" />
                  {copy.submit}
                  <ArrowRight
                    className="ms-2 h-4 w-4 rtl:rotate-180"
                    aria-hidden="true"
                  />
                </>
              )}
            </Button>

            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => router.push("/login")}
            >
              {copy.loginLink}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
