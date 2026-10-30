import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { X } from 'lucide-react'
import type { ConfirmedOrder } from '@/contracts'
import { Button } from '@/components/ui/button'
import { formatEth, parseEth } from '@/lib/eth'

function ThankYouMark() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 76 88"
      className="mx-auto h-20 w-[70px] text-[#d18a47]"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m29 9 4-4a7 7 0 0 1 10 0l4 4" />
      <path d="m10 30-6 6v48h68V36l-6-6" />
      <path d="M10 55V12a3 3 0 0 1 3-3h50a3 3 0 0 1 3 3v43" />
      <path d="m4 39 20 22m48-22L52 61M5 82l27-28a8 8 0 0 1 12 0l27 28" />
      <text
        x="38"
        y="29"
        textAnchor="middle"
        fill="currentColor"
        stroke="none"
        fontFamily="ui-monospace, monospace"
        fontSize="13"
        fontWeight="700"
      >
        <tspan x="38">THANK</tspan>
        <tspan x="38" dy="14">
          YOU
        </tspan>
      </text>
    </svg>
  )
}

export function ConfirmedOrderReceipt({
  order,
  warning,
}: {
  order: ConfirmedOrder
  warning?: ReactNode
}) {
  const snapshot = order.snapshot
  const network = snapshot.wallet.network === 'sepolia' ? 'Sepolia' : 'Ethereum'
  const dateParts = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'America/Sao_Paulo',
  }).formatToParts(new Date(order.confirmedAt))
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    dateParts.find((entry) => entry.type === type)?.value || ''
  const month = part('month').replace(/\.$/, '')
  const date = `${part('day')} ${month.charAt(0).toUpperCase()}${month.slice(1)}, ${part('year')}`
  const discounted = parseEth(snapshot.discountEth) > 0n

  return (
    <section
      aria-label="Confirmação do pedido"
      className="@container relative mx-auto w-full max-w-[578px] border-b-[10px] border-[#d18a47] bg-card font-mono"
    >
      <header className="relative px-5 pt-6 pb-3 text-center">
        <h1 className="sr-only" aria-live="polite">
          Compra confirmada
        </h1>
        <Link
          to="/"
          aria-label="Fechar confirmação"
          className="absolute top-3 right-3 flex size-9 items-center justify-center rounded-sm text-[#d18a47] hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <X aria-hidden="true" className="size-4" strokeWidth={1.25} />
        </Link>
        <ThankYouMark />
        <p className="mt-4 text-sm font-bold tracking-wide text-[#cdb189] @[480px]:text-base">
          Seus NFTs agora estão na sua carteira
        </p>
      </header>

      <dl className="grid grid-cols-2 gap-y-4 border-y border-[#d18a47] px-5 py-3.5 text-sm leading-[18px] text-[#cdb189] @[480px]:grid-cols-[1.3fr_1fr_1fr_1fr]">
        <div className="min-w-0 border-r border-[#d18a47] px-3">
          <dt className="font-bold">ID da transação</dt>
          <dd className="truncate" title={order.transactionReference}>
            {order.transactionReference}
          </dd>
        </div>
        <div className="min-w-0 px-3 @[480px]:border-r @[480px]:border-[#d18a47]">
          <dt>Data</dt>
          <dd>
            <time dateTime={order.confirmedAt}>{date}</time>
          </dd>
        </div>
        <div className="min-w-0 border-r border-[#d18a47] px-3">
          <dt>Total</dt>
          <dd className="break-all">{formatEth(snapshot.totalEth)} ETH</dd>
        </div>
        <div className="min-w-0 px-3">
          <dt className="font-bold">Carteira</dt>
          <dd className="truncate" title={snapshot.wallet.label}>
            {snapshot.wallet.label}
          </dd>
        </div>
      </dl>

      <div className="px-5 pt-5 pb-9 @[480px]:px-11">
        {warning}
        <h2 className="text-sm font-bold">Detalhes da transação</h2>
        <div
          aria-hidden="true"
          className="mt-2 grid grid-cols-[minmax(0,1fr)_5.5rem] gap-x-3 border-b border-border pb-2 text-sm font-bold @[480px]:grid-cols-[minmax(0,1fr)_4.5rem_6.5rem] @[480px]:text-base"
        >
          <span>NFTs</span>
          <span className="hidden text-center @[480px]:block">Edições</span>
          <span className="text-right">Subtotal</span>
        </div>
        <ul aria-label="NFTs do pedido" className="mt-3 space-y-4">
          {snapshot.items.map((item) => (
            <li
              key={item.cartItemId}
              className="grid min-w-0 grid-cols-[minmax(0,1fr)_5.5rem] items-center gap-x-3 @[480px]:grid-cols-[minmax(0,1fr)_4.5rem_6.5rem]"
            >
              <div className="flex min-w-0 items-center gap-3">
                <img
                  src={item.image.src}
                  alt={item.image.alt}
                  width={70}
                  height={70}
                  className="size-14 shrink-0 rounded-lg object-cover @[480px]:size-[70px]"
                />
                <div className="min-w-0">
                  <p className="break-words text-sm font-bold @[480px]:text-base">
                    {item.name}
                  </p>
                  <p className="mt-0.5 break-all text-xs text-[#b7955e] @[480px]:text-sm">
                    ID do token: {item.nftId}
                  </p>
                  <p className="mt-1 text-xs text-[#cdb189]">
                    {item.editionLabel} × {item.quantity}
                  </p>
                </div>
              </div>
              <p className="hidden text-center text-sm text-[#cdb189] @[480px]:block">
                (x {item.quantity})
              </p>
              <p className="break-all text-right text-sm font-bold text-[#df944e] @[480px]:text-lg">
                {formatEth(item.lineTotalEth)} ETH
              </p>
            </li>
          ))}
        </ul>

        <dl className="mt-5 ml-auto max-w-80 space-y-2 text-sm @[480px]:text-base">
          {discounted && (
            <>
              <div className="flex items-start justify-between gap-4">
                <dt>Subtotal</dt>
                <dd className="min-w-0 break-all text-right">
                  {formatEth(snapshot.subtotalEth)} ETH
                </dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt>
                  Desconto
                  {snapshot.couponCode ? ` (${snapshot.couponCode})` : ''}
                </dt>
                <dd className="min-w-0 break-all text-right">
                  − {formatEth(snapshot.discountEth)} ETH
                </dd>
              </div>
            </>
          )}
          <div className="flex items-start justify-between gap-4">
            <dt className="shrink-0">Taxa de rede</dt>
            <dd className="min-w-0 break-all text-right">
              {formatEth(snapshot.networkFeeEth)} ETH
            </dd>
          </div>
          <div className="flex items-start justify-between gap-4 font-bold">
            <dt>Total</dt>
            <dd
              data-testid="order-total"
              className="min-w-0 break-all text-right text-[#df944e]"
            >
              {formatEth(snapshot.totalEth)} ETH
            </dd>
          </div>
        </dl>

        <div
          id="transacao-simulada"
          className="mt-2 border-t border-border pt-3 text-center"
        >
          <p className="text-sm leading-relaxed text-[#cdb189]">
            Compra confirmada na simulação em {network}. Nenhuma transferência
            real foi enviada à blockchain.
          </p>
          <Button
            asChild
            className="mt-5 min-h-12 rounded-md bg-[#d18a47] px-4 text-base font-bold text-black hover:bg-[#d18a47]/85"
          >
            <a href={order.simulatedExplorerUrl}>Ver transação simulada</a>
          </Button>
        </div>

        <details className="mt-6 text-xs text-muted-foreground">
          <summary className="cursor-pointer py-1">Dados do pedido</summary>
          <dl className="mt-3 space-y-3">
            <div>
              <dt className="font-bold">Pedido</dt>
              <dd data-testid="order-id" className="break-all">
                {order.id}
              </dd>
            </div>
            <div>
              <dt className="font-bold">Colecionador</dt>
              <dd className="break-words">{snapshot.collector.name}</dd>
            </div>
            <div>
              <dt className="font-bold">Endereço da carteira</dt>
              <dd className="break-all">{snapshot.wallet.address}</dd>
            </div>
            <div>
              <dt className="font-bold">Referência da transação simulada</dt>
              <dd className="break-all">{order.transactionReference}</dd>
            </div>
          </dl>
        </details>
      </div>
    </section>
  )
}
