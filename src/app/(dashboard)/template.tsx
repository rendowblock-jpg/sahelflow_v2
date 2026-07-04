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
 *
 * SSR HYDRATION FIX: On the first render (server + client hydration), we
 * pass initial={false} so the element starts at the animate state (opacity: 1,
 * y: 0) — matching the server-rendered HTML. After mount, we enable the
 * initial state so subsequent navigations animate from opacity:0 → opacity:1.
 * This is the documented Framer Motion SSR pattern.
 */
import { useState, useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { usePathname } from "next/navigation";

export default function DashboardTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  // mounted = false on SSR + first hydration, true after first effect.
  // This prevents the hydration mismatch: on first render, initial={false}
  // (starts at animate state, matches server). After mount, initial is
  // enabled so navigation triggers the fade+slide.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  return (
    <motion.div
      key={pathname}
      initial={
        !mounted || reduceMotion
          ? false
          : { opacity: 0, y: 4 }
      }
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
