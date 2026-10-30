import { http, HttpResponse } from 'msw/http'
import { delay } from 'msw/utils/delay'

import type {
  ApiError,
  ApiErrorResponse,
  Nft,
  NftDetailResponse,
  NftListResponse,
  NftSort,
} from '../contracts'
import {
  availablePrice,
  filterCatalog,
  parseCatalogListRequest,
} from './catalog-filters.ts'
import { readDatabase } from './account/database'
import { commerce } from './commerce/model'
import { catalogDelayMs, getMockScenario } from './scenarios'

function errorResponse(error: ApiError, status: number) {
  return HttpResponse.json<ApiErrorResponse>({ error }, { status })
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

    const search = parseCatalogListRequest(url)
    if ('code' in search) return errorResponse(search, 422)

    const { items, categoryCounts, networkCounts } = filterCatalog(
      getMockScenario() === 'empty'
        ? []
        : commerce(await readDatabase()).catalog,
      search,
    )
    const sorted = sortNfts(items, search.sort ?? 'featured')
    const page = search.page ?? 1
    const pageSize = search.pageSize ?? 8
    const start = (page - 1) * pageSize

    return HttpResponse.json<NftListResponse>({
      items: sorted.slice(start, start + pageSize),
      total: sorted.length,
      page,
      pageSize,
      categoryCounts,
      networkCounts,
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
