import { http, HttpResponse } from 'msw/http'
import { delay } from 'msw/utils/delay'

import type {
  ApiError,
  ApiErrorResponse,
  Nft,
  NftCategory,
  NftDetailResponse,
  NftListRequest,
  NftListResponse,
  NftSort,
} from '../contracts'
import { parseEth } from '../lib/eth'
import { readDatabase } from './account/database'
import { commerce } from './commerce/model'
import { catalogDelayMs, getMockScenario } from './scenarios'

const validCategories: NftCategory[] = ['art', 'photography', 'music']
const validSorts: NftSort[] = ['featured', 'price-asc', 'price-desc', 'name']

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

function errorResponse(error: ApiError, status: number) {
  return HttpResponse.json<ApiErrorResponse>({ error }, { status })
}

function parseListRequest(url: URL): NftListRequest | ApiError {
  const params = url.searchParams
  const category = params.get('category')
  const sort = params.get('sort') ?? 'featured'
  const pageValue = params.get('page') ?? '1'
  const pageSizeValue = params.get('pageSize') ?? '8'
  const page = Number(pageValue)
  const pageSize = Number(pageSizeValue)
  const fields: Record<string, string> = {}

  if (category && !validCategories.includes(category as NftCategory)) {
    fields.category = 'Escolha uma categoria disponível.'
  }
  if (!validSorts.includes(sort as NftSort)) {
    fields.sort = 'Escolha uma ordenação disponível.'
  }
  if (!/^\d+$/.test(pageValue) || !Number.isSafeInteger(page) || page < 1) {
    fields.page = 'A página deve ser um inteiro maior que zero.'
  }
  if (
    !/^\d+$/.test(pageSizeValue) ||
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 48
  ) {
    fields.pageSize =
      'A quantidade por página deve ser um inteiro entre 1 e 48.'
  }
  if (Object.keys(fields).length > 0) {
    return {
      code: 'validation',
      message: 'Confira os filtros enviados.',
      fields,
    }
  }

  return {
    q: params.get('q') ?? '',
    category: (category || undefined) as NftCategory | undefined,
    collection: params.get('collection') ?? '',
    sort: sort as NftSort,
    page,
    pageSize,
  }
}

/** Price sorts compare the cheapest available edition in wei, never Number. */
function availablePrice(nft: Nft): bigint | null {
  const prices = nft.editions
    .filter((edition) => edition.available > 0)
    .map((edition) => parseEth(edition.priceEth))

  return prices.reduce<bigint | null>(
    (minimum, price) => (minimum === null || price < minimum ? price : minimum),
    null,
  )
}

function sortNfts(items: Nft[], sort: NftSort): Nft[] {
  return items.sort((left, right) => {
    if (sort === 'name') {
      return (
        left.name.localeCompare(right.name, 'en') ||
        left.id.localeCompare(right.id)
      )
    }
    if (sort === 'price-asc' || sort === 'price-desc') {
      const leftPrice = availablePrice(left)
      const rightPrice = availablePrice(right)

      // Sold-out NFTs stay last in either price direction.
      if (leftPrice === null && rightPrice !== null) return 1
      if (rightPrice === null && leftPrice !== null) return -1
      if (
        leftPrice !== null &&
        rightPrice !== null &&
        leftPrice !== rightPrice
      ) {
        const ascending = leftPrice < rightPrice ? -1 : 1
        return sort === 'price-asc' ? ascending : -ascending
      }
    }

    return left.id.localeCompare(right.id)
  })
}

async function simulateNetwork(url: URL): Promise<Response | null> {
  const scenario = getMockScenario()
  await delay(catalogDelayMs(scenario, url))

  if (scenario === 'offline') return HttpResponse.error()
  if (scenario === 'catalog-error') {
    return errorResponse(
      {
        code: 'transient',
        message:
          'O catálogo está temporariamente indisponível. Tente novamente.',
        retryAfterMs: 1_000,
      },
      503,
    )
  }

  return null
}

/** Only catalogue is implemented here; unexpected API calls must remain errors. */
export const handlers = [
  http.get('/api/nfts', async ({ request }) => {
    const url = new URL(request.url)
    const networkFailure = await simulateNetwork(url)
    if (networkFailure) return networkFailure

    const search = parseListRequest(url)
    if ('code' in search) return errorResponse(search, 422)

    const query = normalize(search.q ?? '')
    const collection = normalize(search.collection ?? '')
    const items =
      getMockScenario() === 'empty'
        ? []
        : commerce(await readDatabase()).catalog.filter((nft) => {
            const searchable = normalize(
              `${nft.name} ${nft.collection} ${nft.creator.name}`,
            )
            return (
              (!query || searchable.includes(query)) &&
              (!search.category || nft.category === search.category) &&
              (!collection || normalize(nft.collection) === collection)
            )
          })

    const sorted = sortNfts(items, search.sort ?? 'featured')
    const page = search.page ?? 1
    const pageSize = search.pageSize ?? 8
    const start = (page - 1) * pageSize

    return HttpResponse.json<NftListResponse>({
      items: sorted.slice(start, start + pageSize),
      total: sorted.length,
      page,
      pageSize,
    })
  }),
  http.get('/api/nfts/:id', async ({ request, params }) => {
    const networkFailure = await simulateNetwork(new URL(request.url))
    if (networkFailure) return networkFailure

    const nft = commerce(await readDatabase()).catalog.find(
      (item) => item.id === params.id,
    )
    if (!nft) {
      return errorResponse(
        { code: 'not-found', resource: 'nft', message: 'NFT não encontrado.' },
        404,
      )
    }

    return HttpResponse.json<NftDetailResponse>(nft)
  }),
]
