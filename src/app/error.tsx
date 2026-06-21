"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold">Une erreur est survenue</h1>
        <p className="text-sm text-muted-foreground max-w-md">
          {error.message || "Quelque chose s&apos;est mal passé. Veuillez réessayer."}
        </p>
      </div>
      <Button onClick={reset}>
        Réessayer
      </Button>
    </div>
  );
}
