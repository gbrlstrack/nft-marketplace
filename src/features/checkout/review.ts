import type { CheckoutCollector, Quote } from '@/contracts'
import { formatEth } from '@/lib/eth'

export function quoteFingerprint(quote: Quote): string {
  return JSON.stringify({
    cartId: quote.cartId,
    cartVersion: quote.cartVersion,
    network: quote.network,
    couponCode: quote.couponCode,
    subtotal: formatEth(quote.subtotalEth),
    discount: formatEth(quote.discountEth),
    fee: formatEth(quote.networkFeeEth),
    total: formatEth(quote.totalEth),
    items: [...quote.items]
      .sort((a, b) => a.cartItemId.localeCompare(b.cartItemId))
      .map((item) => ({
        ...item,
        unitPriceEth: formatEth(item.unitPriceEth),
        lineTotalEth: formatEth(item.lineTotalEth),
      })),
  })
}

export function validateCollector(
  collector: CheckoutCollector,
): Record<string, string> {
  const errors: Record<string, string> = {}
  if (collector.name.trim().length < 2 || collector.name.trim().length > 80)
    errors.name = 'Informe um nome entre 2 e 80 caracteres.'
  if (!/^[a-z0-9_]{3,24}$/i.test(collector.username.trim()))
    errors.username = 'Use de 3 a 24 letras, números ou sublinhado.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(collector.email.trim()))
    errors.email = 'Informe um e-mail válido.'
  for (const field of ['profileName', 'referralCode'] as const)
    if (
      collector[field].trim().length < 2 ||
      collector[field].trim().length > 80
    )
      errors[field] = 'Use entre 2 e 80 caracteres.'
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.eth$/i.test(collector.ensName.trim()))
    errors.ensName = 'Informe um nome ENS válido terminado em .eth.'
  if (
    collector.secondaryAddress &&
    !/^0x[a-f0-9]{40}$/i.test(collector.secondaryAddress) &&
    !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.eth$/i.test(collector.secondaryAddress)
  )
    errors.secondaryAddress = 'Informe um endereço 0x ou ENS válido.'
  if (collector.notes.length > 500) errors.notes = 'Use até 500 caracteres.'
  return errors
}
