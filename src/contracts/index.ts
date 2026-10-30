/** Transport DTOs only. Validate strings, integer ranges and ownership at runtime. */
export type EntityId = string
export type IsoDateTime = string
/** Nonnegative base-10 ETH string, no exponent; at most 18 fractional digits. */
export type EthAmount = string
/** Safe integer >= 1. Stock and pagination totals may also be zero. */
export type Quantity = number
export type ResourceVersion = number

export interface ImageAsset {
  src: string
  alt: string
}

export type NftCategory = 'art' | 'photography' | 'music'
/** Discovery metadata; amounts remain denominated in ETH in this demo. */
export type NftNetwork = 'ethereum' | 'polygon' | 'solana'
export type CatalogFeed = 'new' | 'trending'
export type NftSort =
  'featured' | 'popular' | 'price-asc' | 'price-desc' | 'name'

export interface NftEdition {
  id: EntityId
  label: string
  priceEth: EthAmount
  available: number
}

export interface Nft {
  id: EntityId
  name: string
  description: string
  collection: string
  category: NftCategory
  network?: NftNetwork
  listedAt?: IsoDateTime
  /** Mock discovery score from 0 to 100; does not represent real market data. */
  popularityScore?: number
  creator: { id: EntityId; name: string }
  image: ImageAsset
  gallery: ImageAsset[]
  editions: NftEdition[]
  version: ResourceVersion
}

export interface CatalogSearch {
  feed?: CatalogFeed
  q?: string
  category?: NftCategory
  collection?: string
  network?: NftNetwork
  minPrice?: EthAmount
  maxPrice?: EthAmount
  sort?: NftSort
  page?: number
}

export interface NftListRequest extends CatalogSearch {
  pageSize?: number
}

export interface NftListResponse {
  items: Nft[]
  total: number
  page: number
  pageSize: number
  /** Counts before category/pagination, retaining network, price and text filters. */
  categoryCounts?: Record<NftCategory, number>
  /** Counts before network/pagination, retaining category, price and text filters. */
  networkCounts?: Record<NftNetwork, number>
}

export type NftDetailResponse = Nft

export interface Collector {
  id: EntityId
  name: string
  email: string
  avatar: ImageAsset | null
}

export interface SessionResponse {
  user: Collector | null
  expiresAt: IsoDateTime | null
}

export interface RegisterRequest {
  name: string
  email: string
  password: string
}

export interface LoginRequest {
  email: string
  password: string
}

/** Successful authentication has a user and expiration, unlike anonymous session. */
export interface AuthenticationResponse {
  user: Collector
  expiresAt: IsoDateTime
}

/** Logout, password update and mock session expiration return HTTP 204. */
export type NoContentResponse = undefined

export interface FavoritesResponse {
  nftIds: EntityId[]
  version: ResourceVersion
}

/** PUT/DELETE /favorites/:nftId return the resulting list. */
export type FavoriteMutationResponse = FavoritesResponse

export interface CartItem {
  id: EntityId
  nftId: EntityId
  editionId: EntityId
  quantity: Quantity
  /** Current catalogue representation, never a substitute for an order snapshot. */
  nft: Nft
}

export interface Cart {
  id: EntityId
  userId: EntityId | null
  items: CartItem[]
  couponCode: string | null
  adjustments: CartAdjustment[]
  version: ResourceVersion
}

/** Explicit adjustments from a guest/account merge, never silently discarded stock. */
export interface CartAdjustment {
  nftId: EntityId
  editionId: EntityId
  requestedQuantity: Quantity
  /** Nonnegative integer; zero means the requested edition is unavailable. */
  acceptedQuantity: number
  reason: 'stock-limited' | 'unavailable'
}

export interface AddCartItemRequest {
  nftId: EntityId
  editionId: EntityId
  quantity: Quantity
}

export interface UpdateCartItemRequest {
  quantity: Quantity
}

export interface UpdateCartCouponRequest {
  couponCode: string | null
}

export type CartResponse = Cart
export type CartMutationResponse = Cart

export type WalletNetwork = 'ethereum' | 'sepolia'
export type WalletRole = 'primary' | 'secondary'

export interface Wallet {
  id: EntityId
  label: string
  displayName: string
  profileName: string
  provider: 'metamask' | 'walletconnect' | 'coinbase'
  email: string
  ensName: string
  referralCode: string
  secondaryAddress: string
  address: string
  network: WalletNetwork
  role: WalletRole
  version: ResourceVersion
}

export interface WalletWriteRequest {
  label: string
  displayName: string
  profileName: string
  provider: 'metamask' | 'walletconnect' | 'coinbase'
  email: string
  ensName: string
  referralCode: string
  secondaryAddress: string
  address: string
  network: WalletNetwork
  role: WalletRole
}

export interface WalletListResponse {
  items: Wallet[]
}

export type WalletMutationResponse = Wallet

export interface ConnectWalletRequest {
  network: WalletNetwork
}

export interface WalletConnection {
  id: EntityId
  walletId: EntityId
  network: WalletNetwork
  status: 'connected' | 'disconnected'
  expiresAt: IsoDateTime
}

export type WalletConnectionResponse = WalletConnection

export interface QuoteRequest {
  cartVersion: ResourceVersion
  network: WalletNetwork
}

export interface QuoteItem {
  cartItemId: EntityId
  nftId: EntityId
  editionId: EntityId
  nftVersion: ResourceVersion
  quantity: Quantity
  unitPriceEth: EthAmount
  lineTotalEth: EthAmount
}

export interface PriceSummary {
  subtotalEth: EthAmount
  discountEth: EthAmount
  networkFeeEth: EthAmount
  totalEth: EthAmount
}

export interface Quote extends PriceSummary {
  id: EntityId
  version: ResourceVersion
  cartId: EntityId
  cartVersion: ResourceVersion
  items: QuoteItem[]
  couponCode: string | null
  network: WalletNetwork
  expiresAt: IsoDateTime
}

export type QuoteResponse = Quote

export interface CheckoutCollector {
  name: string
  email: string
  username: string
  profileName: string
  ensName: string
  referralCode: string
  secondaryAddress: string
  notes: string
}

export interface CreateOrderRequest {
  quoteId: EntityId
  quoteVersion: ResourceVersion
  collector: CheckoutCollector
  walletId: EntityId
  walletConnectionId: EntityId
  network: WalletNetwork
}

export interface CreateOrderHeaders {
  'Idempotency-Key': string
}

export interface OrderItemSnapshot {
  readonly cartItemId: EntityId
  readonly nftId: EntityId
  readonly editionId: EntityId
  readonly name: string
  readonly editionLabel: string
  readonly image: Readonly<ImageAsset>
  readonly quantity: Quantity
  readonly unitPriceEth: EthAmount
  readonly lineTotalEth: EthAmount
}

export interface OrderSnapshot extends Readonly<PriceSummary> {
  readonly items: readonly OrderItemSnapshot[]
  readonly collector: Readonly<CheckoutCollector>
  readonly wallet: Readonly<
    Pick<Wallet, 'id' | 'label' | 'address' | 'network'>
  >
  readonly couponCode: string | null
  readonly quoteId: EntityId
  readonly createdAt: IsoDateTime
}

interface OrderBase {
  id: EntityId
  userId: EntityId
  idempotencyKey: string
  version: ResourceVersion
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
  readonly snapshot: OrderSnapshot
}

export interface PendingOrder extends OrderBase {
  status: 'pending'
}

export interface ConfirmedOrder extends OrderBase {
  status: 'confirmed'
  confirmedAt: IsoDateTime
  transactionReference: string
  /** Local simulated reference URL, never a claim of a real blockchain transaction. */
  simulatedExplorerUrl: string
}

export interface DeclinedOrder extends OrderBase {
  status: 'declined'
  declinedAt: IsoDateTime
  reason: 'payment-declined' | 'wallet-disconnected' | 'availability-changed'
  message: string
}

export type Order = PendingOrder | ConfirmedOrder | DeclinedOrder
export type CreateOrderResponse = Order
export type OrderResponse = Order

export interface OrderListResponse {
  items: Order[]
}

export interface Profile extends Collector {
  username: string
  ensName: string
  walletAlias: string
  bio: string
  version: ResourceVersion
}

export interface UpdateProfileRequest {
  name: string
  username: string
  ensName: string
  walletAlias: string
  email: string
  bio: string
}

export interface UpdateAvatarRequest {
  /** Image data URL validated for supported type, size and content by the mock API. */
  dataUrl: string
  alt: string
}

export interface ChangePasswordRequest {
  currentPassword: string
  newPassword: string
}

export type ProfileResponse = Profile
export type ProfileMutationResponse = Profile

interface ErrorBase {
  message: string
}

export type ApiError =
  | (ErrorBase & { code: 'validation'; fields: Record<string, string> })
  | (ErrorBase & {
      code: 'unauthorized'
      reason: 'missing' | 'expired' | 'invalid'
    })
  | (ErrorBase & { code: 'forbidden' })
  | (ErrorBase & { code: 'not-found'; resource: string })
  | (ErrorBase & { code: 'account-conflict'; field: 'email' })
  | (ErrorBase & {
      code: 'availability-conflict'
      nftId: EntityId
      editionId: EntityId
      available: number
    })
  | (ErrorBase & { code: 'coupon-invalid' | 'coupon-expired' })
  | (ErrorBase & {
      code: 'quote-stale'
      reason: 'expired' | 'cart-changed' | 'price-changed' | 'fee-changed'
    })
  | (ErrorBase & { code: 'idempotency-conflict' })
  | (ErrorBase & {
      code: 'wallet-refused' | 'wallet-disconnected' | 'network-mismatch'
    })
  | (ErrorBase & { code: 'transient'; retryAfterMs?: number })

export interface ApiErrorResponse {
  error: ApiError
}

export interface EventEnvelope<TType extends string, TData> {
  eventId: string
  type: TType
  resourceId: EntityId
  version: ResourceVersion
  occurredAt: IsoDateTime
  data: TData
}

export type NftUpdatedEvent = EventEnvelope<'nft.updated', Nft>

export interface OrderUpdatedEvent extends EventEnvelope<
  'order.updated',
  Order
> {
  userId: EntityId
}

export type MarketplaceEvent = NftUpdatedEvent | OrderUpdatedEvent

/** Socket.IO typed listener map; payloads pass through socket.io-client. */
export interface ServerToClientEvents {
  'nft.updated': (event: NftUpdatedEvent) => void
  'order.updated': (event: OrderUpdatedEvent) => void
}
