export interface ParsedProduct {
  name: string
  price: number
  cost_price?: number
  stock?: number
  sku?: string
  description?: string
  category?: string
}

const CSV_HEADERS: Record<string, keyof ParsedProduct> = {
  name: 'name',
  product: 'name',
  'product name': 'name',
  'nom': 'name',
  'المنتج': 'name',
  price: 'price',
  'sell price': 'price',
  'prix': 'price',
  'السعر': 'price',
  cost: 'cost_price',
  'cost price': 'cost_price',
  'prix de revient': 'cost_price',
  stock: 'stock',
  quantity: 'stock',
  qty: 'stock',
  'quantité': 'stock',
  'المخزون': 'stock',
  sku: 'sku',
  reference: 'sku',
  ref: 'sku',
  description: 'description',
  category: 'category',
  categorie: 'category',
  'catégorie': 'category',
  'الفئة': 'category',
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  result.push(current.trim())
  return result
}

export function parseCSV(text: string): ParsedProduct[] {
  // Split on newlines that are NOT inside quoted fields.
  // A simple \r?\n split breaks when a quoted CSV value contains a newline.
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n(?=(?:[^"]*"[^"]*")*[^"]*$)/).filter(l => l.trim())
  if (lines.length < 2) return []

  const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase())
  const mapping: (keyof ParsedProduct | null)[] = headers.map(h => CSV_HEADERS[h] || null)

  const products: ParsedProduct[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i])
    const product: Record<string, unknown> = {}

    for (let j = 0; j < mapping.length; j++) {
      const key = mapping[j]
      if (!key || !values[j]) continue

      if (key === 'price' || key === 'cost_price' || key === 'stock') {
        product[key] = Number(values[j].replace(/[^\d.-]/g, '')) || 0
      } else {
        product[key] = values[j]
      }
    }

    if (product.name && (product.price !== undefined && Number(product.price) > 0)) {
      products.push(product as unknown as ParsedProduct)
    }
  }

  return products
}

export function parseExcelArray(rows: string[][]): ParsedProduct[] {
  if (rows.length < 2) return []

  const headers = rows[0].map(h => h.toLowerCase().trim())
  const mapping: (keyof ParsedProduct | null)[] = headers.map(h => CSV_HEADERS[h] || null)

  const products: ParsedProduct[] = []

  for (let i = 1; i < rows.length; i++) {
    const values = rows[i]
    const product: Record<string, unknown> = {}

    for (let j = 0; j < mapping.length; j++) {
      const key = mapping[j]
      if (!key || !values[j]) continue

      if (key === 'price' || key === 'cost_price' || key === 'stock') {
        product[key] = Number(String(values[j]).replace(/[^\d.-]/g, '')) || 0
      } else {
        product[key] = String(values[j])
      }
    }

    if (product.name && (product.price !== undefined && Number(product.price) > 0)) {
      products.push(product as unknown as ParsedProduct)
    }
  }

  return products
}
