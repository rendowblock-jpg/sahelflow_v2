import { NextResponse } from 'next/server'
import { withAuthAndRateLimit } from '@/lib/api-wrapper'
import { getDeliveryAdapter, getAllDeliveryAdapters } from '@/lib/delivery/adapters'
import { z } from 'zod'

const createShipmentSchema = z.object({
  orderId: z.string().uuid(),
  provider: z.string().optional().default('yalidine'),
})

const SKELETON_PROVIDERS = new Set<string>([])

export const POST = withAuthAndRateLimit(
  async (req, { user: _user, sellerId, supabase, body }) => {
    const { orderId, provider } = body!

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, order_number, status, items, total_price, wilaya, commune, address, customer:customers(name, phone, wilaya, commune, address)')
      .eq('id', orderId)
      .eq('seller_id', sellerId)
      .single()

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    if (order.status !== 'confirmed' && order.status !== 'pending') {
      return NextResponse.json(
        { error: `Order must be confirmed or pending. Current: ${order.status}` },
        { status: 400 },
      )
    }

    if (SKELETON_PROVIDERS.has(provider)) {
      const adapter = getDeliveryAdapter(provider)
      const name = adapter?.name || provider
      return NextResponse.json(
        { error: `${name} API integration coming soon — use CSV export from the Delivery page.`, isSkeleton: true },
        { status: 400 },
      )
    }

    const adapter = getDeliveryAdapter(provider)
    if (!adapter) {
      return NextResponse.json({ error: `Unknown delivery provider: ${provider}` }, { status: 400 })
    }

    const { data: integration } = await supabase
      .from('integrations')
      .select('credentials')
      .eq('seller_id', sellerId)
      .eq('platform', provider)
      .eq('is_active', true)
      .single()

    if (!integration) {
      return NextResponse.json(
        { error: `${adapter.name} not configured. Connect it in Settings → Integrations.` },
        { status: 400 },
      )
    }

    const customer = order.customer as unknown as Record<string, string> | null
    const shipmentItems = (order.items as Array<Record<string, unknown>>) || []

    const result = await adapter.createShipment(
      {
        orderId: order.id,
        orderNumber: order.order_number,
        customer: {
          name: customer?.name || 'Unknown',
          phone: customer?.phone || '',
          wilaya: customer?.wilaya || order.wilaya || '',
          commune: customer?.commune || order.commune || '',
          address: customer?.address || order.address || '',
        },
        items: shipmentItems.map((i) => ({
          name: String(i.product_name || i.name || 'Item'),
          quantity: Number(i.quantity || 1),
          unitPrice: Number(i.unit_price || i.price || 0),
        })),
        totalPrice: Number(order.total_price),
        weight: 0.5,
        notes: '',
      },
      integration.credentials as Record<string, unknown>,
    )

    if (!result.success) {
      const idempotencyKey = `delivery:${order.id}:${Date.now()}`;
      await supabase.from('webhook_retry_queue').insert({
        idempotency_key: idempotencyKey,
        event_type: 'delivery.create',
        payload: { orderId: order.id, provider },
        seller_id: sellerId,
        error: result.error || 'Unknown delivery failure',
        status: 'pending',
      });

      return NextResponse.json(
        { error: `Shipment failed: ${result.error}` },
        { status: 502 },
      )
    }

    const { error: deliveryError } = await supabase.from('deliveries').insert({
      order_id: order.id,
      seller_id: sellerId,
      provider,
      tracking_number: result.trackingId,
      status: 'created',
      raw_response: result as unknown as Record<string, unknown>,
    })

    if (deliveryError) {
      console.log(JSON.stringify({ type: "delivery_insert_error", error: deliveryError.message }))
    }

    await supabase
      .from('orders')
      .update({
        tracking_id: result.trackingId,
        delivery_company: provider,
      })
      .eq('id', order.id)

    return NextResponse.json({
      success: true,
      trackingId: result.trackingId,
      provider,
      estimatedDelivery: result.estimatedDelivery,
      cost: result.cost,
    })
  },
  {
    requirePermission: "orders:manage",
    schema: createShipmentSchema,
    rateLimitConfig: { maxRequests: 20, windowMs: 60000 },
  },
)

export async function GET() {
  const adapters = getAllDeliveryAdapters()
  return NextResponse.json({
    providers: adapters.map(a => ({
      id: a.id,
      name: a.name,
      logo: a.logo,
      isSkeleton: SKELETON_PROVIDERS.has(a.id),
    })),
  })
}
