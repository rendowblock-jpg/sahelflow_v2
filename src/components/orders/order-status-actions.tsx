"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getAllowedTransitions } from "@/lib/order-transitions";
import type { OrderStatus } from "@/types/domain";
import {
  CheckCircle2,
  Truck,
  PackageCheck,
  RotateCcw,
  XCircle,
  Ban,
  Loader2,
} from "lucide-react";

const ACTION_CONFIG: Record<
  OrderStatus,
  { label: string; icon: typeof CheckCircle2; variant: "default" | "destructive" | "outline" }
> = {
  confirmed: { label: "Confirmer", icon: CheckCircle2, variant: "default" },
  shipped: { label: "Expédier", icon: Truck, variant: "default" },
  delivered: { label: "Marquer livrée", icon: PackageCheck, variant: "default" },
  returned: { label: "Retour", icon: RotateCcw, variant: "destructive" },
  refused: { label: "Refusée", icon: XCircle, variant: "destructive" },
  cancelled: { label: "Annuler", icon: Ban, variant: "destructive" },
  draft: { label: "", icon: CheckCircle2, variant: "outline" },
  pending: { label: "", icon: CheckCircle2, variant: "outline" },
};

interface OrderStatusActionsProps {
  orderId: string;
  currentStatus: OrderStatus;
}

export function OrderStatusActions({ orderId, currentStatus }: OrderStatusActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<OrderStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const allowed = getAllowedTransitions(currentStatus);

  async function handleTransition(to: OrderStatus) {
    setLoading(to);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: to }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Échec de la mise à jour");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue");
    } finally {
      setLoading(null);
    }
  }

  if (allowed.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Badge variant="outline">Statut final</Badge>
        <span>Aucune action possible sur cette commande.</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">Actions:</span>
        {allowed.map((target) => {
          const config = ACTION_CONFIG[target];
          if (!config || !config.label) return null;
          const Icon = config.icon;
          const isLoading = loading === target;
          return (
            <Button
              key={target}
              variant={config.variant}
              size="sm"
              onClick={() => handleTransition(target)}
              disabled={loading !== null}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Icon className="h-4 w-4 mr-1.5" />
              )}
              {config.label}
            </Button>
          );
        })}
      </div>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
