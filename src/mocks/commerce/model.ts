import type {
  Cart,
  CheckoutCollector,
  Nft,
  Order,
  Quote,
  WalletNetwork,
} from '../../contracts/index.ts'
import type { AccountDatabase } from '../account/database.ts'
import { nftFixtures } from '../fixtures.ts'
import { ethFromWei, parseEth } from '../../lib/eth.ts'
import {
  ApiFault,
  invalid,
  text,
  validEmail,
  validEns,
  validUsername,
} from '../account/validation.ts'

export interface CommerceContext {
  userId: string | null
  token?: string
  guestId?: string
}
export interface QuoteRecord {
  quote: Quote
  usedByOrderId?: string
}
export interface OrderRecord {
  order: Order
  cartId: string
  walletConnectionId: string
  sessionToken: string
  settleAt: number | null
  declined: boolean
  /** Purchased units still represented in the current cart, separate from the receipt. */
  remainingCartQuantities?: Record<string, number>
}
export interface CommerceState {
  catalog: Nft[]
  carts: Record<string, Cart>
  retiredGuestIds: string[]
  quotes: QuoteRecord[]
  orders: OrderRecord[]
  idempotency: {
    userId: string
    key: string
    canonical: string
    orderId: string
  }[]
  fees: Record<WalletNetwork, string>
  expiredCoupons: string[]
}

export function commerce(database: AccountDatabase): CommerceState {
  const state = (database.commerce ??= {
    catalog: structuredClone(nftFixtures),
    carts: {},
    retiredGuestIds: [],
    quotes: [],
    orders: [],
    idempotency: [],
    fees: { ethereum: '0.016', sepolia: '0.001' },
    expiredCoupons: [],
  })
  for (const nft of state.catalog) {
    if (nft.network !== undefined) continue
    nft.network =
      nftFixtures.find((fixture) => fixture.id === nft.id)?.network ??
      'ethereum'
    nft.version += 1
  }
  return state
}

export function unauthorized(reason: 'missing' | 'invalid' | 'expired'): never {
  throw new ApiFault(401, {
    code: 'unauthorized',
    reason,
    message:
      reason === 'expired'
        ? 'Sua sessão expirou. Entre novamente.'
        : 'Entre na sua conta para continuar.',
  })
}

export function authorize(
  database: AccountDatabase,
  context: CommerceContext,
  requireUser = false,
) {
  if (context.userId) {
    const session = database.sessions.find(
      (entry) =>
        entry.token === context.token && entry.userId === context.userId,
    )
    if (!session) unauthorized('invalid')
    if (Date.parse(session.expiresAt) <= Date.now()) unauthorized('expired')
    if (!database.users.some((entry) => entry.profile.id === context.userId))
      unauthorized('invalid')
  } else if (requireUser) unauthorized('missing')
}

export function contextFrom(
  database: AccountDatabase,
  cookies: Record<string, string | undefined>,
  guestId?: string,
): CommerceContext {
  if (cookies.nft_session) {
    const session = database.sessions.find(
      (entry) => entry.token === cookies.nft_session,
    )
    if (!session) unauthorized('invalid')
    const context = { userId: session.userId, token: session.token }
    authorize(database, context)
    return context
  }
  return { userId: null, guestId: cookies.nft_cart || guestId }
}

export function cartFor(
  database: AccountDatabase,
  context: CommerceContext,
): Cart {
  authorize(database, context)
  const state = commerce(database)
  if (
    !context.userId &&
    (!context.guestId || state.retiredGuestIds.includes(context.guestId))
  )
    stale('cart-changed')
  const key = context.userId
    ? `user:${context.userId}`
    : `guest:${context.guestId}`
  return (state.carts[key] ??= {
    id: crypto.randomUUID(),
    userId: context.userId,
    items: [],
    couponCode: null,
    adjustments: [],
    version: 1,
  })
}

export function cartDto(database: AccountDatabase, cart: Cart): Cart {
  const state = commerce(database)
  return {
    ...cart,
    items: cart.items.map((item) => ({
      ...item,
      nft: state.catalog.find((nft) => nft.id === item.nftId)!,
    })),
  }
}

function cartAllocation(record: OrderRecord): Record<string, number> {
  return (record.remainingCartQuantities ??= Object.fromEntries(
    record.order.snapshot.items.map((item) => [item.cartItemId, item.quantity]),
  ))
}

/** Cart units are removed from the existing prefix before later additions. */
function reducePendingCartAllocations(
  database: AccountDatabase,
  cartId: string,
  itemId: string,
  removedQuantity: number,
  excludeOrderId?: string,
) {
  if (removedQuantity <= 0) return
  for (const record of commerce(database).orders) {
    if (
      record.order.status !== 'pending' ||
      record.cartId !== cartId ||
      record.order.id === excludeOrderId
    )
      continue
    const allocation = cartAllocation(record)
    const remaining = allocation[itemId]
    if (remaining !== undefined)
      allocation[itemId] = Math.max(0, remaining - removedQuantity)
  }
}

export function mergeGuestCart(
  database: AccountDatabase,
  userId: string,
  guestId?: string,
) {
  if (!guestId) return
  const state = commerce(database)
  const guest = state.carts[`guest:${guestId}`]
  if (state.retiredGuestIds.includes(guestId)) return
  state.retiredGuestIds.push(guestId)
  if (!guest) return
  const key = `user:${userId}`
  const target = (state.carts[key] ??= {
    id: crypto.randomUUID(),
    userId,
    items: [],
    couponCode: null,
    adjustments: [],
    version: 1,
  })
  const adjustments: Cart['adjustments'] = [...target.adjustments]
  for (const item of guest.items) {
    const nft = state.catalog.find((entry) => entry.id === item.nftId)
    const available =
      nft?.editions.find((entry) => entry.id === item.editionId)?.available ?? 0
    const existing = target.items.find(
      (entry) =>
        entry.nftId === item.nftId && entry.editionId === item.editionId,
    )
    const requestedQuantity = (existing?.quantity || 0) + item.quantity
    const acceptedQuantity = Math.min(requestedQuantity, available)
    if (requestedQuantity > acceptedQuantity)
      adjustments.push({
        nftId: item.nftId,
        editionId: item.editionId,
        requestedQuantity,
        acceptedQuantity,
        reason: available ? 'stock-limited' : 'unavailable',
      })
    if (existing) {
      reducePendingCartAllocations(
        database,
        target.id,
        existing.id,
        existing.quantity - acceptedQuantity,
      )
      existing.quantity = acceptedQuantity
    } else if (acceptedQuantity && nft)
      target.items.push({
        ...item,
        id: crypto.randomUUID(),
        nft,
        quantity: acceptedQuantity,
      })
  }
  target.items = target.items.filter((item) => item.quantity > 0)
  target.couponCode ||= guest.couponCode
  target.adjustments = adjustments
  target.version += 1
  delete state.carts[`guest:${guestId}`]
}

function quantity(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1)
    invalid({ quantity: 'Informe uma quantidade inteira maior que zero.' })
  return value
}

export function editionFor(
  database: AccountDatabase,
  nftId: string,
  editionId: string,
) {
  const nft = commerce(database).catalog.find((entry) => entry.id === nftId)
  const edition = nft?.editions.find((entry) => entry.id === editionId)
  if (!nft || !edition)
    throw new ApiFault(404, {
      code: 'not-found',
      resource: 'edition',
      message: 'NFT ou edição não encontrado.',
    })
  return { nft, edition }
}

function checkStock(
  nftId: string,
  editionId: string,
  requested: number,
  available: number,
) {
  if (requested > available)
    throw new ApiFault(409, {
      code: 'availability-conflict',
      nftId,
      editionId,
      available,
      message: `A edição possui ${available} unidades disponíveis. Ajuste a quantidade.`,
    })
}

export function addItem(
  database: AccountDatabase,
  context: CommerceContext,
  input: Record<string, unknown>,
): Cart {
  const cart = cartFor(database, context)
  const nftId = text(input, 'nftId'),
    editionId = text(input, 'editionId'),
    amount = quantity(input.quantity)
  const { nft, edition } = editionFor(database, nftId, editionId)
  const existing = cart.items.find(
    (entry) => entry.nftId === nftId && entry.editionId === editionId,
  )
  const total = (existing?.quantity || 0) + amount
  checkStock(nftId, editionId, total, edition.available)
  if (existing) existing.quantity = total
  else
    cart.items.push({
      id: crypto.randomUUID(),
      nftId,
      editionId,
      quantity: amount,
      nft,
    })
  cart.adjustments = []
  cart.version += 1
  return cartDto(database, cart)
}

export function updateItem(
  database: AccountDatabase,
  context: CommerceContext,
  itemId: string,
  value: unknown,
): Cart {
  const cart = cartFor(database, context)
  const item = cart.items.find((entry) => entry.id === itemId)
  if (!item)
    throw new ApiFault(404, {
      code: 'not-found',
      resource: 'cart-item',
      message: 'Item não encontrado no carrinho.',
    })
  const amount = quantity(value)
  const { edition } = editionFor(database, item.nftId, item.editionId)
  checkStock(item.nftId, item.editionId, amount, edition.available)
  reducePendingCartAllocations(
    database,
    cart.id,
    item.id,
    item.quantity - amount,
  )
  item.quantity = amount
  cart.adjustments = []
  cart.version += 1
  return cartDto(database, cart)
}

export function removeItem(
  database: AccountDatabase,
  context: CommerceContext,
  itemId: string,
): Cart {
  const cart = cartFor(database, context)
  if (
    !cart.items.some((entry) => entry.id === itemId) &&
    !cart.adjustments.length
  )
    return cartDto(database, cart)
  const removed = cart.items.find((entry) => entry.id === itemId)
  if (removed)
    reducePendingCartAllocations(database, cart.id, itemId, removed.quantity)
  cart.items = cart.items.filter((entry) => entry.id !== itemId)
  cart.adjustments = []
  cart.version += 1
  return cartDto(database, cart)
}

export function validateCoupon(state: CommerceState, code: string | null) {
  if (!code) return
  if (code === 'EXPIRED' || state.expiredCoupons.includes(code))
    throw new ApiFault(422, {
      code: 'coupon-expired',
      message: 'Este cupom expirou. Remova-o ou use outro código.',
    })
  if (code !== 'KURIO10')
    throw new ApiFault(422, {
      code: 'coupon-invalid',
      message: 'Código promocional inválido.',
    })
}

export function applyCoupon(
  database: AccountDatabase,
  context: CommerceContext,
  value: unknown,
): Cart {
  if (value !== null && typeof value !== 'string')
    invalid({ couponCode: 'Informe um código ou remova o cupom.' })
  const cart = cartFor(database, context)
  const code = typeof value === 'string' ? value.trim().toUpperCase() : null
  validateCoupon(commerce(database), code)
  cart.couponCode = code || null
  cart.adjustments = []
  cart.version += 1
  return cartDto(database, cart)
}

export function validNetwork(value: unknown): WalletNetwork {
  if (value !== 'ethereum' && value !== 'sepolia')
    invalid({ network: 'Escolha uma rede disponível.' })
  return value
}

export function stale(
  reason: 'expired' | 'cart-changed' | 'price-changed' | 'fee-changed',
): never {
  throw new ApiFault(409, {
    code: 'quote-stale',
    reason,
    message:
      'Os valores ou a disponibilidade mudaram. Revise a compra novamente.',
  })
}

export function createQuote(
  database: AccountDatabase,
  context: CommerceContext,
  input: Record<string, unknown>,
  now = Date.now(),
): Quote {
  const cart = cartFor(database, context)
  const state = commerce(database)
  const network = validNetwork(input.network)
  if (
    typeof input.cartVersion !== 'number' ||
    !Number.isSafeInteger(input.cartVersion) ||
    input.cartVersion < 1
  )
    invalid({ cartVersion: 'Envie a versão atual do carrinho.' })
  if (input.cartVersion !== cart.version) stale('cart-changed')
  if (!cart.items.length)
    invalid({ cart: 'Adicione um NFT ao carrinho antes de continuar.' })
  validateCoupon(state, cart.couponCode)
  const items = cart.items.map((item) => {
    const { nft, edition } = editionFor(database, item.nftId, item.editionId)
    checkStock(item.nftId, item.editionId, item.quantity, edition.available)
    return {
      cartItemId: item.id,
      nftId: item.nftId,
      editionId: item.editionId,
      nftVersion: nft.version,
      quantity: item.quantity,
      unitPriceEth: edition.priceEth,
      lineTotalEth: ethFromWei(
        parseEth(edition.priceEth) * BigInt(item.quantity),
      ),
    }
  })
  const subtotal = items.reduce(
    (sum, item) => sum + parseEth(item.lineTotalEth),
    0n,
  )
  const discount = cart.couponCode ? subtotal / 10n : 0n
  const quote: Quote = {
    id: crypto.randomUUID(),
    version: 1,
    cartId: cart.id,
    cartVersion: cart.version,
    items,
    couponCode: cart.couponCode,
    network,
    expiresAt: new Date(now + 60_000).toISOString(),
    subtotalEth: ethFromWei(subtotal),
    discountEth: ethFromWei(discount),
    networkFeeEth: state.fees[network],
    totalEth: ethFromWei(subtotal - discount + parseEth(state.fees[network])),
  }
  state.quotes.push({ quote })
  return quote
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
      .join(',')}}`
  return JSON.stringify(value)
}

function checkoutCollector(raw: unknown): CheckoutCollector {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    invalid({ collector: 'Informe os dados do colecionador.' })
  const body = raw as Record<string, unknown>
  const input: CheckoutCollector = {
    name: text(body, 'name'),
    email: text(body, 'email'),
    username: text(body, 'username'),
    profileName: text(body, 'profileName'),
    ensName: text(body, 'ensName'),
    referralCode: text(body, 'referralCode'),
    secondaryAddress: text(body, 'secondaryAddress'),
    notes: text(body, 'notes'),
  }
  const fields: Record<string, string> = {}
  if (input.name.length < 2 || input.name.length > 80)
    fields.name = 'Informe um nome de 2 a 80 caracteres.'
  if (!validEmail(input.email)) fields.email = 'Informe um e-mail válido.'
  if (!validUsername(input.username))
    fields.username = 'Informe um nome de usuário válido.'
  if (!validEns(input.ensName)) fields.ensName = 'Informe um nome ENS válido.'
  for (const field of ['profileName', 'referralCode'] as const)
    if (input[field].length < 2 || input[field].length > 80)
      fields[field] = 'Use entre 2 e 80 caracteres.'
  if (input.notes.length > 500) fields.notes = 'Use até 500 caracteres.'
  if (
    input.secondaryAddress &&
    !validEns(input.secondaryAddress) &&
    !/^0x[0-9a-f]{40}$/i.test(input.secondaryAddress)
  )
    fields.secondaryAddress = 'Informe um endereço 0x ou ENS válido.'
  if (Object.keys(fields).length) invalid(fields)
  return input
}

export function settleOrder(
  database: AccountDatabase,
  record: OrderRecord,
  now = Date.now(),
  force = false,
): Order {
  const order = record.order
  if (
    order.status !== 'pending' ||
    (!force && (record.settleAt === null || now < record.settleAt))
  )
    return order
  const state = commerce(database)
  const connection = database.connections.find(
    (entry) =>
      entry.id === record.walletConnectionId &&
      entry.userId === order.userId &&
      entry.sessionToken === record.sessionToken &&
      entry.status === 'connected' &&
      Date.parse(entry.expiresAt) > now,
  )
  const missingStock = order.snapshot.items.some(
    (item) =>
      (state.catalog
        .find((nft) => nft.id === item.nftId)
        ?.editions.find((edition) => edition.id === item.editionId)
        ?.available || 0) < item.quantity,
  )
  const timestamp = new Date(now).toISOString()
  if (record.declined || !connection || missingStock) {
    record.order = {
      ...order,
      version: order.version + 1,
      updatedAt: timestamp,
      status: 'declined',
      declinedAt: timestamp,
      reason: record.declined
        ? 'payment-declined'
        : !connection
          ? 'wallet-disconnected'
          : 'availability-changed',
      message: record.declined
        ? 'O pagamento foi recusado na simulação. Seu carrinho foi preservado.'
        : !connection
          ? 'A carteira foi desconectada. Seu carrinho foi preservado.'
          : 'A edição ficou indisponível. Seu carrinho foi preservado.',
    }
    return record.order
  }
  for (const item of order.snapshot.items) {
    const { nft, edition } = editionFor(database, item.nftId, item.editionId)
    edition.available -= item.quantity
    nft.version += 1
  }
  const cart = Object.values(state.carts).find(
    (entry) => entry.id === record.cartId && entry.userId === order.userId,
  )
  if (cart) {
    const allocation = cartAllocation(record)
    for (const bought of order.snapshot.items) {
      const item = cart.items.find(
        (entry) =>
          entry.id === bought.cartItemId &&
          entry.nftId === bought.nftId &&
          entry.editionId === bought.editionId,
      )
      if (item) {
        const removedQuantity = Math.min(
          item.quantity,
          allocation[bought.cartItemId] ?? 0,
        )
        item.quantity -= removedQuantity
        reducePendingCartAllocations(
          database,
          cart.id,
          item.id,
          removedQuantity,
          order.id,
        )
      }
      allocation[bought.cartItemId] = 0
    }
    cart.items = cart.items.filter((item) => item.quantity > 0)
    cart.version += 1
  }
  record.order = {
    ...order,
    version: order.version + 1,
    updatedAt: timestamp,
    status: 'confirmed',
    confirmedAt: timestamp,
    transactionReference: `sim-${order.id}`,
    simulatedExplorerUrl: `/orders/${encodeURIComponent(order.id)}#transacao-simulada`,
  }
  return record.order
}

export function createOrder(
  database: AccountDatabase,
  context: CommerceContext,
  body: Record<string, unknown>,
  key: string,
  mode:
    | 'default'
    | 'payment-declined'
    | 'order-timeout'
    | 'pending'
    | 'offline-orders',
  now = Date.now(),
): { order: Order; created: boolean } {
  authorize(database, context, true)
  if (!/^[a-zA-Z0-9_-]{1,160}$/.test(key))
    invalid({ idempotencyKey: 'Envie uma chave de idempotência válida.' })
  const state = commerce(database)
  const contents = canonical(body)
  const existing = state.idempotency.find(
    (entry) => entry.userId === context.userId && entry.key === key,
  )
  if (existing) {
    if (existing.canonical !== contents)
      throw new ApiFault(409, {
        code: 'idempotency-conflict',
        message: 'Esta tentativa já foi usada com outro conteúdo.',
      })
    const record = state.orders.find(
      (entry) => entry.order.id === existing.orderId,
    )!
    return { order: settleOrder(database, record, now), created: false }
  }
  const missingFields: Record<string, string> = {}
  for (const field of ['quoteId', 'walletId', 'walletConnectionId']) {
    if (
      typeof body[field] !== 'string' ||
      !body[field] ||
      body[field].length > 160
    )
      missingFields[field] = 'Informe um identificador válido.'
  }
  if (
    typeof body.quoteVersion !== 'number' ||
    !Number.isSafeInteger(body.quoteVersion) ||
    body.quoteVersion < 1
  )
    missingFields.quoteVersion = 'Informe a versão da cotação.'
  if (Object.keys(missingFields).length) invalid(missingFields)
  const cart = cartFor(database, context)
  const quoteRecord = state.quotes.find(
    (entry) =>
      entry.quote.id === body.quoteId && entry.quote.cartId === cart.id,
  )
  if (
    !quoteRecord ||
    quoteRecord.usedByOrderId ||
    quoteRecord.quote.cartVersion !== cart.version
  )
    stale('cart-changed')
  const quote = quoteRecord.quote
  if (quote.version !== body.quoteVersion || Date.parse(quote.expiresAt) <= now)
    stale('expired')
  if (validNetwork(body.network) !== quote.network) stale('fee-changed')
  validateCoupon(state, quote.couponCode)
  if (cart.couponCode !== quote.couponCode) stale('cart-changed')
  if (parseEth(quote.networkFeeEth) !== parseEth(state.fees[quote.network]))
    stale('fee-changed')
  for (const item of quote.items) {
    const { nft, edition } = editionFor(database, item.nftId, item.editionId)
    checkStock(item.nftId, item.editionId, item.quantity, edition.available)
    if (
      nft.version !== item.nftVersion ||
      parseEth(edition.priceEth) !== parseEth(item.unitPriceEth)
    )
      stale('price-changed')
  }
  const account = database.users.find(
    (entry) => entry.profile.id === context.userId,
  )!
  const wallet = account.wallets.find((entry) => entry.id === body.walletId)
  if (!wallet)
    throw new ApiFault(404, {
      code: 'not-found',
      resource: 'wallet',
      message: 'Carteira não encontrada.',
    })
  if (wallet.network !== quote.network)
    throw new ApiFault(422, {
      code: 'network-mismatch',
      message: 'A rede não corresponde à carteira.',
    })
  const connection = database.connections.find(
    (entry) =>
      entry.id === body.walletConnectionId &&
      entry.walletId === wallet.id &&
      entry.userId === context.userId &&
      entry.sessionToken === context.token &&
      entry.network === quote.network &&
      entry.status === 'connected' &&
      Date.parse(entry.expiresAt) > now,
  )
  if (!connection)
    throw new ApiFault(400, {
      code: 'wallet-disconnected',
      message: 'Conecte sua carteira novamente antes de confirmar.',
    })
  const collector = checkoutCollector(body.collector)
  const timestamp = new Date(now).toISOString()
  const id = crypto.randomUUID()
  const order: Order = {
    id,
    userId: context.userId!,
    idempotencyKey: key,
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    status: 'pending',
    snapshot: {
      items: quote.items.map((item) => {
        const { nft, edition } = editionFor(
          database,
          item.nftId,
          item.editionId,
        )
        return {
          cartItemId: item.cartItemId,
          nftId: item.nftId,
          editionId: item.editionId,
          name: nft.name,
          editionLabel: edition.label,
          image: structuredClone(nft.image),
          quantity: item.quantity,
          unitPriceEth: item.unitPriceEth,
          lineTotalEth: item.lineTotalEth,
        }
      }),
      collector,
      wallet: {
        id: wallet.id,
        label: wallet.label,
        address: wallet.address,
        network: wallet.network,
      },
      couponCode: quote.couponCode,
      quoteId: quote.id,
      createdAt: timestamp,
      subtotalEth: quote.subtotalEth,
      discountEth: quote.discountEth,
      networkFeeEth: quote.networkFeeEth,
      totalEth: quote.totalEth,
    },
  }
  state.orders.push({
    order,
    cartId: cart.id,
    walletConnectionId: connection.id,
    sessionToken: context.token!,
    settleAt: mode === 'pending' ? null : now + 900,
    declined: mode === 'payment-declined',
    remainingCartQuantities: Object.fromEntries(
      quote.items.map((item) => [item.cartItemId, item.quantity]),
    ),
  })
  state.idempotency.push({
    userId: context.userId!,
    key,
    canonical: contents,
    orderId: id,
  })
  quoteRecord.usedByOrderId = id
  return { order, created: true }
}

export function ownedOrder(
  database: AccountDatabase,
  context: CommerceContext,
  id: string,
) {
  authorize(database, context, true)
  const record = commerce(database).orders.find(
    (entry) => entry.order.id === id && entry.order.userId === context.userId,
  )
  if (!record)
    throw new ApiFault(404, {
      code: 'not-found',
      resource: 'order',
      message: 'Pedido não encontrado.',
    })
  return record
}
