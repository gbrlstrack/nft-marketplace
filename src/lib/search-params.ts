import {
  defaultParseSearch,
  defaultStringifySearch,
} from '@tanstack/react-router'

const priceKeys = ['minPrice', 'maxPrice'] as const

/** Preserve decimal URL tokens before the default JSON parser can round them. */
export function parseMarketplaceSearch(value: string): Record<string, unknown> {
  const parsed: Record<string, unknown> = { ...defaultParseSearch(value) }
  const params = new URLSearchParams(value)
  for (const key of priceKeys) {
    const raw = params.get(key)
    if (raw === null) continue
    parsed[key] = raw
    if (raw.startsWith('"')) {
      try {
        const decoded: unknown = JSON.parse(raw)
        if (typeof decoded === 'string') parsed[key] = decoded
      } catch {
        // Route validation discards an invalid decimal token.
      }
    }
  }
  return parsed
}

export function stringifyMarketplaceSearch(value: object) {
  const record: Record<string, unknown> = { ...value }
  const params = new URLSearchParams(defaultStringifySearch(record))
  for (const key of priceKeys) {
    if (typeof record[key] === 'string') params.set(key, record[key])
  }
  const encoded = params.toString()
  return encoded ? `?${encoded}` : ''
}
