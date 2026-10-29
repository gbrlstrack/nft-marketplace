import type { FavoritesResponse } from '@/contracts'
import { http } from '@/lib/http'
import { privateQueryKey } from '@/features/auth/session'

export function favoritesOptions() {
  return {
    queryKey: privateQueryKey('favorites'),
    queryFn: async ({ signal }: { signal: AbortSignal }) =>
      (await http.get<FavoritesResponse>('/favorites', { signal })).data,
  }
}
