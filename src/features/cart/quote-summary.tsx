import type { PriceSummary } from '@/contracts'
import { Skeleton } from '@/components/ui/skeleton'
import { formatEth } from '@/lib/eth'

export function QuoteSummary({
  quote,
  pending = false,
  totalTestId = 'cart-total',
}: {
  quote?: PriceSummary
  pending?: boolean
  totalTestId?: string
}) {
  if (!quote)
    return (
      <div
        role="status"
        aria-label="Carregando resumo do carrinho"
        className="space-y-5"
      >
        <span className="sr-only">Carregando resumo do carrinho</span>
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-6 w-full" />
        ))}
      </div>
    )
  return (
    <div>
      <dl className="space-y-4 text-sm">
        <div className="flex flex-wrap justify-between gap-2">
          <dt>Subtotal</dt>
          <dd data-testid="cart-subtotal" className="break-all">
            {formatEth(quote.subtotalEth)} ETH
          </dd>
        </div>
        <div className="flex flex-wrap justify-between gap-2">
          <dt>Desconto</dt>
          <dd data-testid="cart-discount" className="break-all">
            − {formatEth(quote.discountEth)} ETH
          </dd>
        </div>
        <div className="flex flex-wrap justify-between gap-2">
          <dt>Taxa de rede</dt>
          <dd data-testid="cart-fee" className="break-all">
            {formatEth(quote.networkFeeEth)} ETH
          </dd>
        </div>
        <div className="flex flex-wrap justify-between gap-2 border-t border-border pt-4 font-bold">
          <dt>Total</dt>
          <dd data-testid={totalTestId} className="break-all text-primary">
            {formatEth(quote.totalEth)} ETH
          </dd>
        </div>
      </dl>
      {pending && (
        <p role="status" className="mt-3 text-xs text-muted-foreground">
          Atualizando valores…
        </p>
      )}
    </div>
  )
}
