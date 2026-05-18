/**
 * WhatsApp Template Interpolation
 *
 * Replaces {{variable}} placeholders in template content with actual values.
 * Supported variables: {{customer_name}}, {{order_number}}, {{wilaya}},
 * {{product_name}}, {{business_name}}, {{total_price}}, {{items}}
 */

export interface TemplateVariables {
  customer_name?: string;
  order_number?: string;
  wilaya?: string;
  commune?: string;
  product_name?: string;
  business_name?: string;
  total_price?: string | number;
  items?: string;
}

export function interpolateTemplate(content: string, vars: TemplateVariables): string {
  return content.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    const value = vars[key as keyof TemplateVariables];
    if (value !== undefined && value !== null) {
      return String(value);
    }
    return match;
  });
}

/**
 * Build template variables from an order and seller data
 */
export function buildTemplateVars(data: {
  customer_name?: string;
  order_number?: string;
  wilaya?: string;
  commune?: string;
  items?: Array<{ product_name: string; quantity: number }>;
  total_price?: number;
  business_name?: string;
}): TemplateVariables {
  return {
    customer_name: data.customer_name || "الزبون",
    order_number: data.order_number || "",
    wilaya: data.wilaya || "",
    commune: data.commune || "",
    product_name: data.items?.[0]?.product_name || "",
    business_name: data.business_name || "SahelFlow",
    total_price: data.total_price ? `${Number(data.total_price).toLocaleString("fr-DZ")} DA` : "",
    items: data.items?.map((i) => `${i.quantity}x ${i.product_name}`).join(", ") || "",
  };
}
