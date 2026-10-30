import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { Minus, Plus, Trash2 } from 'lucide-react'
import type { Cart, CartItem } from '@/contracts'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useSession } from '@/features/auth/use-session'
import { getApiError, getErrorMessage } from '@/lib/api-error'
import { ethFromWei, formatEth, parseEth } from '@/lib/eth'
import { useCartActions, useCartQuery, useQuoteQuery } from './queries'
import { QuoteSummary } from './quote-summary'
import { useRealtime } from '@/features/realtime/state'

export function CartPage() {
  const navigate = useNavigate()
  const { authPending } = useSession()
  const cart = useCartQuery()
  const actions = useCartActions()
  const quote = useQuoteQuery(cart.data, 'ethereum')
  const [couponError, setCouponError] = useState('')
  const mutationError = [actions.update, actions.remove, actions.coupon].find(
    (action) => action.isError,
  )?.error

  function applyCoupon(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const code = String(
      new FormData(event.currentTarget).get('coupon') || '',
    ).trim()
    setCouponError(code ? '' : 'Informe o código promocional.')
    if (code && !actions.busy) actions.coupon.mutate(code)
  }

  return (
    <section>
      <h1 className="mb-8 text-3xl font-bold">Carrinho de NFTs</h1>
      {authPending || cart.isPending ? (
        <div
          role="status"
          aria-label="Carregando carrinho"
          className="grid gap-8 lg:grid-cols-[2fr_1fr]"
        >
          <Skeleton className="h-72" />
          <Skeleton className="h-80" />
        </div>
      ) : cart.isError && !cart.data ? (
        <div role="alert">
          <p>
            {getErrorMessage(
              cart.error,
              'Não foi possível carregar o carrinho.',
            )}
          </p>
          {getApiError(cart.error)?.code === 'unauthorized' ? (
            <Button asChild className="mt-5">
              <Link to="/login" search={{ returnTo: '/cart' }}>
                Entrar para recuperar o carrinho
              </Link>
            </Button>
          ) : (
            <Button className="mt-5" onClick={() => void cart.refetch()}>
              Tentar novamente
            </Button>
          )}
        </div>
      ) : cart.data ? (
        !cart.data.items.length ? (
          <div className="rounded-xl border border-border bg-card p-8">
            <h2 className="text-xl font-bold">Seu carrinho está vazio</h2>
            <p className="mt-3 text-sm text-muted-foreground">
              Encontre a próxima obra da sua coleção.
            </p>
            <Button asChild className="mt-6">
              <Link to="/">Continuar explorando</Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="mb-5 space-y-3" aria-live="polite">
              <CartUpdatesNotice cart={cart.data} />
              {cart.data.adjustments.map((adjustment) => (
                <p
                  key={`${adjustment.nftId}:${adjustment.editionId}`}
                  role="alert"
                  className="rounded-lg border border-primary/50 p-4 text-sm"
                >
                  Disponibilidade ajustada ao entrar:{' '}
                  {adjustment.requestedQuantity} unidades solicitadas,{' '}
                  {adjustment.acceptedQuantity} mantidas no carrinho.
                </p>
              ))}
            </div>
            {mutationError && (
              <p
                role="alert"
                className="mb-5 rounded-lg border border-primary/50 p-4 text-sm"
              >
                {getErrorMessage(
                  mutationError,
                  'Não foi possível alterar o carrinho. Tente novamente.',
                )}
              </p>
            )}
            {cart.isError && (
              <p role="alert" className="mb-5 text-sm">
                Não foi possível atualizar o carrinho.{' '}
                <button
                  className="underline"
                  onClick={() => void cart.refetch()}
                >
                  Tentar novamente
                </button>
              </p>
            )}
            <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
              <ul
                aria-label="Itens do carrinho"
                className="@container space-y-4"
              >
                {cart.data.items.map((item) => (
                  <CartLine
                    key={`${item.id}:${item.quantity}`}
                    item={item}
                    busy={actions.busy}
                    update={(quantity) =>
                      actions.update.mutate({ itemId: item.id, quantity })
                    }
                    remove={() => actions.remove.mutate(item.id)}
                  />
                ))}
              </ul>
              <aside
                aria-label="Resumo do carrinho"
                className="min-w-0 space-y-6 rounded-xl bg-card p-5"
              >
                <h2 className="text-lg font-bold">Resumo da carteira</h2>
                <form
                  aria-label="Cupom de desconto"
                  onSubmit={applyCoupon}
                  className="space-y-3"
                >
                  <label htmlFor="cart-coupon" className="block text-sm">
                    Código promocional
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <input
                      key={cart.data.couponCode}
                      id="cart-coupon"
                      name="coupon"
                      defaultValue={cart.data.couponCode || ''}
                      maxLength={40}
                      aria-invalid={Boolean(
                        couponError || actions.coupon.isError,
                      )}
                      aria-describedby={
                        couponError ? 'cart-coupon-error' : undefined
                      }
                      className="min-h-11 w-full min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-sm"
                    />
                    <Button disabled={actions.busy} type="submit">
                      Aplicar cupom
                    </Button>
                  </div>
                  {couponError && (
                    <p id="cart-coupon-error" className="text-sm text-primary">
                      {couponError}
                    </p>
                  )}
                  {cart.data.couponCode && (
                    <div className="text-sm">
                      <p role="status">
                        Cupom {cart.data.couponCode} aplicado.
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={actions.busy}
                        onClick={() => actions.coupon.mutate(null)}
                      >
                        Remover cupom
                      </Button>
                    </div>
                  )}
                </form>
                {quote.isError ? (
                  <div role="alert">
                    <p className="text-sm">
                      {getErrorMessage(
                        quote.error,
                        'Não foi possível calcular os valores.',
                      )}
                    </p>
                    <Button
                      variant="outline"
                      className="mt-4"
                      onClick={() => void quote.refetch()}
                    >
                      Atualizar valores
                    </Button>
                  </div>
                ) : (
                  <QuoteSummary quote={quote.data} pending={quote.isFetching} />
                )}
                <Button
                  className="w-full"
                  disabled={
                    !quote.data ||
                    quote.isError ||
                    quote.isFetching ||
                    actions.busy ||
                    cart.isError
                  }
                  onClick={() => void navigate({ to: '/checkout' })}
                >
                  Conectar e finalizar
                </Button>
                <Link to="/" className="block text-center text-sm text-primary">
                  Continuar explorando
                </Link>
              </aside>
            </div>
          </>
        )
      ) : null}
    </section>
  )
}

function CartUpdatesNotice({ cart }: { cart: Cart }) {
  const { nftRevisions } = useRealtime()
  const [initialNftRevisions] = useState(() => nftRevisions)
  const [initialVersions] = useState(() =>
    Object.fromEntries(
      cart.items.map((item) => [item.nftId, item.nft.version]),
    ),
  )
  const changed = cart.items.some(
    (item) =>
      (nftRevisions[item.nftId] || 0) >
        (initialNftRevisions[item.nftId] || 0) ||
      (initialVersions[item.nftId] !== undefined &&
        item.nft.version > initialVersions[item.nftId]),
  )
  return changed ? (
    <p role="status" className="text-sm text-primary">
      Preço ou disponibilidade de um NFT foi atualizado. Os valores foram
      recalculados.
    </p>
  ) : null
}

function CartLine({
  item,
  busy,
  update,
  remove,
}: {
  item: CartItem
  busy: boolean
  update: (quantity: number) => void
  remove: () => void
}) {
  const edition = item.nft.editions.find(
    (edition) => edition.id === item.editionId,
  )
  const [draft, setDraft] = useState(String(item.quantity))
  const available = edition?.available || 0
  const value = Number(draft)
  const invalid = !Number.isSafeInteger(value) || value < 1 || value > available
  const inputId = `cart-quantity-${item.id}`
  function commit() {
    if (!invalid && value !== item.quantity && !busy) update(value)
  }
  return (
    <li className="grid min-w-0 grid-cols-[70px_minmax(0,1fr)_44px] items-center gap-x-4 gap-y-3 bg-card pb-3 @[44rem]:grid-cols-[70px_minmax(0,1.3fr)_minmax(0,1fr)_auto_minmax(0,1fr)_44px] @[44rem]:pb-0">
      <img
        src={item.nft.image.src}
        alt={item.nft.image.alt}
        width={70}
        height={70}
        className="size-[70px] rounded-md object-cover"
      />
      <div className="min-w-0 py-1">
        <h2 className="text-base leading-5 font-bold">
          <Link
            to="/nfts/$nftId"
            params={{ nftId: item.nftId }}
            className="break-words"
          >
            {item.nft.name}
          </Link>
        </h2>
        <p className="mt-1 break-all text-xs text-[#b4935f]">
          ID do token: {item.nftId}
        </p>
        {item.nft.editions.length > 1 && (
          <p className="mt-1 text-xs text-muted-foreground">{edition?.label}</p>
        )}
      </div>
      <div className="col-span-full grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-3 @[44rem]:contents">
        <p
          aria-label="Preço unitário"
          className="min-w-0 break-all text-sm font-bold text-muted-foreground @[44rem]:text-center @[44rem]:text-base"
        >
          {edition
            ? `${formatEth(edition.priceEth)} ETH`
            : 'Edição indisponível'}
        </p>
        <div className="min-w-0">
          <label className="sr-only" htmlFor={inputId}>
            Quantidade de {item.nft.name}
          </label>
          <div className="flex items-center justify-center">
            <button
              type="button"
              disabled={busy || item.quantity <= 1}
              aria-label={`Diminuir quantidade de ${item.nft.name}`}
              onClick={() => update(item.quantity - 1)}
              className="group flex min-h-11 w-9 shrink-0 items-center justify-center rounded-md disabled:opacity-50"
            >
              <span className="flex h-7 w-[18px] items-center justify-center rounded-full bg-primary text-primary-foreground group-hover:bg-primary/85">
                <Minus aria-hidden="true" className="size-3" />
              </span>
            </button>
            <input
              id={inputId}
              type="number"
              min={1}
              max={Math.max(1, available)}
              step={1}
              value={draft}
              disabled={busy || available === 0}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={commit}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur()
              }}
              aria-invalid={invalid}
              aria-describedby={invalid ? `${inputId}-error` : undefined}
              className="min-h-11 w-7 min-w-0 rounded-sm border-0 bg-transparent p-0 text-center text-base [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            <button
              type="button"
              disabled={busy || item.quantity >= available}
              aria-label={`Aumentar quantidade de ${item.nft.name}`}
              onClick={() => update(item.quantity + 1)}
              className="group flex min-h-11 w-9 shrink-0 items-center justify-center rounded-md disabled:opacity-50"
            >
              <span className="flex h-7 w-[18px] items-center justify-center rounded-full bg-primary text-primary-foreground group-hover:bg-primary/85">
                <Plus aria-hidden="true" className="size-3" />
              </span>
            </button>
          </div>
          {invalid && (
            <p id={`${inputId}-error`} className="mt-2 text-xs text-primary">
              {available
                ? `Escolha de 1 a ${available} unidades.`
                : 'Edição esgotada. Remova o item para continuar.'}
            </p>
          )}
        </div>
        <p
          aria-label="Total do item"
          className="min-w-0 text-right break-all text-sm font-bold text-primary @[44rem]:text-center @[44rem]:text-base"
        >
          {edition
            ? `${ethFromWei(parseEth(edition.priceEth) * BigInt(item.quantity))} ETH`
            : 'Indisponível'}
        </p>
      </div>
      <button
        type="button"
        aria-label={`Remover ${item.nft.name}`}
        disabled={busy}
        onClick={remove}
        className="col-start-3 row-start-1 flex size-11 items-center justify-center rounded-md text-[#b4935f] hover:bg-muted hover:text-primary disabled:opacity-50 @[44rem]:col-start-6"
      >
        <Trash2 aria-hidden="true" className="size-5" strokeWidth={1.5} />
      </button>
    </li>
  )
}
