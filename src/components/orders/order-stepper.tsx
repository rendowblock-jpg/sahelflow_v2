import { Ban, Check, RotateCcw, X, type LucideIcon } from "lucide-react";

import { cn, formatDate, type SupportedLocale } from "@/lib/utils";

/**
 * The order's path as ONE horizontal stepper (vertical on a phone): created, confirmed, packed, shipped, delivered,
 * drawn from the `timeline` array the order page builds. Pure and presentational: it holds no command, no state and no
 * query. A returned / refused / cancelled order ends in a distinct end node instead of a path that never completes.
 */

export interface OrderStepperStep {
  label: string;
  date: Date | string | null;
  done: boolean;
}

export type OrderTerminalKind = "returned" | "refused" | "cancelled";

export interface OrderStepperTerminal {
  kind: OrderTerminalKind;
  label: string;
}

export interface OrderStepperProps {
  steps: ReadonlyArray<OrderStepperStep>;
  terminal?: OrderStepperTerminal | null;
  locale: SupportedLocale;
  ariaLabel: string;
  /** Spoken state of each step (screen readers); the colour alone is not enough. */
  stateLabels: { done: string; current: string; upcoming: string };
  className?: string;
}

const TERMINAL_META: Record<OrderTerminalKind, { labelKey: string; icon: LucideIcon }> = {
  returned: { labelKey: "orders.status.returned", icon: RotateCcw },
  refused: { labelKey: "orders.status.refused", icon: X },
  cancelled: { labelKey: "orders.status.cancelled", icon: Ban },
};

/** The end node for a status that ends the path, or null for every other status. */
export function terminalStepFor(
  status: string,
  t: (key: string) => string,
): OrderStepperTerminal | null {
  if (status !== "returned" && status !== "refused" && status !== "cancelled") return null;
  return { kind: status, label: t(TERMINAL_META[status].labelKey) };
}

type NodeState = "done" | "current" | "upcoming" | "terminal";

interface StepperNode {
  key: string;
  label: string;
  date: Date | string | null;
  state: NodeState;
  terminalKind?: OrderTerminalKind;
}

function buildNodes(
  steps: ReadonlyArray<OrderStepperStep>,
  terminal: OrderStepperTerminal | null | undefined,
): StepperNode[] {
  let lastDone = -1;
  steps.forEach((step, index) => {
    if (step.done) lastDone = index;
  });
  // A step before the last finished one is finished too, even when its date was never stored.
  const visible = terminal ? steps.slice(0, Math.max(lastDone, 0) + 1) : steps;
  const nodes: StepperNode[] = visible.map((step, index) => ({
    key: `step-${index}`,
    label: step.label,
    date: index <= lastDone ? step.date : null,
    state: index <= lastDone ? "done" : index === lastDone + 1 ? "current" : "upcoming",
  }));
  if (terminal) {
    nodes.push({
      key: "terminal",
      label: terminal.label,
      date: null,
      state: "terminal",
      terminalKind: terminal.kind,
    });
  }
  return nodes;
}

function Marker({ node }: { node: StepperNode }) {
  const base = "inline-flex size-6 shrink-0 items-center justify-center rounded-full";
  if (node.state === "done") {
    return (
      <span aria-hidden="true" className={cn(base, "bg-primary text-primary-foreground")}>
        <Check className="size-3.5" />
      </span>
    );
  }
  if (node.state === "current") {
    return (
      <span aria-hidden="true" className={cn(base, "border-2 border-primary bg-card")}>
        <span className="size-2 rounded-full bg-primary" />
      </span>
    );
  }
  if (node.state === "terminal" && node.terminalKind) {
    const Icon = TERMINAL_META[node.terminalKind].icon;
    return (
      <span
        aria-hidden="true"
        className={cn(base, "border border-destructive/40 bg-destructive-soft text-destructive-ink")}
      >
        <Icon className="size-3.5" />
      </span>
    );
  }
  return <span aria-hidden="true" className={cn(base, "border border-border bg-card")} />;
}

export function OrderStepper({
  steps,
  terminal = null,
  locale,
  ariaLabel,
  stateLabels,
  className,
}: OrderStepperProps) {
  const nodes = buildNodes(steps, terminal);
  return (
    <ol
      aria-label={ariaLabel}
      className={cn("flex flex-col gap-3 sm:flex-row sm:gap-0", className)}
      data-testid="order-stepper"
    >
      {nodes.map((node, index) => {
        const next = nodes[index + 1];
        const connector =
          next?.state === "done"
            ? "bg-primary"
            : next?.state === "terminal"
              ? "bg-destructive/40"
              : "bg-border";
        return (
          <li
            key={node.key}
            data-testid="order-step"
            data-state={node.state}
            data-terminal={node.terminalKind}
            aria-current={node.state === "current" ? "step" : undefined}
            className="flex min-w-0 items-center gap-3 sm:flex-1 sm:flex-col sm:items-start sm:gap-2"
          >
            <div className="flex items-center sm:w-full">
              <Marker node={node} />
              {next ? (
                <span
                  aria-hidden="true"
                  className={cn("mx-2 hidden h-0.5 flex-1 rounded-full sm:block", connector)}
                />
              ) : null}
            </div>
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 sm:block sm:pe-2">
              {node.state !== "terminal" ? (
                <span className="sr-only">{stateLabels[node.state]}: </span>
              ) : null}
              <p
                className={cn(
                  "break-words text-sm",
                  node.state === "upcoming" ? "text-muted-foreground" : "font-medium text-foreground",
                  node.state === "terminal" && "text-destructive-ink",
                )}
              >
                {node.label}
              </p>
              {node.date ? (
                <p className="text-xs tabular-nums text-muted-foreground">
                  {formatDate(node.date, locale)}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
