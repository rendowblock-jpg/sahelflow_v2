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
  const { dir } = useI18n();
  const isRtl = dir === "rtl";

  return (
    <nav aria-label="Breadcrumb" className={cn("flex items-center gap-1 text-sm", className)}>
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <React.Fragment key={i}>
            {i > 0 && (
              <ChevronRight
                className={cn(
                  "size-3.5 text-muted-foreground/50 shrink-0",
                  isRtl && "icon-rtl-flip",
                )}
              />
            )}
            {isLast || !item.href ? (
              <span className="font-medium text-foreground truncate max-w-[200px]">
                {item.label}
              </span>
            ) : (
              <Link
                href={item.href}
                className="text-muted-foreground hover:text-foreground transition-colors truncate max-w-[200px]"
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
