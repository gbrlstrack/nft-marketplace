import type {
  ApiError,
  CatalogFeed,
  Nft,
  NftCategory,
  NftListRequest,
  NftNetwork,
  NftSort,
} from '../contracts/index.ts'
import { parseEth } from '../lib/eth.ts'

const categories: NftCategory[] = ['art', 'photography', 'music']
const networks: NftNetwork[] = ['ethereum', 'polygon', 'solana']
const sorts: NftSort[] = [
  'featured',
  'popular',
  'price-asc',
  'price-desc',
  'name',
]
const feeds: CatalogFeed[] = ['new', 'trending']

/** Fixed catalogue clock keeps the demo's release window reproducible. */
export const catalogReferenceDate = '2026-10-30T00:00:00.000Z'
const releaseCutoff =
  Date.parse(catalogReferenceDate) - 30 * 24 * 60 * 60 * 1000

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

export function parseCatalogListRequest(url: URL): NftListRequest | ApiError {
  const params = url.searchParams
  const category = params.get('category') || undefined
  const network = params.get('network') || undefined
  const feed = params.get('feed') || undefined
  const sort =
    params.get('sort') ?? (feed === 'trending' ? 'popular' : 'featured')
  const pageValue = params.get('page') ?? '1'
  const pageSizeValue = params.get('pageSize') ?? '8'
  const page = Number(pageValue)
  const pageSize = Number(pageSizeValue)
  const fields: Record<string, string> = {}
  if (category && !categories.includes(category as NftCategory))
    fields.category = 'Escolha uma categoria disponível.'
  if (network && !networks.includes(network as NftNetwork))
    fields.network = 'Escolha Ethereum, Polygon ou Solana.'
  if (feed && !feeds.includes(feed as CatalogFeed))
    fields.feed = 'Escolha novos lançamentos ou em alta.'
  if (!sorts.includes(sort as NftSort))
    fields.sort = 'Escolha uma ordenação disponível.'
  if (!/^\d+$/.test(pageValue) || !Number.isSafeInteger(page) || page < 1)
    fields.page = 'A página deve ser um inteiro maior que zero.'
  if (
    !/^\d+$/.test(pageSizeValue) ||
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 48
  )
    fields.pageSize =
      'A quantidade por página deve ser um inteiro entre 1 e 48.'
  const minPrice = params.get('minPrice') ?? undefined
  const maxPrice = params.get('maxPrice') ?? undefined
  for (const [key, value] of [
    ['minPrice', minPrice],
    ['maxPrice', maxPrice],
  ] as const) {
    if (value === undefined) continue
    try {
      parseEth(value)
    } catch {
      fields[key] = 'Use um valor ETH decimal não negativo com até 18 casas.'
    }
  }
  if (
    minPrice !== undefined &&
    maxPrice !== undefined &&
    !fields.minPrice &&
    !fields.maxPrice &&
    parseEth(minPrice) > parseEth(maxPrice)
  )
    fields.maxPrice = 'O preço máximo deve ser maior ou igual ao mínimo.'
  if (Object.keys(fields).length)
    return {
      code: 'validation',
      message: 'Confira os filtros enviados.',
      fields,
    }
  return {
    q: params.get('q') ?? '',
    category: category as NftCategory | undefined,
    collection: params.get('collection') ?? '',
    network: network as NftNetwork | undefined,
    feed: feed as CatalogFeed | undefined,
    minPrice,
    maxPrice,
    sort: sort as NftSort,
    page,
    pageSize,
  }
}

/** Cards, sorting and bounds all use the cheapest currently available edition. */
export function availablePrice(nft: Nft): bigint | null {
  return nft.editions.reduce<bigint | null>((minimum, edition) => {
    if (edition.available <= 0) return minimum
    const price = parseEth(edition.priceEth)
    return minimum === null || price < minimum ? price : minimum
  }, null)
}

export function filterCatalog(catalog: Nft[], search: NftListRequest) {
  const query = normalize(search.q ?? '')
  const collection = normalize(search.collection ?? '')
  const minPrice =
    search.minPrice === undefined ? null : parseEth(search.minPrice)
  const maxPrice =
    search.maxPrice === undefined ? null : parseEth(search.maxPrice)
  const matching = catalog.filter((nft) => {
    if (search.feed === 'new') {
      const listedAt = nft.listedAt ? Date.parse(nft.listedAt) : NaN
      if (
        !Number.isFinite(listedAt) ||
        listedAt < releaseCutoff ||
        listedAt > Date.parse(catalogReferenceDate)
      )
        return false
    }
    if (search.feed === 'trending' && (nft.popularityScore ?? 0) < 70)
      return false
    if (
      query &&
      !normalize(`${nft.name} ${nft.collection} ${nft.creator.name}`).includes(
        query,
      )
    )
      return false
    if (collection && normalize(nft.collection) !== collection) return false
    if (minPrice !== null || maxPrice !== null) {
      const price = availablePrice(nft)
      if (
        price === null ||
        (minPrice !== null && price < minPrice) ||
        (maxPrice !== null && price > maxPrice)
      )
        return false
    }
    return true
  })
  const categoryCounts: Record<NftCategory, number> = {
    art: 0,
    photography: 0,
    music: 0,
  }
  const networkCounts: Record<NftNetwork, number> = {
    ethereum: 0,
    polygon: 0,
    solana: 0,
  }
  const items: Nft[] = []
  for (const nft of matching) {
    const network = nft.network ?? 'ethereum'
    const matchesCategory = !search.category || nft.category === search.category
    const matchesNetwork = !search.network || network === search.network
    if (matchesNetwork) categoryCounts[nft.category] += 1
    if (matchesCategory) networkCounts[network] += 1
    if (matchesCategory && matchesNetwork) items.push(nft)
  }
  return { items, categoryCounts, networkCounts }
}
