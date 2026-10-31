"use client";

import { StudioRouteError } from "@/components/storefront/studio/studio-route-error";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <StudioRouteError error={error} reset={reset} />;
}
