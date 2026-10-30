import { useIsMutating, useMutation, useQuery } from '@tanstack/react-query'
import type {
  AddCartItemRequest,
  CartResponse,
  QuoteResponse,
  WalletNetwork,
} from '@/contracts'
import { http } from '@/lib/http'
import { queryClient } from '@/lib/query-client'
import { getSessionState, refreshSession } from '@/features/auth/session'
import { useSession } from '@/features/auth/use-session'
import { keepLatestCart } from '@/features/realtime/resources'

export function isCommerceScope(scope: number, userId: string | undefined) {
  const current = getSessionState()
  return (
    !current.authPending &&
    current.scope === scope &&
    current.user?.id === userId
  )
}

function scopeKey(resource: string) {
  const { user, scope } = getSessionState()
  return ['private', user?.id || 'guest', scope, resource] as const
}

export function cartQueryOptions() {
  const { user, scope } = getSessionState()
  const queryKey = scopeKey('cart')
  return {
    queryKey,
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      if (!isCommerceScope(scope, user?.id))
        throw new Error('A sessão mudou. Tente novamente.')
      const data = (await http.get<CartResponse>('/cart', { signal })).data
      if (data.userId !== (user?.id || null)) {
        void refreshSession().catch(() => undefined)
        throw new Error('A sessão mudou. Tente novamente.')
      }
      if (!isCommerceScope(scope, user?.id))
        throw new Error('A sessão mudou. Tente novamente.')
      const previous = queryClient.getQueryData<CartResponse>(queryKey)
      return keepLatestCart(
        previous?.id === data.id && previous.version > data.version
          ? previous
          : data,
      )
    },
    meta: { private: true },
  }
}

export function useCartQuery() {
  const { authPending } = useSession()
  return useQuery({
    ...cartQueryOptions(),
    enabled: !authPending,
    refetchInterval: (query) =>
      query.state.status === 'error' ? false : 2_000,
  })
}

export function useQuoteQuery(
  cart: CartResponse | undefined,
  network: WalletNetwork,
) {
  const { user, scope, authPending } = useSession()
  return useQuery({
    queryKey: [
      ...scopeKey('quote'),
      cart?.id,
      cart?.version,
      network,
      cart?.items.map((item) => [item.id, item.quantity, item.nft.version]),
    ],
    queryFn: async ({ signal }) => {
      if (!cart || !isCommerceScope(scope, user?.id))
        throw new Error('A sessão mudou. Tente novamente.')
      const result = (
        await http.post<QuoteResponse>(
          '/quotes',
          { cartVersion: cart.version, network },
          { signal },
        )
      ).data
      if (!isCommerceScope(scope, user?.id))
        throw new Error('A sessão mudou. Tente novamente.')
      return result
    },
    enabled: !authPending && Boolean(cart?.items.length),
    retry: false,
    staleTime: 0,
    meta: { private: true },
  })
}

export function refreshCommerce() {
  const { user, scope } = getSessionState()
  void queryClient.invalidateQueries({
    predicate: (query) =>
      query.queryKey[0] === 'private' &&
      query.queryKey[1] === (user?.id || 'guest') &&
      query.queryKey[2] === scope &&
      ['cart', 'quote', 'orders', 'order'].includes(String(query.queryKey[3])),
  })
  void queryClient.invalidateQueries({ queryKey: ['nfts'] })
}

function useCartMutation<T>(operation: (request: T) => Promise<CartResponse>) {
  const { user, scope } = useSession()
  const queryKey = scopeKey('cart')
  return useMutation({
    mutationKey: [...queryKey, 'write'],
    meta: { private: true },
    onMutate: () => queryClient.cancelQueries({ queryKey }),
    mutationFn: async (request: T) => {
      if (!isCommerceScope(scope, user?.id))
        throw new Error('A sessão mudou. Tente novamente.')
      const cart = await operation(request)
      if (cart.userId !== (user?.id || null)) {
        void refreshSession().catch(() => undefined)
        throw new Error('A sessão mudou. Tente novamente.')
      }
      if (!isCommerceScope(scope, user?.id))
        throw new Error('A sessão mudou. Tente novamente.')
      return cart
    },
    onSuccess: (cart) => {
      if (!isCommerceScope(scope, user?.id)) return
      queryClient.setQueryData<CartResponse>(queryKey, (previous) =>
        keepLatestCart(
          previous?.id === cart.id && previous.version > cart.version
            ? previous
            : cart,
        ),
      )
      void queryClient.invalidateQueries({ queryKey: scopeKey('quote') })
    },
    onError: () => {
      if (isCommerceScope(scope, user?.id))
        void queryClient.invalidateQueries({ queryKey })
    },
  })
}

export function useCartActions() {
  useSession()
  const add = useCartMutation(
    async (request: AddCartItemRequest) =>
      (await http.post<CartResponse>('/cart/items', request)).data,
  )
  const update = useCartMutation(
    async ({ itemId, quantity }: { itemId: string; quantity: number }) =>
      (
        await http.patch<CartResponse>(
          `/cart/items/${encodeURIComponent(itemId)}`,
          { quantity },
        )
      ).data,
  )
  const remove = useCartMutation(
    async (itemId: string) =>
      (
        await http.delete<CartResponse>(
          `/cart/items/${encodeURIComponent(itemId)}`,
        )
      ).data,
  )
  const coupon = useCartMutation(
    async (couponCode: string | null) =>
      (await http.put<CartResponse>('/cart/coupon', { couponCode })).data,
  )
  const busy =
    useIsMutating({ mutationKey: [...scopeKey('cart'), 'write'] }) > 0
  return { add, update, remove, coupon, busy }
}
