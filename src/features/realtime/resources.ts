import type {
  Cart,
  MarketplaceEvent,
  Nft,
  NftListResponse,
  Order,
} from '../../contracts/index.ts'

type RecordValue = Record<string, unknown>
const object = (value: unknown): value is RecordValue =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value))
const string = (value: unknown): value is string => typeof value === 'string'
const id = (value: unknown): value is string =>
  string(value) && value.length > 0
const integer = (value: unknown, minimum: number): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum
const date = (value: unknown): value is string =>
  string(value) && Number.isFinite(Date.parse(value))
const eth = (value: unknown): value is string =>
  string(value) && /^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(value)
const image = (value: unknown) =>
  object(value) && id(value.src) && string(value.alt)

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (object(value))
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`
  return JSON.stringify(value)
}

function nft(value: unknown): value is Nft {
  return (
    object(value) &&
    id(value.id) &&
    id(value.name) &&
    string(value.description) &&
    id(value.collection) &&
    ['art', 'photography', 'music'].includes(String(value.category)) &&
    object(value.creator) &&
    id(value.creator.id) &&
    id(value.creator.name) &&
    image(value.image) &&
    Array.isArray(value.gallery) &&
    value.gallery.length > 0 &&
    value.gallery.every(image) &&
    Array.isArray(value.editions) &&
    value.editions.length > 0 &&
    value.editions.every(
      (edition) =>
        object(edition) &&
        id(edition.id) &&
        id(edition.label) &&
        eth(edition.priceEth) &&
        integer(edition.available, 0),
    ) &&
    integer(value.version, 1)
  )
}

function order(value: unknown): value is Order {
  if (
    !object(value) ||
    !id(value.id) ||
    !id(value.userId) ||
    !id(value.idempotencyKey) ||
    !integer(value.version, 1) ||
    !date(value.createdAt) ||
    !date(value.updatedAt) ||
    !object(value.snapshot)
  )
    return false
  const snapshot = value.snapshot
  if (
    !['subtotalEth', 'discountEth', 'networkFeeEth', 'totalEth'].every(
      (field) => eth(snapshot[field]),
    ) ||
    !id(snapshot.quoteId) ||
    !date(snapshot.createdAt) ||
    !(snapshot.couponCode === null || string(snapshot.couponCode)) ||
    !Array.isArray(snapshot.items) ||
    snapshot.items.length === 0 ||
    !snapshot.items.every(
      (item) =>
        object(item) &&
        ['cartItemId', 'nftId', 'editionId', 'name', 'editionLabel'].every(
          (field) => id(item[field]),
        ) &&
        image(item.image) &&
        integer(item.quantity, 1) &&
        eth(item.unitPriceEth) &&
        eth(item.lineTotalEth),
    ) ||
    !object(snapshot.collector) ||
    ![
      'name',
      'email',
      'username',
      'profileName',
      'ensName',
      'referralCode',
      'secondaryAddress',
      'notes',
    ].every((field) => string((snapshot.collector as RecordValue)[field])) ||
    !object(snapshot.wallet) ||
    !['id', 'label', 'address'].every((field) =>
      id((snapshot.wallet as RecordValue)[field]),
    ) ||
    !['ethereum', 'sepolia'].includes(String(snapshot.wallet.network))
  )
    return false
  if (value.status === 'pending') return true
  if (value.status === 'confirmed')
    return (
      date(value.confirmedAt) &&
      id(value.transactionReference) &&
      value.simulatedExplorerUrl ===
        `/orders/${encodeURIComponent(value.id)}#transacao-simulada`
    )
  return (
    value.status === 'declined' &&
    date(value.declinedAt) &&
    [
      'payment-declined',
      'wallet-disconnected',
      'availability-changed',
    ].includes(String(value.reason)) &&
    string(value.message)
  )
}

export function validMarketplaceEvent(
  value: unknown,
): value is MarketplaceEvent {
  if (
    !object(value) ||
    !id(value.eventId) ||
    !id(value.resourceId) ||
    !integer(value.version, 1) ||
    !date(value.occurredAt)
  )
    return false
  if (value.type === 'nft.updated')
    return (
      nft(value.data) &&
      value.resourceId === value.data.id &&
      value.version === value.data.version
    )
  return (
    value.type === 'order.updated' &&
    order(value.data) &&
    value.userId === value.data.userId &&
    value.resourceId === value.data.id &&
    value.version === value.data.version
  )
}

/** Versions belong to an identity; terminal orders and their snapshots stay fixed. */
export class ResourceLedger {
  private nfts = new Map<string, Nft>()
  private orders = new Map<string, Order>()
  private eventIds = new Set<string>()

  keepNft(incoming: Nft): Nft {
    const previous = this.nfts.get(incoming.id)
    if (previous && previous.version >= incoming.version) return previous
    this.nfts.set(incoming.id, incoming)
    return incoming
  }

  keepOrder(incoming: Order): Order {
    const key = `${incoming.userId}:${incoming.id}`
    const previous = this.orders.get(key)
    if (
      previous &&
      (previous.version >= incoming.version || previous.status !== 'pending')
    )
      return previous
    const accepted = previous
      ? { ...incoming, snapshot: previous.snapshot }
      : incoming
    this.orders.set(key, accepted)
    return accepted
  }

  accept(
    value: unknown,
    userId: string | null,
    expectedType?: MarketplaceEvent['type'],
  ): MarketplaceEvent | null {
    if (!validMarketplaceEvent(value) || this.eventIds.has(value.eventId))
      return null
    if (expectedType && value.type !== expectedType) return null
    if (value.type === 'order.updated' && value.userId !== userId) return null
    const previous =
      value.type === 'nft.updated'
        ? this.nfts.get(value.resourceId)
        : this.orders.get(`${value.userId}:${value.resourceId}`)
    if (previous && previous.version >= value.version) return null
    if (value.type === 'order.updated' && previous) {
      if ((previous as Order).status !== 'pending') return null
      if (
        canonical((previous as Order).snapshot) !==
        canonical(value.data.snapshot)
      )
        return null
    }
    this.eventIds.add(value.eventId)
    // Bounded deduplication; version/terminal guards remain after old IDs leave.
    if (this.eventIds.size > 1_000)
      this.eventIds.delete(this.eventIds.values().next().value!)
    if (value.type === 'nft.updated') this.keepNft(value.data)
    else this.keepOrder(value.data)
    return value
  }

  clearPrivate() {
    this.orders.clear()
    this.eventIds.clear()
  }
}

export const resources = new ResourceLedger()
export const keepLatestNft = (value: Nft) => resources.keepNft(value)
export const keepLatestOrder = (value: Order) => resources.keepOrder(value)
export const keepLatestCart = (cart: Cart): Cart => ({
  ...cart,
  items: cart.items.map((item) => ({ ...item, nft: keepLatestNft(item.nft) })),
})
export const keepLatestCatalog = (
  catalog: NftListResponse,
): NftListResponse => ({
  ...catalog,
  items: catalog.items.map(keepLatestNft),
})
