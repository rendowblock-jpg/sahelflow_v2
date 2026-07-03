"use client";

/**
 * Route-level template — wraps every page in the (dashboard) group with a
 * subtle fade+slide transition on navigation (Phase 2).
 *
 * Next.js re-renders template.tsx on every navigation (unlike layout.tsx
 * which persists). Using framer-motion's motion.div with a key on the
 * pathname gives a smooth enter animation per route.
 *
 * The transition is intentionally subtle (150ms, 4px slide) — noticeable
 * enough to feel "alive" but not slow. Respects prefers-reduced-motion.
 */
import { motion, useReducedMotion } from "framer-motion";
import { usePathname } from "next/navigation";

export default function DashboardTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      key={pathname}
      initial={reduceMotion ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
