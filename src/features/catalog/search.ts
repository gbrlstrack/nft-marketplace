import type { CatalogSearch, NftCategory, NftSort } from '@/contracts'

export function validateCatalogSearch(
  raw: Record<string, unknown>,
): CatalogSearch {
  const categories: NftCategory[] = ['art', 'photography', 'music']
  const sorts: NftSort[] = ['featured', 'price-asc', 'price-desc', 'name']
  const page = Number(raw.page)
  return {
    q:
      typeof raw.q === 'string'
        ? raw.q.trim().slice(0, 200) || undefined
        : undefined,
    category: categories.includes(raw.category as NftCategory)
      ? (raw.category as NftCategory)
      : undefined,
    collection:
      typeof raw.collection === 'string'
        ? raw.collection.trim().slice(0, 100) || undefined
        : undefined,
    sort: sorts.includes(raw.sort as NftSort)
      ? (raw.sort as NftSort)
      : undefined,
    page: Number.isSafeInteger(page) && page > 1 ? page : undefined,
  }
}
