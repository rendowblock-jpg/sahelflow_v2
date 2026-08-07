import type { OrderStatus } from "@/types/domain";

export type MutationAuthority =
  | "canonical_v1"
  | "confirmation_blocked"
  | "legacy_compatibility";

export interface WorkbenchFieldAccess {
  contact: boolean;
  financials: boolean;
  risk: boolean;
  update: boolean;
  delete: boolean;
}

export interface OrderListItem {
  id: string;
  orderNumber: string;
  status: OrderStatus | string;
  totalPrice: number | null;
  wilaya: string | null;
  phone: string | null;
  createdAt: Date | string;
  items: Array<{ id: string }>;
  customer: { name: string | null; phone: string | null } | null;
  mutationAuthority: MutationAuthority;
}

export interface RiskListProjection {
  level: string;
  score: number;
}

export interface OrdersWorkbenchResponse {
  orders: OrderListItem[];
  riskData?: Record<string, RiskListProjection>;
  fieldAccess: WorkbenchFieldAccess;
  total: number;
  hasNextPage: boolean;
  page: number;
  pageSize: number;
  sort: string;
}

export interface ConfirmationQueueItem {
  id: string;
  orderNumber: string;
  version: number;
  ageMinutes: number;
  isStale: boolean;
  ageLabel: string;
  mutationAuthority: MutationAuthority;
  canUpdate: boolean;
  customerName: string | null;
  phone: string | null;
  wilaya: string | null;
  totalPrice: number | null;
}

export interface ConfirmationQueueResponse {
  queue: ConfirmationQueueItem[];
  fieldAccess: Pick<WorkbenchFieldAccess, "contact" | "financials">;
  total: number;
  staleCount: number;
  totalValue: number | null;
  hasNextPage: boolean;
  page: number;
  pageSize: number;
}
