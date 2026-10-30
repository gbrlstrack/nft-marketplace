import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useRouter } from '@tanstack/react-router'
import { isAxiosError } from 'axios'
import type {
  Cart,
  CheckoutCollector,
  Profile,
  Quote,
  Wallet,
  WalletConnection,
  WalletNetwork,
  Order,
} from '@/contracts'
import { useProfileQuery, useWalletsQuery } from '@/features/account/queries'
import {
  FormFeedback,
  InputField,
  SelectField,
  TextareaField,
} from '@/features/account/form-fields'
import {
  useCartQuery,
  useQuoteQuery,
  refreshCommerce,
} from '@/features/cart/queries'
import { QuoteSummary } from '@/features/cart/quote-summary'
import { useSession } from '@/features/auth/use-session'
import { isCurrentSession } from '@/features/auth/session'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { getApiError, getErrorMessage, getFieldErrors } from '@/lib/api-error'
import { http } from '@/lib/http'
import { formatEth } from '@/lib/eth'
import {
  clearAttempt,
  readAttempt,
  readDraft,
  writeAttempt,
  writeDraft,
  type PurchaseAttempt,
} from './storage'
import { nftRevisionKey, quoteFingerprint, validateCollector } from './review'
import { getRealtimeState, useRealtime } from '@/features/realtime/state'
import { keepLatestCart } from '@/features/realtime/resources'

export function CheckoutPage() {
  const session = useSession()
  const cart = useCartQuery()
  const profile = useProfileQuery()
  const wallets = useWalletsQuery()
  if (!session.user || session.authPending) return null
  if (cart.isPending || profile.isPending || wallets.isPending)
    return (
      <div
        role="status"
        aria-label="Carregando pagamento"
        className="grid gap-8 md:grid-cols-2"
      >
        <Skeleton className="h-96" />
        <Skeleton className="h-72" />
        <span className="sr-only">Carregando pagamento</span>
      </div>
    )
  if (!cart.data || !profile.data || !wallets.data)
    return (
      <section>
        <h1 className="text-3xl font-bold">Pagamento com carteira</h1>
        <p role="alert" className="mt-6">
          Não foi possível carregar os dados do pagamento.
        </p>
        <Button
          className="mt-5"
          onClick={() => {
            void cart.refetch()
            void profile.refetch()
            void wallets.refetch()
          }}
        >
          Tentar novamente
        </Button>
      </section>
    )
  return (
    <CheckoutEditor
      key={`${session.scope}:${session.user.id}`}
      userId={session.user.id}
      scope={session.scope}
      cart={cart.data}
      profile={profile.data}
      wallets={wallets.data.items}
    />
  )
}

function initialValues(profile: Profile, wallet?: Wallet): CheckoutCollector {
  return {
    name: profile.name,
    email: profile.email,
    username: profile.username,
    profileName: wallet?.profileName || profile.username,
    ensName: wallet?.ensName || profile.ensName,
    referralCode: wallet?.referralCode || '',
    secondaryAddress: wallet?.secondaryAddress || '',
    notes: '',
  }
}

function CheckoutEditor({
  userId,
  scope,
  cart,
  profile,
  wallets,
}: {
  userId: string
  scope: number
  cart: Cart
  profile: Profile
  wallets: Wallet[]
}) {
  const router = useRouter()
  const [initialDraft] = useState(() => readDraft(userId))
  const [walletId, setWalletId] = useState(
    initialDraft?.walletId &&
      wallets.some((wallet) => wallet.id === initialDraft.walletId)
      ? initialDraft.walletId
      : wallets.find((wallet) => wallet.role === 'primary')?.id ||
          wallets[0]?.id ||
          '',
  )
  const wallet = wallets.find((item) => item.id === walletId)
  const [network, setNetwork] = useState<WalletNetwork>(
    initialDraft?.network || wallet?.network || 'ethereum',
  )
  const [collector, setCollector] = useState<CheckoutCollector>(
    initialDraft?.collector || initialValues(profile, wallet),
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const { nftRevisions } = useRealtime()
  const [initialNftRevisions] = useState(() => nftRevisions)
  const [initialNftVersions] = useState(() =>
    Object.fromEntries(
      cart.items.map((item) => [item.nftId, item.nft.version]),
    ),
  )
  const nftIds = cart.items.map((item) => item.nftId)
  const currentNftKey = nftRevisionKey(nftIds, nftRevisions)
  const [reviewNftKey, setReviewNftKey] = useState('')
  const [reviewSnapshot, setReview] = useState<Quote | null>(null)
  const review =
    reviewNftKey === currentNftKey &&
    reviewSnapshot?.cartId === cart.id &&
    reviewSnapshot.cartVersion === cart.version &&
    reviewSnapshot.couponCode === cart.couponCode &&
    reviewSnapshot.items.length === cart.items.length &&
    reviewSnapshot.items.every((reviewed) =>
      cart.items.some(
        (item) =>
          item.id === reviewed.cartItemId &&
          item.nft.version === reviewed.nftVersion &&
          item.quantity === reviewed.quantity,
      ),
    )
      ? reviewSnapshot
      : null
  const nftChanged = nftIds.some(
    (id) =>
      (nftRevisions[id] || 0) > (initialNftRevisions[id] || 0) ||
      cart.items.some(
        (item) =>
          item.nftId === id &&
          initialNftVersions[id] !== undefined &&
          item.nft.version > initialNftVersions[id],
      ),
  )
  const [connection, setConnection] = useState<WalletConnection | null>(null)
  const connectionRef = useRef<WalletConnection | null>(null)
  const [attempt, setAttempt] = useState(() => readAttempt(userId))
  const attemptRef = useRef(attempt)
  const [mode, setMode] = useState<
    'idle' | 'connecting' | 'reviewing' | 'sending' | 'recovering' | 'unknown'
  >(attempt ? 'recovering' : 'idle')
  const operation = useRef(false)
  const mounted = useRef(true)
  const initialAttempt = useRef(attempt)
  const quote = useQuoteQuery(cart.items.length ? cart : undefined, network)
  const active = () => mounted.current && isCurrentSession(scope, userId)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      const current = connectionRef.current
      if (current && !attemptRef.current && isCurrentSession(scope, userId))
        void http
          .delete(`/wallet-connections/${encodeURIComponent(current.id)}`)
          .catch(() => undefined)
    }
  }, [scope, userId])

  function persistDraft(
    nextCollector: CheckoutCollector,
    nextWalletId = walletId,
    nextNetwork = network,
  ) {
    if (!active()) return
    if (
      !writeDraft(userId, {
        collector: nextCollector,
        walletId: nextWalletId,
        network: nextNetwork,
      })
    )
      setNotice(
        'Não foi possível guardar o rascunho neste navegador. Evite atualizar a página antes de concluir.',
      )
  }

  async function navigateToOrder(order: Order, record: PurchaseAttempt) {
    if (!active()) return
    if (
      record.userId !== userId ||
      order.userId !== userId ||
      order.idempotencyKey !== record.key ||
      attemptRef.current?.key !== record.key
    )
      throw new Error(
        'O pedido retornado não corresponde à sua conta e à tentativa atual.',
      )
    void router.navigate({
      to: '/orders/$orderId',
      params: { orderId: order.id },
    })
  }

  async function recover(record: PurchaseAttempt) {
    if (!active()) return
    setMode('recovering')
    try {
      const response = await http.get<Order>(
        `/orders/by-idempotency-key/${encodeURIComponent(record.key)}`,
      )
      if (!active()) return
      await navigateToOrder(response.data, record)
    } catch (failure) {
      if (!active()) return
      setMode('unknown')
      setError(
        isAxiosError(failure) && failure.response?.status === 404
          ? 'A tentativa ainda não foi localizada. Retome usando a mesma chave para evitar duplicidade.'
          : getErrorMessage(
              failure,
              'Não foi possível recuperar o pedido. Tente retomar a mesma tentativa.',
            ),
      )
    }
  }

  useEffect(() => {
    if (initialAttempt.current) void recover(initialAttempt.current)
    // Recovery runs only for an attempt restored on mount, never alongside a new POST.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!connection) return
    const remaining = Date.parse(connection.expiresAt) - Date.now()
    const timer = setTimeout(
      () => {
        if (!isCurrentSession(scope, userId)) return
        connectionRef.current = null
        setConnection(null)
        setReview(null)
        setError(
          'A conexão da carteira expirou. Conecte novamente para revisar a compra.',
        )
      },
      Math.max(0, remaining),
    )
    return () => clearTimeout(timer)
  }, [connection, scope, userId])

  async function disconnect() {
    const current = connectionRef.current
    connectionRef.current = null
    setConnection(null)
    setReview(null)
    setNotice('')
    if (current && active())
      await http.delete(`/wallet-connections/${encodeURIComponent(current.id)}`)
  }

  function changeCollector(field: keyof CheckoutCollector, value: string) {
    const next = { ...collector, [field]: value }
    setCollector(next)
    persistDraft(next)
    setReview(null)
    setError('')
  }

  async function connectWallet() {
    if (operation.current || !wallet || !active()) return
    operation.current = true
    setMode('connecting')
    setError('')
    try {
      await disconnect()
      if (!active()) return
      const response = await http.post<WalletConnection>(
        `/wallets/${encodeURIComponent(wallet.id)}/connections`,
        { network },
      )
      if (!active()) return
      connectionRef.current = response.data
      setConnection(response.data)
      setNotice('Carteira conectada.')
    } catch (failure) {
      if (active())
        setError(
          getErrorMessage(failure, 'Não foi possível conectar a carteira.'),
        )
    } finally {
      operation.current = false
      if (active()) setMode('idle')
    }
  }

  async function freshQuote(): Promise<Quote> {
    if (!active()) throw new Error('A sessão foi encerrada.')
    const current = keepLatestCart((await http.get<Cart>('/cart')).data)
    if (!active() || current.userId !== userId)
      throw new Error('O carrinho retornado não corresponde à sua conta.')
    const quoted = (
      await http.post<Quote>('/quotes', {
        cartVersion: current.version,
        network,
      })
    ).data
    if (!active() || quoted.cartId !== current.id)
      throw new Error('A cotação retornada não corresponde ao seu carrinho.')
    return quoted
  }

  function validConnection() {
    return Boolean(
      wallet &&
      connection &&
      connection.walletId === wallet.id &&
      connection.network === network &&
      connection.status === 'connected' &&
      Date.parse(connection.expiresAt) > Date.now(),
    )
  }

  async function reviewPurchase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (operation.current || !active()) return
    const next = Object.fromEntries(
      Object.entries(collector).map(([field, value]) => [field, value.trim()]),
    ) as unknown as CheckoutCollector
    const nextErrors = validateCollector(next)
    setErrors(nextErrors)
    setReview(null)
    if (Object.keys(nextErrors).length) {
      setError('Confira os campos indicados antes de revisar.')
      return
    }
    if (!validConnection()) {
      setError(
        'Conecte uma carteira válida na rede selecionada para revisar a compra.',
      )
      return
    }
    operation.current = true
    setMode('reviewing')
    setError('')
    setCollector(next)
    persistDraft(next)
    try {
      const fresh = await freshQuote()
      if (active()) {
        if (
          currentNftKey !==
          nftRevisionKey(nftIds, getRealtimeState().nftRevisions)
        ) {
          setError(
            'Preço ou disponibilidade mudou durante a revisão. Revise a compra novamente.',
          )
          return
        }
        setReviewNftKey(currentNftKey)
        setReview(fresh)
        setNotice('Confira os valores e confirme a compra.')
      }
    } catch (failure) {
      if (active()) {
        setError(getErrorMessage(failure, 'Não foi possível revisar a compra.'))
        setErrors(getFieldErrors(failure))
      }
    } finally {
      operation.current = false
      if (active()) setMode('idle')
    }
  }

  async function postAttempt(record: PurchaseAttempt) {
    try {
      const response = await http.post<Order>('/orders', record.body, {
        headers: { 'Idempotency-Key': record.key },
        timeout: 1200,
      })
      if (active()) await navigateToOrder(response.data, record)
    } catch (failure) {
      if (!active()) return
      const status = isAxiosError(failure)
        ? failure.response?.status
        : undefined
      const api = getApiError(failure)
      if (
        status &&
        status !== 401 &&
        status !== 503 &&
        api?.code !== 'idempotency-conflict'
      ) {
        clearAttempt(userId, record.key)
        attemptRef.current = null
        setAttempt(null)
        setReview(null)
        setMode('idle')
        setErrors(getFieldErrors(failure))
        setError(
          api?.code === 'quote-stale'
            ? 'Os valores ou a disponibilidade mudaram. Revise a compra novamente para confirmar.'
            : getErrorMessage(
                failure,
                'A compra não foi enviada. Revise os dados e tente novamente.',
              ),
        )
        if (
          api?.code === 'wallet-disconnected' ||
          api?.code === 'network-mismatch'
        ) {
          connectionRef.current = null
          setConnection(null)
        }
        void refreshCommerce()
      } else await recover(record)
    }
  }

  async function confirmPurchase() {
    if (operation.current || !review || !active()) return
    if (!validConnection()) {
      setReview(null)
      setError('Conecte a carteira novamente antes de confirmar.')
      return
    }
    operation.current = true
    setMode('sending')
    setError('')
    try {
      const fresh = await freshQuote()
      if (!active()) return
      if (
        reviewNftKey !==
          nftRevisionKey(nftIds, getRealtimeState().nftRevisions) ||
        quoteFingerprint(fresh) !== quoteFingerprint(review)
      ) {
        setReview(null)
        setError(
          'Os valores ou a disponibilidade mudaram. Revise a compra novamente para confirmar.',
        )
        void refreshCommerce()
        return
      }
      const record: PurchaseAttempt = {
        userId,
        key: crypto.randomUUID(),
        body: {
          quoteId: fresh.id,
          quoteVersion: fresh.version,
          collector,
          walletId,
          walletConnectionId: connection!.id,
          network,
        },
      }
      writeAttempt(record)
      attemptRef.current = record
      setAttempt(record)
      await postAttempt(record)
    } catch (failure) {
      if (active()) {
        setReview(null)
        setError(
          getErrorMessage(
            failure,
            failure instanceof Error
              ? failure.message
              : 'Não foi possível revalidar a compra. Revise os valores.',
          ),
        )
      }
    } finally {
      operation.current = false
      if (active())
        setMode((previous) =>
          previous === 'unknown' || previous === 'recovering'
            ? previous
            : 'idle',
        )
    }
  }

  async function retryAttempt() {
    if (!attempt || operation.current || !active()) return
    operation.current = true
    setMode('sending')
    setError('')
    try {
      await postAttempt(attempt)
    } finally {
      operation.current = false
      if (active())
        setMode((previous) =>
          previous === 'unknown' || previous === 'recovering'
            ? previous
            : 'idle',
        )
    }
  }

  if (attempt)
    return (
      <section className="mx-auto max-w-xl">
        <h1 className="text-3xl font-bold">Pagamento com carteira</h1>
        <p role="status" className="mt-6">
          {mode === 'unknown'
            ? 'O resultado desta tentativa ainda precisa ser recuperado.'
            : mode === 'sending'
              ? 'Enviando a mesma tentativa de compra…'
              : 'Recuperando o estado do pedido…'}
        </p>
        <FormFeedback error={error} />
        <p className="mt-5 text-sm text-muted-foreground">
          Evite iniciar uma nova compra enquanto o resultado desta tentativa não
          for conhecido.
        </p>
        <Button
          className="mt-6"
          disabled={mode !== 'unknown' && mode !== 'idle'}
          onClick={() => void retryAttempt()}
        >
          Retomar tentativa
        </Button>
      </section>
    )
  if (!cart.items.length)
    return (
      <section>
        <h1 className="text-3xl font-bold">Pagamento com carteira</h1>
        <p className="mt-6">Seu carrinho está vazio.</p>
        <Button asChild className="mt-5">
          <Link to="/">Explorar NFTs</Link>
        </Button>
      </section>
    )
  const busy = mode !== 'idle'
  return (
    <section>
      <Link to="/cart" className="text-sm text-muted-foreground">
        ← Voltar ao carrinho
      </Link>
      <h1 className="mt-6 text-3xl font-bold">Pagamento com carteira</h1>
      {nftChanged && (
        <p role="status" className="mt-5 text-sm text-primary">
          Preço ou disponibilidade de um NFT foi atualizado. Os valores foram
          recalculados. Revise a compra novamente antes de confirmar.
        </p>
      )}
      <div className="mt-8 grid items-start gap-10 lg:grid-cols-[minmax(0,1.4fr)_minmax(20rem,1fr)]">
        <form
          aria-label="Dados do pagamento"
          noValidate
          onSubmit={reviewPurchase}
          className="min-w-0 space-y-6"
        >
          <h2 className="text-lg font-bold">Perfil do colecionador</h2>
          <fieldset
            disabled={busy}
            className="grid min-w-0 gap-6 sm:grid-cols-2"
          >
            <InputField
              label="Nome de exibição"
              name="name"
              value={collector.name}
              onChange={(event) => changeCollector('name', event.target.value)}
              required
              error={errors.name}
            />
            <InputField
              label="Nome de usuário"
              name="username"
              value={collector.username}
              onChange={(event) =>
                changeCollector('username', event.target.value)
              }
              required
              error={errors.username}
            />
            <InputField
              label="E-mail"
              name="email"
              type="email"
              value={collector.email}
              onChange={(event) => changeCollector('email', event.target.value)}
              required
              error={errors.email}
            />
            <InputField
              label="Nome do perfil"
              name="profileName"
              value={collector.profileName}
              onChange={(event) =>
                changeCollector('profileName', event.target.value)
              }
              required
              error={errors.profileName}
            />
            <InputField
              label="Nome ENS"
              name="ensName"
              value={collector.ensName}
              onChange={(event) =>
                changeCollector('ensName', event.target.value)
              }
              required
              error={errors.ensName}
            />
            <InputField
              label="Código de indicação"
              name="referralCode"
              value={collector.referralCode}
              onChange={(event) =>
                changeCollector('referralCode', event.target.value)
              }
              required
              error={errors.referralCode}
            />
            <InputField
              label="Endereço secundário"
              name="secondaryAddress"
              value={collector.secondaryAddress}
              onChange={(event) =>
                changeCollector('secondaryAddress', event.target.value)
              }
              error={errors.secondaryAddress}
            />
            <InputField
              label="Endereço da carteira"
              name="walletAddress"
              value={wallet?.address || ''}
              readOnly
            />
            <InputField
              label="Tipo de carteira"
              name="provider"
              value={wallet?.provider || ''}
              readOnly
            />
          </fieldset>
          <TextareaField
            label="Observação do colecionador"
            name="notes"
            value={collector.notes}
            maxLength={500}
            onChange={(event) => changeCollector('notes', event.target.value)}
            error={errors.notes}
          />
          <FormFeedback error={error} notice={notice} />
          <Button type="submit" disabled={busy || !wallet}>
            {mode === 'reviewing' ? 'Revalidando valores…' : 'Revisar compra'}
          </Button>
        </form>
        <aside className="min-w-0 space-y-6 rounded-xl border border-border bg-card p-5">
          <h2 className="text-lg font-bold">Seus NFTs</h2>
          <ul className="space-y-4">
            {cart.items.map((item) => (
              <li key={item.id} className="flex min-w-0 gap-3">
                <img
                  src={item.nft.image.src}
                  alt=""
                  width={56}
                  height={56}
                  className="size-14 shrink-0 rounded-md"
                />
                <div className="min-w-0">
                  <p className="text-sm font-bold">{item.nft.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.quantity} unidades
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <h2 className="text-lg font-bold">Carteira e rede</h2>
          {wallets.length ? (
            <>
              <SelectField
                label="Carteira"
                name="walletId"
                value={walletId}
                disabled={busy}
                onChange={(event) => {
                  const next = wallets.find(
                    (item) => item.id === event.target.value,
                  )
                  void disconnect().catch(() => undefined)
                  setWalletId(event.target.value)
                  const nextNetwork = next?.network || 'ethereum'
                  setNetwork(nextNetwork)
                  const nextCollector = next
                    ? {
                        ...collector,
                        profileName: next.profileName,
                        ensName: next.ensName,
                        referralCode: next.referralCode,
                        secondaryAddress: next.secondaryAddress,
                      }
                    : collector
                  setCollector(nextCollector)
                  persistDraft(nextCollector, event.target.value, nextNetwork)
                  setReview(null)
                  setError('')
                }}
              >
                {wallets.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="Rede"
                name="network"
                value={network}
                disabled={busy}
                onChange={(event) => {
                  void disconnect().catch(() => undefined)
                  const nextNetwork = event.target.value as WalletNetwork
                  setNetwork(nextNetwork)
                  persistDraft(collector, walletId, nextNetwork)
                  setReview(null)
                }}
              >
                <option value="ethereum">Ethereum</option>
                <option value="sepolia">Sepolia</option>
              </SelectField>
              {connection ? (
                <>
                  <p role="status" className="text-sm text-primary">
                    Carteira conectada.
                  </p>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void disconnect()
                        .then(() => setNotice('Carteira desconectada.'))
                        .catch((failure) =>
                          setError(
                            getErrorMessage(
                              failure,
                              'Não foi possível desconectar a carteira.',
                            ),
                          ),
                        )
                    }
                  >
                    Desconectar carteira
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void connectWallet()}
                >
                  {mode === 'connecting' ? 'Conectando…' : 'Conectar carteira'}
                </Button>
              )}
            </>
          ) : (
            <p>
              Cadastre uma carteira para continuar.{' '}
              <Link to="/wallets" className="text-primary underline">
                Gerenciar carteiras
              </Link>
            </p>
          )}
          {(!quote.isError || review || quote.data) && (
            <QuoteSummary
              quote={review || quote.data}
              pending={quote.isPending && !review}
            />
          )}
          {quote.isError && (
            <p role="alert" className="text-sm">
              {getErrorMessage(
                quote.error,
                'Não foi possível atualizar a cotação.',
              )}
            </p>
          )}
          {review && (
            <section
              aria-labelledby="review-heading"
              className="space-y-4 border-t border-border pt-5"
            >
              <h2 id="review-heading" className="text-lg font-bold">
                Revise sua compra
              </h2>
              <p className="text-sm">
                {collector.name} · {wallet?.label} ·{' '}
                {network === 'ethereum' ? 'Ethereum' : 'Sepolia'}
              </p>
              <ul className="space-y-2 text-xs">
                {review.items.map((item) => (
                  <li key={item.cartItemId}>
                    {
                      cart.items.find((entry) => entry.id === item.cartItemId)
                        ?.nft.name
                    }{' '}
                    × {item.quantity}: {formatEth(item.lineTotalEth)} ETH
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                Compra simulada. Confira os valores antes de confirmar.
              </p>
              <Button
                className="w-full"
                disabled={busy}
                onClick={() => void confirmPurchase()}
              >
                Confirmar compra
              </Button>
            </section>
          )}
        </aside>
      </div>
    </section>
  )
}
