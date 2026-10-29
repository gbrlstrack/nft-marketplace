import {
  useIsMutating,
  useMutation,
  useMutationState,
  useQuery,
} from '@tanstack/react-query'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { Heart } from 'lucide-react'
import type { FavoritesResponse } from '@/contracts'
import { http } from '@/lib/http'
import { queryClient } from '@/lib/query-client'
import { getErrorMessage } from '@/lib/api-error'
import { isCurrentSession } from '@/features/auth/session'
import { useSession } from '@/features/auth/use-session'
import { safeReturnTo } from '@/features/auth/return-to'
import { cn } from '@/lib/utils'
import { favoritesOptions } from './queries'

export function FavoriteButton({
  nftId,
  className,
}: {
  nftId: string
  className?: string
}) {
  const { user, scope } = useSession()
  const navigate = useNavigate()
  const href = useLocation({ select: (location) => location.href })
  const options = favoritesOptions()
  const favorites = useQuery({ ...options, enabled: Boolean(user) })
  const mutationKey = ['favorites', user?.id, scope]
  const pending = useIsMutating({ mutationKey }) > 0
  const selected = Boolean(user && favorites.data?.nftIds.includes(nftId))
  const mutation = useMutation({
    mutationKey,
    meta: { private: true },
    mutationFn: async (remove: boolean) => {
      if (!user || !isCurrentSession(scope, user.id))
        throw new Error('A sessão foi encerrada.')
      return (
        await (remove
          ? http.delete<FavoritesResponse>(
              `/favorites/${encodeURIComponent(nftId)}`,
            )
          : http.put<FavoritesResponse>(
              `/favorites/${encodeURIComponent(nftId)}`,
            ))
      ).data
    },
    onMutate: async (remove) => {
      await queryClient.cancelQueries({ queryKey: options.queryKey })
      if (!user || !isCurrentSession(scope, user.id)) return undefined
      const previous = queryClient.getQueryData<FavoritesResponse>(
        options.queryKey,
      )
      queryClient.setQueryData<FavoritesResponse>(options.queryKey, {
        nftIds: remove
          ? (previous?.nftIds || []).filter((id) => id !== nftId)
          : [...new Set([...(previous?.nftIds || []), nftId])],
        version: previous?.version || 0,
      })
      return previous
    },
    onSuccess: (data) => {
      if (user && isCurrentSession(scope, user.id))
        queryClient.setQueryData(options.queryKey, data)
    },
    onError: (_error, _remove, previous) => {
      if (user && isCurrentSession(scope, user.id))
        queryClient.setQueryData(options.queryKey, previous)
    },
    onSettled: () => {
      if (user && isCurrentSession(scope, user.id))
        void queryClient.invalidateQueries({ queryKey: options.queryKey })
    },
  })

  return (
    <button
      type="button"
      aria-label={
        selected ? 'Remover dos favoritos' : 'Adicionar aos favoritos'
      }
      aria-pressed={selected}
      disabled={
        pending || Boolean(user && (favorites.isPending || favorites.isError))
      }
      onClick={() => {
        if (!user)
          void navigate({
            to: '/login',
            search: { returnTo: safeReturnTo(href) },
          })
        else mutation.mutate(selected)
      }}
      className={cn(
        'flex size-11 items-center justify-center rounded-full border border-primary/40 bg-card text-primary focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60',
        className,
      )}
    >
      <Heart
        className={cn('size-5', selected && 'fill-current')}
        aria-hidden="true"
      />
    </button>
  )
}

export function FavoriteNotice() {
  const { user, scope } = useSession()
  const mutations = useMutationState({
    filters: { mutationKey: ['favorites', user?.id, scope] },
    select: (mutation) => mutation.state,
  })
  const last = mutations.at(-1)
  if (!user || last?.status !== 'error') return null
  return (
    <p
      role="alert"
      className="mb-6 rounded-lg border border-primary/50 p-4 text-sm"
    >
      {getErrorMessage(
        last.error,
        'Não foi possível atualizar seus favoritos. Tente novamente.',
      )}
    </p>
  )
}
