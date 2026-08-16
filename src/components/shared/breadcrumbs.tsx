"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/hooks/use-i18n";

interface BreadcrumbItem {
  label: React.ReactNode;
  href?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

/**
 * Premium breadcrumbs — RTL-aware, with chevron separators.
 * The last item is the current page (non-clickable, muted).
 */
export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  const { t } = useI18n();

  return (
    <nav
      aria-label={t("common.breadcrumb")}
      className={cn("flex items-center gap-1 text-sm", className)}
    >
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <React.Fragment key={i}>
            {i > 0 && (
              <ChevronRight
                className="size-3.5 shrink-0 text-muted-foreground/50 rtl:rotate-180"
                aria-hidden="true"
              />
            )}
            {isLast || !item.href ? (
              <span className="max-w-[200px] truncate font-medium text-foreground">
                {item.label}
              </span>
            ) : (
              <Link
                href={item.href}
                className="max-w-[200px] truncate text-muted-foreground transition-colors hover:text-foreground"
              >
                {item.label}
              </Link>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
