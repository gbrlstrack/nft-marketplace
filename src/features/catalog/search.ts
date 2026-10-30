import type {
  CatalogSearch,
  CatalogFeed,
  NftCategory,
  NftNetwork,
  NftSort,
} from '../../contracts/index.ts'
import { ethFromWei, parseEth } from '../../lib/eth.ts'

function price(value: unknown) {
  if (typeof value !== 'string' || !value) return undefined
  try {
    return ethFromWei(parseEth(value))
  } catch {
    return undefined
  }
}

export function validateCatalogSearch(
  raw: Record<string, unknown>,
): CatalogSearch {
  const categories: NftCategory[] = ['art', 'photography', 'music']
  const sorts: NftSort[] = [
    'featured',
    'popular',
    'price-asc',
    'price-desc',
    'name',
  ]
  const feeds: CatalogFeed[] = ['new', 'trending']
  const networks: NftNetwork[] = ['ethereum', 'polygon', 'solana']
  const page = Number(raw.page)
  let minPrice = price(raw.minPrice)
  let maxPrice = price(raw.maxPrice)
  if (minPrice && maxPrice && parseEth(minPrice) > parseEth(maxPrice)) {
    minPrice = undefined
    maxPrice = undefined
  }
  return {
    feed: feeds.includes(raw.feed as CatalogFeed)
      ? (raw.feed as CatalogFeed)
      : undefined,
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
    network: networks.includes(raw.network as NftNetwork)
      ? (raw.network as NftNetwork)
      : undefined,
    minPrice,
    maxPrice,
    sort: sorts.includes(raw.sort as NftSort)
      ? (raw.sort as NftSort)
      : undefined,
    page: Number.isSafeInteger(page) && page > 1 ? page : undefined,
  }
}
