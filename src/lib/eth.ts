const WEI_PER_ETH = 10n ** 18n
const DECIMAL_ETH = /^(0|[1-9]\d*)(?:\.(\d{1,18}))?$/

/** ETH decimal to integer wei; never passes monetary values through Number. */
export function parseEth(value: string): bigint {
  if (!DECIMAL_ETH.test(value)) throw new RangeError('Valor ETH inválido.')
  const [whole, fraction = ''] = value.split('.')
  return BigInt(whole) * WEI_PER_ETH + BigInt(fraction.padEnd(18, '0'))
}

export function ethFromWei(value: bigint): string {
  if (value < 0n) throw new RangeError('Valor ETH negativo.')
  const whole = value / WEI_PER_ETH
  const fraction = (value % WEI_PER_ETH).toString().padStart(18, '0').replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : whole.toString()
}

export function formatEth(value: string): string {
  return ethFromWei(parseEth(value))
}
