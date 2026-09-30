"use client";

import type { ReactNode } from "react";
import {
  BadgeCheck,
  Headphones,
  Mail,
  MapPin,
  MessageCircle,
  PackageCheck,
  PhoneCall,
} from "lucide-react";

import { useStorefrontI18n } from "@/components/storefront/storefront-locale-provider";
import type {
  StorefrontContactInfo,
  StorefrontDensity,
  StorefrontRadius,
  StorefrontTheme,
} from "@/lib/storefront/presentation-types";
import type {
  StorefrontBlock,
  StorefrontSection,
} from "@/lib/storefront/studio-sections";
import { cn } from "@/lib/utils";

/**
 * Shared building blocks of the storefront renderer (public store and Studio
 * preview). Every colour comes from the storefront theme bridge tokens set on
 * `data-storefront-root`, so these parts never read the dashboard theme.
 */

export type InspectProps = React.HTMLAttributes<HTMLElement> & {
  "data-studio-section"?: string;
  "data-studio-selected"?: "true";
};

export function textSetting(section: StorefrontSection, key: string): string {
  const value = section.settings[key];
  return typeof value === "string" ? value.trim() : "";
}

export function blockText(block: StorefrontBlock, key: string): string {
  const value = block.settings[key];
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Seller-owned storefront identity, deliberately NOT the app's control/surface
 * pair — see globals.css and INTERFACE_SYSTEM.md §3. Three settings must stay
 * three distinct radii or the seller's theme control loses an option.
 */
export function radius(value: StorefrontRadius): string {
  return value === "sharp"
    ? "rounded-none"
    : value === "rounded"
      ? "rounded-storefront-round"
      : "rounded-storefront-soft";
}

/** Vertical rhythm per density: airy stores breathe, compact ones pack. */
export function sectionSpace(density: StorefrontDensity): string {
  return density === "compact"
    ? "py-8 sm:py-10"
    : density === "balanced"
      ? "py-10 sm:py-14"
      : "py-12 sm:py-16";
}

export function Container({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8", className)}>
      {children}
    </div>
  );
}

export function SectionHeading({
  title,
  eyebrow,
  aside,
  embedded,
}: {
  title: string;
  eyebrow?: string;
  aside?: ReactNode;
  embedded: boolean;
}) {
  const Heading = embedded ? "h3" : "h2";
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3 sm:mb-8">
      <div className="min-w-0">
        {eyebrow ? (
          <p
            dir="auto"
            className="mb-2 text-xs font-semibold uppercase tracking-[0.14em]"
            style={{ color: "var(--sf-brand-text)" }}
          >
            {eyebrow}
          </p>
        ) : null}
        <Heading dir="auto" className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {title}
        </Heading>
      </div>
      {aside}
    </div>
  );
}

export function hasContact(contact: StorefrontContactInfo): boolean {
  return Boolean(
    contact.phone.trim() ||
      contact.whatsapp.trim() ||
      contact.email.trim() ||
      contact.address.trim(),
  );
}

function whatsappHref(value: string): string {
  const digits = value.replace(/\D/g, "");
  const international = digits.startsWith("0") ? `213${digits.slice(1)}` : digits;
  return `https://wa.me/${international}`;
}

/** The store's contact channels as tappable tiles (call, WhatsApp, email). */
export function StorefrontContactBlock({
  contact,
  radiusValue,
}: {
  contact: StorefrontContactInfo;
  radiusValue: StorefrontRadius;
}) {
  const { t } = useStorefrontI18n();
  const channels: Array<{
    key: string;
    icon: ReactNode;
    label: string;
    value: string;
    href?: string;
    ltr: boolean;
  }> = [];
  if (contact.phone) {
    channels.push({
      key: "phone",
      icon: <PhoneCall />,
      label: t("storefront.view.callUs"),
      value: contact.phone,
      href: `tel:${contact.phone.replace(/\s/g, "")}`,
      ltr: true,
    });
  }
  if (contact.whatsapp) {
    channels.push({
      key: "whatsapp",
      icon: <MessageCircle />,
      label: t("storefront.view.whatsappUs"),
      value: contact.whatsapp,
      href: whatsappHref(contact.whatsapp),
      ltr: true,
    });
  }
  if (contact.email) {
    channels.push({
      key: "email",
      icon: <Mail />,
      label: t("storefront.view.emailUs"),
      value: contact.email,
      href: `mailto:${contact.email}`,
      ltr: true,
    });
  }
  if (contact.address) {
    channels.push({
      key: "address",
      icon: <MapPin />,
      label: t("storefront.view.visitUs"),
      value: contact.address,
      ltr: false,
    });
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {channels.map((channel) => {
        const content = (
          <>
            <span
              className="flex size-10 shrink-0 items-center justify-center rounded-full [&_svg]:size-4"
              style={{ background: "var(--accent)", color: "var(--sf-brand-text-on-surface)" }}
              aria-hidden="true"
            >
              {channel.icon}
            </span>
            <span className="min-w-0">
              <span className="block text-xs font-medium text-muted-foreground">
                {channel.label}
              </span>
              {channel.ltr ? (
                <bdi dir="ltr" className="block truncate text-sm font-semibold">
                  {channel.value}
                </bdi>
              ) : (
                <span dir="auto" className="block text-sm font-semibold">
                  {channel.value}
                </span>
              )}
            </span>
          </>
        );
        const className = cn(
          radius(radiusValue),
          "flex items-center gap-3 border bg-card p-4 transition-colors",
          channel.href && "hover:border-primary",
        );
        return channel.href ? (
          <a
            key={channel.key}
            href={channel.href}
            className={className}
            target={channel.key === "whatsapp" ? "_blank" : undefined}
            rel={channel.key === "whatsapp" ? "noopener noreferrer" : undefined}
          >
            {content}
          </a>
        ) : (
          <div key={channel.key} className={className}>
            {content}
          </div>
        );
      })}
    </div>
  );
}

/** An authored-but-empty section, visible only in the Studio preview. */
export function EmptyStudioSection({
  section,
  props,
  label,
}: {
  section: StorefrontSection;
  props: InspectProps;
  label: string;
}) {
  return (
    <section key={section.id} {...props} className={cn(props.className, "py-4")}>
      <Container>
        <div className="rounded-storefront-soft border border-dashed p-6 text-center text-sm text-muted-foreground">
          {label}
        </div>
      </Container>
    </section>
  );
}

/** The store header: monogram and name, section links, header actions. */
export function StorefrontHeader({
  inspectProps,
  theme,
  storeName,
  sticky,
  actions,
}: {
  inspectProps: InspectProps;
  theme: StorefrontTheme;
  storeName: string;
  sticky: boolean;
  actions?: ReactNode;
}) {
  const { t } = useStorefrontI18n();
  return (
    <header
      {...inspectProps}
      className={cn(inspectProps.className, "top-0 z-30 border-b backdrop-blur-md", sticky && "sticky")}
      style={{ background: "color-mix(in srgb, var(--background) 88%, transparent)" }}
    >
      <Container className="flex h-16 items-center justify-between gap-4">
        <a href="#" className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden="true"
            className={cn(radius(theme.radius), "flex size-9 shrink-0 items-center justify-center text-sm font-bold")}
            style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
          >
            {storeName.trim().charAt(0).toUpperCase()}
          </span>
          <b
            dir="auto"
            className={cn(
              "truncate text-base",
              theme.template === "sahara" && "text-sm uppercase tracking-[0.14em]",
            )}
          >
            {storeName}
          </b>
        </a>
        <nav className="flex items-center gap-1 text-sm font-medium">
          <a href="#storefront-catalog" className="hidden rounded-full px-3 py-2 text-muted-foreground hover:text-foreground sm:inline-flex">
            {t("storefront.view.navProducts")}
          </a>
          {hasContact(theme.builder.contact) ? (
            <a href="#storefront-contact" className="hidden rounded-full px-3 py-2 text-muted-foreground hover:text-foreground sm:inline-flex">
              {t("storefront.view.navContact")}
            </a>
          ) : null}
          {actions}
        </nav>
      </Container>
    </header>
  );
}

/** The store's promises (cash on delivery, confirmation, delivery, support). */
export function StorefrontTrustStrip({
  inspectProps,
  theme,
}: {
  inspectProps: InspectProps;
  theme: StorefrontTheme;
}) {
  const { t } = useStorefrontI18n();
  const badges = [
    theme.trust.showCodBadge && { icon: <BadgeCheck />, label: t("storefront.studio.cashOnDelivery") },
    theme.trust.showPhoneConfirmationBadge && { icon: <PhoneCall />, label: t("storefront.studio.phoneConfirmation") },
    theme.trust.showDeliveryBadge && { icon: <PackageCheck />, label: t("storefront.studio.homeDeskDelivery") },
    theme.trust.showSupportBadge && { icon: <Headphones />, label: t("storefront.studio.sellerSupport") },
  ].filter(Boolean) as Array<{ icon: ReactNode; label: string }>;
  if (badges.length === 0) return null;
  return (
    <section {...inspectProps} className={cn(inspectProps.className, "py-4")}>
      <Container>
        <ul className={cn(radius(theme.radius), "grid grid-cols-2 border bg-card sm:grid-cols-4")}>
          {badges.map((badge, index) => (
            <li
              key={badge.label}
              className={cn(
                "flex items-center gap-3 px-4 py-4",
                index > 0 && "sm:border-s",
                index > 1 && "max-sm:border-t",
                index % 2 === 1 && "max-sm:border-s",
              )}
            >
              <span
                aria-hidden="true"
                className="flex size-9 shrink-0 items-center justify-center rounded-full [&_svg]:size-4"
                style={{ background: "var(--accent)", color: "var(--sf-brand-text-on-surface)" }}
              >
                {badge.icon}
              </span>
              <span className="text-sm font-medium leading-5">{badge.label}</span>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

/** Closes the page: store name, the seller's tagline, the platform credit. */
export function StorefrontFooter({
  inspectProps,
  name,
  tagline,
}: {
  inspectProps: InspectProps;
  name: string;
  tagline: string;
}) {
  const { t } = useStorefrontI18n();
  return (
    <footer {...inspectProps} className={cn(inspectProps.className, "mt-8 border-t py-10")}>
      <Container className="flex flex-col items-center gap-2 text-center text-sm text-muted-foreground">
        <span className="font-semibold text-foreground">
          {t("storefront.studio.footerBrand", { name })}
        </span>
        {tagline ? <span dir="auto">{tagline}</span> : null}
        <span className="text-xs">{t("storefront.view.poweredBy")}</span>
      </Container>
    </footer>
  );
}
