import { queryOptions } from '@tanstack/react-query'
import type {
  CatalogSearch,
  NftDetailResponse,
  NftListResponse,
} from '@/contracts'
import { http } from '@/lib/http'
import { keepLatestCatalog, keepLatestNft } from '@/features/realtime/resources'

export function catalogOptions(search: CatalogSearch) {
  const params = {
    feed: search.feed,
    q: search.q || undefined,
    category: search.category || undefined,
    collection: search.collection || undefined,
    network: search.network,
    minPrice: search.minPrice,
    maxPrice: search.maxPrice,
    sort: search.sort || (search.feed === 'trending' ? 'popular' : 'featured'),
    page: search.page || 1,
    pageSize: 8,
  }
  return queryOptions({
    queryKey: ['nfts', 'list', params] as const,
    queryFn: async ({ signal }) => {
      const response = await http.get<NftListResponse>('/nfts', {
        params,
        signal,
      })
      return keepLatestCatalog(response.data)
    },
  })
}

export function nftOptions(nftId: string) {
  return queryOptions({
    queryKey: ['nfts', 'detail', nftId] as const,
    queryFn: async ({ signal }) => {
      const response = await http.get<NftDetailResponse>(
        `/nfts/${encodeURIComponent(nftId)}`,
        { signal },
      )
      return keepLatestNft(response.data)
    },
  })
}
