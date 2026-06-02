export interface Order {
	id: string;
	order_number: string;
	status: string;
	total_price: number;
	delivery_cost?: number;
	wilaya?: string;
	commune?: string;
	address?: string;
	notes?: string;
	items?: { product_name?: string; name?: string; quantity: number; unit_price: number }[];
	customer?: { name?: string; phone?: string } | null;
	customer_id?: string;
	created_at: string;
}

export interface OrderStats {
	total: number;
	pending: number;
	confirmed: number;
	shipped: number;
	delivered: number;
	returned: number;
	cancelled: number;
	revenue: number;
}

export type ProductOption = {
	id: string;
	name: string;
	price: number;
	cost_price?: number;
	stock?: number;
};
