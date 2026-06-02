import { NextResponse } from "next/server";
import { withAuthAndRateLimit } from "@/lib/api-wrapper";

// GET /api/accounting/trend — get daily/monthly P&L trend for the charts
export const GET = withAuthAndRateLimit(
	async (req, { supabase, sellerId }) => {
		const { searchParams } = new URL(req.url);
		const period = searchParams.get("period") || "30d";

		const now = new Date();
		let startDate = new Date();
		let groupBy: "day" | "month" = "day";

		switch (period) {
			case "7d":
				startDate.setDate(now.getDate() - 6);
				startDate.setHours(0, 0, 0, 0);
				groupBy = "day";
				break;
			case "90d":
				startDate.setDate(now.getDate() - 89);
				startDate.setHours(0, 0, 0, 0);
				groupBy = "day";
				break;
			case "year":
				startDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
				groupBy = "month";
				break;
			case "30d":
			default:
				startDate.setDate(now.getDate() - 29);
				startDate.setHours(0, 0, 0, 0);
				groupBy = "day";
				break;
		}

		// Initialize map of dates to guarantee all days/months are represented on the chart
		const trendMap = new Map<
			string,
			{
				date: string;
				revenue: number;
				cogs: number;
				delivery: number;
				returnLosses: number;
				expenses: number;
				refunds: number;
			}
		>();

		if (groupBy === "day") {
			const temp = new Date(startDate);
			while (temp <= now) {
				const dateStr = temp.toISOString().split("T")[0];
				trendMap.set(dateStr, {
					date: dateStr,
					revenue: 0,
					cogs: 0,
					delivery: 0,
					returnLosses: 0,
					expenses: 0,
					refunds: 0,
				});
				temp.setDate(temp.getDate() + 1);
			}
		} else {
			// Year: generate all 12 months of current year
			const year = now.getFullYear();
			for (let m = 0; m < 12; m++) {
				const monthStr = `${year}-${String(m + 1).padStart(2, "0")}`;
				trendMap.set(monthStr, {
					date: monthStr,
					revenue: 0,
					cogs: 0,
					delivery: 0,
					returnLosses: 0,
					expenses: 0,
					refunds: 0,
				});
			}
		}

		// Fetch data in parallel
		const [deliveredRes, ordersRes, expensesRes, refundsRes] =
			await Promise.all([
				// 1. Delivered orders (revenue & cogs)
				supabase
					.from("orders")
					.select("total_price, delivered_at, items")
					.eq("seller_id", sellerId)
					.eq("status", "delivered")
					.gte("delivered_at", startDate.toISOString())
					.is("deleted_at", null),

				// 2. Delivery & returns (delivery cost & return losses)
				supabase
					.from("orders")
					.select("delivery_cost, status, created_at")
					.eq("seller_id", sellerId)
					.in("status", ["delivered", "returned", "refused"])
					.gte("created_at", startDate.toISOString())
					.is("deleted_at", null),

				// 3. Operating Expenses
				supabase
					.from("expenses")
					.select("amount, expense_date")
					.eq("seller_id", sellerId)
					.gte("expense_date", startDate.toISOString().split("T")[0]),

				// 4. Refunds
				supabase
					.from("returns")
					.select("refund_amount, resolved_at")
					.eq("seller_id", sellerId)
					.eq("status", "refunded")
					.gte("resolved_at", startDate.toISOString()),
			]);

		if (deliveredRes.error) throw deliveredRes.error;
		if (ordersRes.error) throw ordersRes.error;
		if (expensesRes.error) throw expensesRes.error;
		if (refundsRes.error) throw refundsRes.error;

		// Helper functions to map dates to keys
		const getTimestampKey = (
			isoStr: string | null | undefined,
		): string | null => {
			if (!isoStr) return null;
			const datePart = isoStr.split("T")[0];
			return groupBy === "day" ? datePart : datePart.substring(0, 7);
		};

		const getExpenseKey = (dateStr: string): string => {
			return groupBy === "day" ? dateStr : dateStr.substring(0, 7);
		};

		// 1. Aggregate Delivered Orders -> Revenue & COGS
		if (deliveredRes.data) {
			for (const o of deliveredRes.data) {
				const key = getTimestampKey(o.delivered_at);
				if (key && trendMap.has(key)) {
					const entry = trendMap.get(key)!;
					entry.revenue += Number(o.total_price) || 0;

					if (Array.isArray(o.items)) {
						for (const item of o.items as Array<Record<string, unknown>>) {
							const cost = Number(item.cost_price) || 0;
							const qty = Number(item.quantity) || 1;
							entry.cogs += cost * qty;
						}
					}
				}
			}
		}

		// 2. Aggregate Orders -> Delivery Costs & Return Losses
		if (ordersRes.data) {
			for (const o of ordersRes.data) {
				const key = getTimestampKey(o.created_at);
				if (key && trendMap.has(key)) {
					const entry = trendMap.get(key)!;
					const deliveryCost = Number(o.delivery_cost) || 0;
					entry.delivery += deliveryCost;

					if (o.status === "returned" || o.status === "refused") {
						entry.returnLosses += deliveryCost;
					}
				}
			}
		}

		// 3. Aggregate Expenses -> Operating Expenses
		if (expensesRes.data) {
			for (const e of expensesRes.data) {
				const key = getExpenseKey(e.expense_date);
				if (key && trendMap.has(key)) {
					const entry = trendMap.get(key)!;
					entry.expenses += Number(e.amount) || 0;
				}
			}
		}

		// 4. Aggregate Refunds -> Refunds
		if (refundsRes.data) {
			for (const r of refundsRes.data) {
				const key = getTimestampKey(r.resolved_at);
				if (key && trendMap.has(key)) {
					const entry = trendMap.get(key)!;
					entry.refunds += Number(r.refund_amount) || 0;
				}
			}
		}

		// Map and round results
		const trend = Array.from(trendMap.values())
			.sort((a, b) => a.date.localeCompare(b.date))
			.map((e) => {
				const totalExpenses =
					e.cogs + e.delivery + e.returnLosses + e.expenses + e.refunds;
				const netProfit = e.revenue - totalExpenses;
				return {
					date: e.date,
					revenue: Math.round(e.revenue * 100) / 100,
					cogs: Math.round(e.cogs * 100) / 100,
					delivery: Math.round(e.delivery * 100) / 100,
					returnLosses: Math.round(e.returnLosses * 100) / 100,
					expenses: Math.round(e.expenses * 100) / 100,
					refunds: Math.round(e.refunds * 100) / 100,
					totalExpenses: Math.round(totalExpenses * 100) / 100,
					netProfit: Math.round(netProfit * 100) / 100,
				};
			});

		return NextResponse.json({ trend });
	},
	{ requireAuth: true },
);
