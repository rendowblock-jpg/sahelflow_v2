"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Eye, KeyRound, Loader2, Wrench } from "lucide-react";

import {
  Field,
  Row,
  RowGroup,
  Section,
  SectionStack,
  StateSurface,
} from "@/components/system";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/hooks/use-i18n";
import {
  getPhase2PresetPermissions,
  type Phase2Action,
  type Phase2Role,
} from "@/lib/identity/permissions";
import {
  getTeamCopy,
  summarizeTeamAccess,
  type TeamAreaAccess,
  type TeamCopyKey,
} from "@/lib/i18n/team-workspace";
import { toast } from "@/lib/toast";

type MemberProfile = {
  kind: "team_member" | "owner";
  displayName?: string;
  loginId?: string;
  role: Phase2Role;
  permissions: Phase2Action[] | null;
  shopIds: string[];
};

const MIN_PIN_LENGTH = 8;

async function fetchProfile(): Promise<MemberProfile> {
  const response = await fetch("/api/auth/me", { cache: "no-store" });
  if (!response.ok) throw new Error("load");
  return ((await response.json()) as { profile: MemberProfile }).profile;
}

const ACCESS_ICON: Record<TeamAreaAccess, typeof Check> = {
  edit: Wrench,
  view: Eye,
  use: Check,
};

/**
 * A team member's own account: who they are signed in as, what their role lets
 * them do in plain words, and their own PIN. Owners manage their PIN under
 * Security; their identity is the installation itself.
 */
export function MemberAccountPanel() {
  const { t, locale } = useI18n();
  const c = useCallback(
    (key: TeamCopyKey, params?: Record<string, string | number>) =>
      getTeamCopy(locale, key, params),
    [locale],
  );
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      setProfile(await fetchProfile());
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchProfile()
      .then((next) => {
        if (!cancelled) setProfile(next);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loadFailed) {
    return (
      <StateSurface
        icon={KeyRound}
        title={c("team.loadError")}
        tone="danger"
        actions={
          <Button variant="outline" size="sm" onClick={() => void load()}>
            {c("team.retry")}
          </Button>
        }
      />
    );
  }
  if (!profile) {
    return (
      <div className="flex justify-center p-8" role="status" aria-live="polite">
        <Loader2
          className="size-5 animate-spin text-muted-foreground"
          aria-hidden="true"
        />
      </div>
    );
  }

  const permissions =
    profile.permissions ?? getPhase2PresetPermissions(profile.role);
  const areas = summarizeTeamAccess(permissions);
  const roleKey = `role.${profile.role}` as TeamCopyKey;

  return (
    <SectionStack data-member-account="true">
      <RowGroup>
        {profile.displayName ? (
          <Row
            label={profile.displayName}
            description={c(`${roleKey}.description` as TeamCopyKey)}
            control={<Badge variant="secondary">{c(roleKey)}</Badge>}
          />
        ) : null}
        {profile.loginId ? (
          <Row
            label={c("account.loginId")}
            control={
              <span dir="ltr" className="font-mono text-body-sm">
                {profile.loginId}
              </span>
            }
          />
        ) : null}
        <Row
          label={c("account.shops")}
          control={
            <span className="text-body-sm tabular-nums">
              {profile.shopIds.length}
            </span>
          }
        />
      </RowGroup>

      <Section
        title={c("account.access")}
        description={c("access.askOwner")}
        as="h3"
      >
        <RowGroup>
          {areas.map(({ area, access }) => {
            const Icon = ACCESS_ICON[access];
            const label = area.label.startsWith("nav.")
              ? t(area.label)
              : c(area.label as TeamCopyKey);
            return (
              <Row
                key={area.id}
                label={label}
                control={
                  <span className="inline-flex items-center gap-1.5 text-body-sm text-muted-foreground">
                    <Icon className="size-3.5" aria-hidden="true" />
                    {c(`access.${access}` as TeamCopyKey)}
                  </span>
                }
              />
            );
          })}
        </RowGroup>
      </Section>

      {profile.kind === "team_member" ? (
        <OwnPinForm c={c} />
      ) : (
        <p className="text-body-sm text-muted-foreground">
          {c("account.ownerHint")}
        </p>
      )}
    </SectionStack>
  );
}

function OwnPinForm({
  c,
}: {
  c: (key: TeamCopyKey, params?: Record<string, string | number>) => string;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (next.length < MIN_PIN_LENGTH) return setError(c("pin.tooShort"));
    if (next !== confirm) return setError(c("pin.mismatch"));
    if (next === current) return setError(c("account.pinSame"));
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/me/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPin: current, newPin: next }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        code?: string;
      };
      if (!response.ok) {
        setError(
          body.code === "INVALID_CREDENTIALS"
            ? c("account.pinWrong")
            : c("team.error"),
        );
        return;
      }
      setCurrent("");
      setNext("");
      setConfirm("");
      toast.success(c("account.pinChanged"));
    } catch {
      setError(c("team.error"));
    } finally {
      setPending(false);
    }
  }

  const fields: Array<
    [string, TeamCopyKey, string, (value: string) => void, string]
  > = [
    [
      "member-pin-current",
      "account.currentPin",
      current,
      setCurrent,
      "current-password",
    ],
    ["member-pin-next", "account.newPin", next, setNext, "new-password"],
    [
      "member-pin-confirm",
      "account.confirmPin",
      confirm,
      setConfirm,
      "new-password",
    ],
  ];

  return (
    <Section
      title={c("account.pinTitle")}
      description={c("account.pinHint")}
      as="h3"
    >
      <form
        className="grid max-w-md gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {fields.map(([id, label, value, setValue, autoComplete], index) => (
          <Field
            key={id}
            id={id}
            label={c(label)}
            error={
              index === fields.length - 1 ? (error ?? undefined) : undefined
            }
            required
          >
            {(control) => (
              <Input
                {...control}
                type="password"
                inputMode="numeric"
                autoComplete={autoComplete}
                dir="ltr"
                value={value}
                disabled={pending}
                onChange={(event) => {
                  setValue(event.target.value);
                  if (error) setError(null);
                }}
              />
            )}
          </Field>
        ))}
        <div>
          <Button
            type="submit"
            disabled={pending || !current || !next || !confirm}
          >
            {pending ? (
              <Loader2
                className="me-2 size-4 animate-spin"
                aria-hidden="true"
              />
            ) : null}
            {c("account.savePin")}
          </Button>
        </div>
      </form>
    </Section>
  );
}
