import { useEffect } from 'react'
import { io, type Socket } from 'socket.io-client'
import type { Cart, Order, ServerToClientEvents } from '@/contracts'
import { useSession } from '@/features/auth/use-session'
import { getSessionState, refreshSession } from '@/features/auth/session'
import { queryClient } from '@/lib/query-client'
import { getRealtimeState, publishRealtime } from './state'
import { keepLatestCart, resources, validMarketplaceEvent } from './resources'

export function RealtimeLifecycle() {
  const { scope, user, initialized, authPending } = useSession()
  const userId = user?.id || null
  useEffect(() => {
    resources.clearPrivate()
    publishRealtime({ status: 'connecting', notice: '', nftRevisions: {} })
    if (!initialized || authPending) return
    let disposed = false
    let reconciliation = 0
    const active = () => {
      const current = getSessionState()
      return (
        !disposed &&
        !current.authPending &&
        current.scope === scope &&
        (current.user?.id || null) === userId
      )
    }
    const currentQuery = (key: readonly unknown[]) =>
      key[0] === 'nfts' ||
      (key[0] === 'private' &&
        key[2] === scope &&
        (key[1] === userId || (!userId && key[1] === 'guest')))
    const socket: Socket<ServerToClientEvents> = io(window.location.origin, {
      path: '/socket.io',
      transports: ['websocket'],
      forceNew: true,
      autoConnect: false,
      auth: { userId, scope },
      reconnectionDelay: 300,
      reconnectionDelayMax: 1_000,
      randomizationFactor: 0,
    })

    const reconcile = async () => {
      const revision = ++reconciliation
      try {
        await refreshSession()
        if (!active() || revision !== reconciliation) return
        await queryClient.cancelQueries({
          predicate: (query) => currentQuery(query.queryKey),
        })
        if (!active() || revision !== reconciliation) return
        await queryClient.invalidateQueries({
          predicate: (query) => currentQuery(query.queryKey),
          refetchType: 'active',
        })
      } catch {
        // Existing query errors preserve their data and expose recovery controls.
      }
    }
    const connect = () => {
      if (!active()) return
      publishRealtime({ status: 'connected' })
      void reconcile()
    }
    const offline = () => {
      reconciliation += 1
      if (active()) publishRealtime({ status: 'offline' })
    }
    const nftUpdated = async (raw: unknown) => {
      if (!active()) return
      const event = resources.accept(raw, userId, 'nft.updated')
      if (!event || event.type !== 'nft.updated') return
      const before = getRealtimeState()
      publishRealtime({
        revision: before.revision + 1,
        nftRevisions: {
          ...before.nftRevisions,
          [event.resourceId]: event.version,
        },
        notice:
          'Preço ou disponibilidade atualizado. Confira os valores antes de comprar.',
      })
      await queryClient.cancelQueries({
        predicate: (query) =>
          currentQuery(query.queryKey) &&
          (query.queryKey[0] === 'nfts' ||
            ['cart', 'quote'].includes(String(query.queryKey[3]))),
      })
      if (!active()) return
      queryClient.setQueryData(
        ['nfts', 'detail', event.resourceId],
        resources.keepNft(event.data),
      )
      queryClient.setQueriesData<Cart>(
        {
          predicate: (query) =>
            currentQuery(query.queryKey) && query.queryKey[3] === 'cart',
        },
        (cart) => (cart ? keepLatestCart(cart) : cart),
      )
      void queryClient.invalidateQueries({
        predicate: (query) =>
          currentQuery(query.queryKey) &&
          (query.queryKey[0] === 'nfts' ||
            ['cart', 'quote'].includes(String(query.queryKey[3]))),
        refetchType: 'active',
      })
    }
    const orderUpdated = async (raw: unknown) => {
      if (
        !active() ||
        !validMarketplaceEvent(raw) ||
        raw.type !== 'order.updated'
      )
        return
      const key = ['private', userId, scope, 'orders', raw.resourceId]
      const known = queryClient.getQueryData<Order>(key)
      if (known && known.userId === userId && known.id === raw.resourceId)
        resources.keepOrder(known)
      const event = resources.accept(raw, userId, 'order.updated')
      if (!event || event.type !== 'order.updated') return
      await queryClient.cancelQueries({ queryKey: key })
      if (!active()) return
      queryClient.setQueryData<Order>(key, resources.keepOrder(event.data))
      void queryClient.invalidateQueries({
        predicate: (query) =>
          currentQuery(query.queryKey) &&
          ['cart', 'quote', 'orders', 'order'].includes(
            String(query.queryKey[3]),
          ),
        refetchType: 'active',
      })
    }
    socket.on('connect', connect)
    socket.on('disconnect', offline)
    socket.on('connect_error', offline)
    socket.on('nft.updated', nftUpdated)
    socket.on('order.updated', orderUpdated)
    socket.connect()
    return () => {
      disposed = true
      reconciliation += 1
      socket.off('connect', connect)
      socket.off('disconnect', offline)
      socket.off('connect_error', offline)
      socket.off('nft.updated', nftUpdated)
      socket.off('order.updated', orderUpdated)
      socket.disconnect()
      socket.io.removeAllListeners()
      resources.clearPrivate()
    }
  }, [scope, userId, initialized, authPending])
  return null
}
