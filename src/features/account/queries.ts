import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ProfileResponse, WalletListResponse } from '@/contracts'
import { useSession } from '@/features/auth/use-session'
import { isCurrentSession, privateQueryKey } from '@/features/auth/session'
import { http } from '@/lib/http'

export function useProfileQuery() {
  const { user } = useSession()
  const queryClient = useQueryClient()
  const queryKey = privateQueryKey('profile')
  return useQuery({
    queryKey,
    queryFn: async ({ signal }) => {
      const response = (await http.get<ProfileResponse>('/profile', { signal }))
        .data
      const cached = queryClient.getQueryData<ProfileResponse>(queryKey)
      return cached && cached.version > response.version ? cached : response
    },
    enabled: Boolean(user),
    meta: { private: true },
  })
}

export function useWalletsQuery() {
  const { user } = useSession()
  const queryClient = useQueryClient()
  const queryKey = privateQueryKey('wallets')
  return useQuery({
    queryKey,
    queryFn: async ({ signal }) => {
      const response = (
        await http.get<WalletListResponse>('/wallets', { signal })
      ).data
      const cached = queryClient.getQueryData<WalletListResponse>(queryKey)
      return {
        items: response.items.map((wallet) => {
          const previous = cached?.items.find((item) => item.id === wallet.id)
          return previous && previous.version > wallet.version
            ? previous
            : wallet
        }),
      }
    },
    enabled: Boolean(user),
    meta: { private: true },
  })
}

export function requireCurrentAccountSession(scope: number, userId: string) {
  if (!isCurrentSession(scope, userId))
    throw new Error('A sessão foi encerrada.')
}
