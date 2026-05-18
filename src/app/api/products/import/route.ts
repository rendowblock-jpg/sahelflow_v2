import { NextResponse } from 'next/server'
import { withAuthAndRateLimit } from '@/lib/api-wrapper'
import { z } from 'zod'

const importSchema = z.object({
  products: z.array(z.object({
    name: z.string().min(1),
    price: z.coerce.number().min(0),
    cost_price: z.coerce.number().optional(),
    stock: z.coerce.number().optional(),
    sku: z.string().optional(),
    description: z.string().optional(),
    category: z.string().optional(),
  })).min(1).max(500),
})

export const POST = withAuthAndRateLimit(
  async (req, { user, supabase, body }) => {
    const { products } = body as z.infer<typeof importSchema>

    const results = { created: 0, skipped: 0, errors: [] as string[] }

    for (let i = 0; i < products.length; i++) {
      const p = products[i]

      try {
        let category_id: string | null = null
        if (p.category) {
          const { data: existingCat } = await supabase
            .from('categories')
            .select('id')
            .ilike('name', p.category)
            .limit(1)
            .single()

          if (existingCat) {
            category_id = existingCat.id
          } else {
            const { data: newCat, error: catErr } = await supabase
              .from('categories')
              .insert({ name: p.category, slug: p.category.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''), seller_id: user.id, sort_order: 999 + i })
              .select('id')
              .single()
            if (!catErr && newCat) category_id = newCat.id
          }
        }

        if (p.sku) {
          const { data: existing } = await supabase
            .from('products')
            .select('id')
            .eq('seller_id', user.id)
            .eq('sku', p.sku)
            .limit(1)
            .single()

          if (existing) {
            results.skipped++
            continue
          }
        }

        const { error } = await supabase
          .from('products')
          .insert({
            seller_id: user.id,
            name: p.name,
            price: p.price,
            cost_price: p.cost_price || null,
            stock: p.stock ?? 0,
            sku: p.sku || null,
            description: p.description || null,
            category_id,
          })

        if (error) {
          results.errors.push(`Row ${i + 1}: ${error.message}`)
        } else {
          results.created++
        }
      } catch (e) {
        results.errors.push(`Row ${i + 1}: ${(e as Error).message}`)
      }
    }

    return NextResponse.json(results)
  },
  { schema: importSchema, rateLimitConfig: { maxRequests: 10, windowMs: 60000 } }
)
