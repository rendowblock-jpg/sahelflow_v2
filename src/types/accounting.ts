export type ExpenseCategory =
  | "ads"
  | "packaging"
  | "delivery_fees"
  | "returns"
  | "supplies"
  | "salary"
  | "rent"
  | "other";

export interface Expense {
  id: string;
  seller_id: string;
  category: ExpenseCategory;
  amount: number;
  description: string | null;
  receipt_url: string | null;
  expense_date: string; // DATE format: YYYY-MM-DD
  created_at: string;
  updated_at: string;
}

export interface PnLSummary {
  revenue: number;
  cost_of_goods: number;
  delivery_costs: number;
  return_losses: number;
  expenses: number;
  refunds: number;
  orders_delivered: number;
  orders_returned: number;
}

export interface ProductProfitability {
  id: string;
  name: string;
  price: number;
  cost_price: number;
  units_sold: number;
  total_revenue: number;
  total_profit: number;
  units_returned: number;
  delivery_rate: number;
}
