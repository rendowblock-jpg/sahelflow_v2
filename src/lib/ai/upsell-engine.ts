/**
 * SahelFlow Upsell Suggestion Engine
 *
 * Margin-aware product suggestions during order confirmation.
 * Recommends high-margin complementary products to increase average order value.
 *
 * Strategy:
 * 1. Find categories of products already in the order
 * 2. Suggest high-margin products NOT already in the order
 * 3. Prioritize complementary categories (same or related)
 * 4. Only suggest in-stock items
 */

export interface UpsellSuggestion {
  product_id: string;
  name: string;
  price: number;
  cost_price: number;
  margin: number;
  marginPercent: number;
  stock: number;
  category_id: string | null;
  category_name: string | null;
  image_url: string | null;
  reason: string;
}

interface CatalogProduct {
  id: string;
  name: string;
  price: number;
  cost_price: number;
  stock: number;
  category_id: string | null;
  image_url: string | null;
  active: boolean;
  categories?: { name: string }[] | { name: string } | null;
}

const COMPLEMENTARY_CATEGORIES: Record<string, string[]> = {
  fashion: ["beauty", "accessories"],
  beauty: ["fashion", "home"],
  electronics: ["accessories", "sports"],
  home: ["beauty", "fashion"],
  sports: ["fashion", "electronics"],
  accessories: ["fashion", "beauty"],
};

function getCategoryName(p: CatalogProduct): string {
  if (!p.categories) return "";
  if (Array.isArray(p.categories)) return p.categories[0]?.name?.toLowerCase() || "";
  return p.categories.name?.toLowerCase() || "";
}

export function generateUpsellSuggestions(
  orderItems: Array<{ product_id?: string; product_name: string; quantity: number }>,
  catalog: CatalogProduct[],
  options: {
    maxSuggestions?: number;
    minMarginPercent?: number;
    minStock?: number;
  } = {}
): UpsellSuggestion[] {
  const {
    maxSuggestions = 3,
    minMarginPercent = 20,
    minStock = 1,
  } = options;

  const orderProductIds = new Set(orderItems.map((i) => i.product_id).filter(Boolean));
  const orderCategoryIds = new Set<string>();

  for (const item of orderItems) {
    const product = catalog.find((p) => p.id === item.product_id);
    if (product?.category_id) {
      orderCategoryIds.add(product.category_id);
    }
  }

  const candidates = catalog.filter((p) => {
    if (!p.active) return false;
    if (p.stock < minStock) return false;
    if (orderProductIds.has(p.id)) return false;
    const margin = p.price - p.cost_price;
    const marginPct = p.price > 0 ? (margin / p.price) * 100 : 0;
    if (marginPct < minMarginPercent) return false;
    return true;
  });

  const scored = candidates.map((p) => {
    const margin = p.price - p.cost_price;
    const marginPct = p.price > 0 ? (margin / p.price) * 100 : 0;

    let relevanceScore = 0;

    if (p.category_id && orderCategoryIds.has(p.category_id)) {
      relevanceScore += 30;
    }

    const catName = getCategoryName(p);
    const productCat = Object.entries(COMPLEMENTARY_CATEGORIES).find(
      ([key, complements]) =>
        catName.includes(key) || complements.some((c) => catName.includes(c))
    );
    if (productCat) {
      const complements = COMPLEMENTARY_CATEGORIES[productCat[0]] || [];
      for (const orderId of orderCategoryIds) {
        const orderProduct = catalog.find((cp) => cp.category_id === orderId);
        const orderCatName = getCategoryName(orderProduct!);
        if (complements.some((c) => orderCatName.includes(c))) {
          relevanceScore += 20;
        }
      }
    }

    relevanceScore += marginPct * 0.3;
    relevanceScore += Math.min(p.stock, 10) * 2;

    let reason = "High margin product";
    if (p.category_id && orderCategoryIds.has(p.category_id)) {
      reason = "Same category — customer likely interested";
    } else if (relevanceScore > 30) {
      reason = "Complementary to order items";
    }
    if (marginPct > 60) {
      reason += " • Excellent margin";
    }

    return {
      product_id: p.id,
      name: p.name,
      price: p.price,
      cost_price: p.cost_price,
      margin: Math.round(margin),
      marginPercent: Math.round(marginPct),
      stock: p.stock,
      category_id: p.category_id,
      category_name: getCategoryName(p) || null,
      image_url: p.image_url,
      reason,
      _score: relevanceScore + marginPct,
    } as UpsellSuggestion & { _score: number };
  });

  scored.sort((a, b) => b._score - a._score);

  return scored.slice(0, maxSuggestions).map(({ _score, ...rest }) => rest);
}
