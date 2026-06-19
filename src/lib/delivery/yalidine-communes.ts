type CommuneMap = Map<string, number>

let communeCache: CommuneMap | null = null
let cacheExpiry = 0
const CACHE_TTL = 24 * 60 * 60 * 1000

export async function getCommuneCode(
  wilayaName: string,
  communeName: string,
  credentials: { api_id: string; api_token: string },
): Promise<number | null> {
  const cache = await getCommuneCache(credentials)
  const key = `${wilayaName.toLowerCase()}:${communeName.toLowerCase()}`
  const code = cache.get(key)
  return code ?? null
}

async function getCommuneCache(credentials: { api_id: string; api_token: string }): Promise<CommuneMap> {
  if (communeCache && Date.now() < cacheExpiry) {
    return communeCache
  }

  const map = new Map<string, number>()

  try {
    const res = await fetch('https://api.yalidine.app/v1/communes/', {
      headers: {
        'X-API-ID': credentials.api_id,
        'X-API-TOKEN': credentials.api_token,
        'Content-Type': 'application/json',
      },
    })

    if (!res.ok) {
      console.warn(`[YalidineCommunes] API returned ${res.status}, cache will be empty`)
      return map
    }

    const data = await res.json()
    const communes = Array.isArray(data) ? data : (data.data || [])

    for (const c of communes) {
      const wilaya = String(c.wilaya_name || '').toLowerCase()
      const commune = String(c.commune_name || '').toLowerCase()
      const code = Number(c.commune_id)
      if (wilaya && commune && code) {
        map.set(`${wilaya}:${commune}`, code)
      }
    }

    communeCache = map
    cacheExpiry = Date.now() + CACHE_TTL
    // L12 fix: removed debug console.log (ran on every cold start in production)
  } catch (err) {
    console.warn('[YalidineCommunes] Failed to fetch communes:', err)
  }

  return map
}

export function clearCommuneCache(): void {
  communeCache = null
  cacheExpiry = 0
}
