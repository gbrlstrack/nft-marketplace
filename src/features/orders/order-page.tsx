import { useEffect, useRef } from 'react'
import { Link, useParams } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import type { Order } from '@/contracts'
import { useSession } from '@/features/auth/use-session'
import { isCurrentSession, privateQueryKey } from '@/features/auth/session'
import {
  clearAttempt,
  clearDraft,
  readAttempt,
} from '@/features/checkout/storage'
import { refreshCommerce } from '@/features/cart/queries'
import { QuoteSummary } from '@/features/cart/quote-summary'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { http } from '@/lib/http'
import { formatEth } from '@/lib/eth'
import { getErrorMessage } from '@/lib/api-error'

export function OrderPage() {
  const { orderId } = useParams({ from: '/orders/$orderId' })
  const { user, scope, authPending } = useSession()
  const queryClient = useQueryClient()
  const queryKey = [...privateQueryKey('orders'), orderId]
  const processed = useRef<string | null>(null)
  const query = useQuery({
    queryKey,
    queryFn: async ({ signal }) => {
      if (!user || !isCurrentSession(scope, user.id))
        throw new Error('A sessão foi encerrada.')
      const order = (
        await http.get<Order>(`/orders/${encodeURIComponent(orderId)}`, {
          signal,
        })
      ).data
      if (!isCurrentSession(scope, user.id))
        throw new Error('A sessão foi encerrada.')
      if (
        order.userId !== user.id ||
        order.id !== orderId ||
        !Number.isSafeInteger(order.version) ||
        order.version < 1
      )
        throw new Error('O pedido retornado não corresponde à sua conta.')
      const cached = queryClient.getQueryData<Order>(queryKey)
      if (
        cached &&
        (cached.version >= order.version ||
          (cached.status !== 'pending' && cached.status !== order.status))
      )
        return cached
      return order
    },
    enabled: Boolean(user) && !authPending,
    refetchInterval: (current) =>
      current.state.data?.status === 'pending' ? 500 : false,
    refetchOnReconnect: true,
    meta: { private: true },
  })
  useEffect(() => {
    const order = query.data
    if (
      !user ||
      !order ||
      order.status === 'pending' ||
      !isCurrentSession(scope, user.id) ||
      processed.current === `${scope}:${order.id}`
    )
      return
    processed.current = `${scope}:${order.id}`
    const attempt = readAttempt(user.id)
    if (attempt?.key === order.idempotencyKey) {
      clearAttempt(user.id, attempt.key)
      void http
        .delete(
          `/wallet-connections/${encodeURIComponent(attempt.body.walletConnectionId)}`,
        )
        .catch(() => undefined)
    }
    if (order.status === 'confirmed') clearDraft(user.id)
    void refreshCommerce()
  }, [query.data, scope, user])
  if (!user || authPending) return null
  if (query.isPending)
    return (
      <div role="status" aria-label="Carregando pedido">
        <Skeleton className="mx-auto h-96 max-w-2xl" />
        <span className="sr-only">Carregando pedido</span>
      </div>
    )
  if (!query.data)
    return (
      <section className="mx-auto max-w-xl">
        <h1 className="text-2xl font-bold">
          {isAxiosError(query.error) && query.error.response?.status === 404
            ? 'Pedido não encontrado'
            : 'Não foi possível recuperar o pedido'}
        </h1>
        <p role="alert" className="mt-5">
          {getErrorMessage(
            query.error,
            'Confira a conexão e tente novamente. Uma falha de consulta não cria outro pedido.',
          )}
        </p>
        <Button className="mt-6" onClick={() => void query.refetch()}>
          Tentar novamente
        </Button>
        <Button asChild variant="outline" className="mt-6 ml-3">
          <Link to="/cart">Voltar ao carrinho</Link>
        </Button>
      </section>
    )
  const order = query.data
  return (
    <section className="mx-auto max-w-2xl rounded-xl border border-border bg-card p-5 sm:p-9">
      <h1 className="text-center text-2xl font-bold" aria-live="polite">
        {order.status === 'confirmed'
          ? 'Compra confirmada'
          : order.status === 'declined'
            ? 'Pagamento recusado'
            : 'Pedido pendente'}
      </h1>
      <p className="mt-4 break-all text-center text-xs text-muted-foreground">
        Pedido <span data-testid="order-id">{order.id}</span>
      </p>
      {query.isError && (
        <p role="alert" className="mt-5 text-sm">
          A conexão foi interrompida. Os últimos dados continuam visíveis.{' '}
          <button className="underline" onClick={() => void query.refetch()}>
            Tentar novamente
          </button>
        </p>
      )}
      {order.status === 'pending' && (
        <p role="status" className="mt-6 text-sm">
          Aguardando o resultado da simulação. Você pode atualizar a página sem
          criar outra compra.
        </p>
      )}
      {order.status === 'declined' && (
        <p role="alert" className="mt-6 text-sm">
          {order.message} Os itens foram preservados no carrinho.
        </p>
      )}
      <h2 className="mt-8 text-lg font-bold">Detalhes do pedido</h2>
      <ul className="mt-5 space-y-5">
        {order.snapshot.items.map((item) => (
          <li
            key={item.cartItemId}
            className="grid min-w-0 grid-cols-[4rem_minmax(0,1fr)] items-center gap-x-4 gap-y-3 sm:grid-cols-[4rem_minmax(0,1fr)_auto]"
          >
            <img
              src={item.image.src}
              alt={item.image.alt}
              width={64}
              height={64}
              className="size-16 rounded-md"
            />
            <div className="min-w-0">
              <p className="text-sm font-bold">{item.name}</p>
              <p className="text-xs text-muted-foreground">
                {item.editionLabel} × {item.quantity}
              </p>
            </div>
            <p className="col-span-2 break-all text-sm font-bold text-primary sm:col-span-1 sm:text-right">
              {formatEth(item.lineTotalEth)} ETH
            </p>
          </li>
        ))}
      </ul>
      <div className="mt-8">
        <QuoteSummary quote={order.snapshot} totalTestId="order-total" />
      </div>
      <dl className="mt-7 grid gap-4 border-t border-border pt-5 text-xs sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Colecionador</dt>
          <dd>{order.snapshot.collector.name}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Carteira</dt>
          <dd className="break-all">
            {order.snapshot.wallet.label} · {order.snapshot.wallet.address}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Criado em</dt>
          <dd>
            {new Intl.DateTimeFormat('pt-BR', {
              dateStyle: 'short',
              timeStyle: 'short',
              timeZone: 'America/Sao_Paulo',
            }).format(new Date(order.snapshot.createdAt))}
          </dd>
        </div>
      </dl>
      {order.status === 'confirmed' && (
        <div
          id="transacao-simulada"
          className="mt-7 border-t border-border pt-5"
        >
          <h2 className="text-base font-bold">Transação simulada</h2>
          <p className="mt-3 break-all text-sm">{order.transactionReference}</p>
          <p className="mt-3 text-xs text-muted-foreground">
            Compra confirmada na simulação. Nenhuma transferência real foi
            enviada à blockchain.
          </p>
          <Button asChild variant="outline" className="mt-5">
            <a href={order.simulatedExplorerUrl}>Ver transação simulada</a>
          </Button>
        </div>
      )}
      <div className="mt-8 flex flex-wrap gap-3">
        <Button asChild>
          <Link to="/">Continuar explorando</Link>
        </Button>
        {order.status === 'declined' && (
          <Button asChild variant="outline">
            <Link to="/cart">Voltar ao carrinho</Link>
          </Button>
        )}
      </div>
    </section>
  )
}
