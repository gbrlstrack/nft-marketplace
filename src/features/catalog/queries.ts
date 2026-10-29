import { queryOptions } from '@tanstack/react-query'
import type {
  CatalogSearch,
  NftDetailResponse,
  NftListResponse,
} from '@/contracts'
import { http } from '@/lib/http'

export function catalogOptions(search: CatalogSearch) {
  const params = {
    q: search.q || undefined,
    category: search.category || undefined,
    collection: search.collection || undefined,
    sort: search.sort || 'featured',
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
      return response.data
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
      return response.data
    },
  })
}
