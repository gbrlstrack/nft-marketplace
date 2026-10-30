import assert from 'node:assert/strict'
import test from 'node:test'
import type { AccountDatabase } from '../../src/mocks/account/database.ts'
import type { CreateOrderRequest } from '../../src/contracts/index.ts'
import {
  addItem,
  applyCoupon,
  cartDto,
  cartFor,
  commerce,
  createOrder,
  createQuote,
  mergeGuestCart,
  ownedOrder,
  removeItem,
  settleOrder,
  updateItem,
  type CommerceContext,
} from '../../src/mocks/commerce/model.ts'
import { ApiFault } from '../../src/mocks/account/validation.ts'

function fixture() {
  const now = Date.now()
  const users = ['maya', 'theo'].map((id, index) => ({
    profile: {
      id,
      name: id === 'maya' ? 'Maya Silva' : 'Theo Costa',
      email: `${id}@kurio.test`,
      username: id,
      ensName: `${id}.eth`,
      walletAlias: `Carteira ${id}`,
      bio: '',
      avatar: null,
      version: 1,
    },
    password: { salt: 'test-only', hash: 'test-only' },
    favorites: { nftIds: [], version: 1 },
    wallets: [
      {
        id: `wallet-${id}`,
        label: `Carteira ${id}`,
        displayName: id,
        profileName: id,
        provider: 'metamask' as const,
        email: `${id}@kurio.test`,
        ensName: `${id}.eth`,
        referralCode: 'KURIO',
        secondaryAddress: '',
        address: `0x${String(index + 1).repeat(40)}`,
        network: 'ethereum' as const,
        role: 'primary' as const,
        version: 1,
      },
    ],
  }))
  const database: AccountDatabase = {
    version: 1,
    users,
    sessions: users.map(({ profile }) => ({
      token: `token-${profile.id}`,
      userId: profile.id,
      expiresAt: new Date(now + 60 * 60_000).toISOString(),
    })),
    connections: users.map(({ profile }) => ({
      id: `connection-${profile.id}`,
      walletId: `wallet-${profile.id}`,
      userId: profile.id,
      sessionToken: `token-${profile.id}`,
      network: 'ethereum',
      status: 'connected',
      expiresAt: new Date(now + 5 * 60_000).toISOString(),
    })),
  }
  const context: CommerceContext = { userId: 'maya', token: 'token-maya' }
  return { database, context, now }
}

function request(
  database: AccountDatabase,
  context: CommerceContext,
  now: number,
): CreateOrderRequest {
  const cart = cartFor(database, context)
  const quote = createQuote(
    database,
    context,
    { cartVersion: cart.version, network: 'ethereum' },
    now,
  )
  return {
    quoteId: quote.id,
    quoteVersion: quote.version,
    network: 'ethereum',
    walletId: `wallet-${context.userId}`,
    walletConnectionId: `connection-${context.userId}`,
    collector: {
      name: 'Colecionadora Maya',
      email: 'maya@kurio.test',
      username: 'maya',
      profileName: 'maya',
      ensName: 'maya.eth',
      referralCode: 'KURIO',
      notes: '',
      secondaryAddress: '',
    },
  }
}

function raw(value: CreateOrderRequest): Record<string, unknown> {
  return value as unknown as Record<string, unknown>
}
function fault(code: string, reason?: string) {
  return (error: unknown) =>
    error instanceof ApiFault &&
    error.detail.code === code &&
    (!reason || ('reason' in error.detail && error.detail.reason === reason))
}

test('cotação mantém um wei, desconto floor e soma exata; mutation inválida não altera itens', () => {
  const { database, context } = fixture()
  const cart = addItem(database, context, {
    nftId: 'nft-001',
    editionId: 'nft-001-standard',
    quantity: 2,
  })
  applyCoupon(database, context, 'kurio10')
  const quote = createQuote(database, context, {
    cartVersion: cartFor(database, context).version,
    network: 'ethereum',
  })
  assert.equal(quote.subtotalEth, '0.250000000000000002')
  assert.equal(quote.discountEth, '0.025')
  assert.equal(quote.totalEth, '0.241000000000000002')
  const before = structuredClone(cartFor(database, context))
  assert.throws(
    () =>
      addItem(database, context, {
        nftId: 'nft-001',
        editionId: 'nft-001-standard',
        quantity: 3,
      }),
    fault('availability-conflict'),
  )
  assert.deepEqual(cartFor(database, context), before)
  assert.throws(
    () => updateItem(database, context, cart.items[0].id, 1.5),
    fault('validation'),
  )
  assert.throws(
    () => applyCoupon(database, context, 'EXPIRED'),
    fault('coupon-expired'),
  )
  assert.equal(cartFor(database, context).couponCode, 'KURIO10')
  const version = cartFor(database, context).version
  removeItem(database, context, 'absent')
  assert.equal(cartFor(database, context).version, version)
})

test('fusão soma quantidades, limita stock e conserva ajustes até alteração explícita', () => {
  const { database, context } = fixture()
  const guest: CommerceContext = { userId: null, guestId: 'guest-1' }
  addItem(database, context, {
    nftId: 'nft-001',
    editionId: 'nft-001-standard',
    quantity: 3,
  })
  addItem(database, guest, {
    nftId: 'nft-001',
    editionId: 'nft-001-standard',
    quantity: 3,
  })
  mergeGuestCart(database, 'maya', 'guest-1')
  const cart = cartFor(database, context)
  assert.equal(cart.items[0].quantity, 4)
  assert.deepEqual(cart.adjustments, [
    {
      nftId: 'nft-001',
      editionId: 'nft-001-standard',
      requestedQuantity: 6,
      acceptedQuantity: 4,
      reason: 'stock-limited',
    },
  ])
  assert.deepEqual(cartDto(database, cart).adjustments, cart.adjustments)
  assert.deepEqual(cartDto(database, cart).adjustments, cart.adjustments)
  assert.throws(
    () => cartFor(database, guest),
    fault('quote-stale', 'cart-changed'),
  )
  mergeGuestCart(database, 'maya', 'guest-1')
  assert.equal(cart.items[0].quantity, 4)
  updateItem(database, context, cart.items[0].id, 2)
  assert.deepEqual(cart.adjustments, [])
  assert.equal(
    cartFor(database, { userId: 'theo', token: 'token-theo' }).items.length,
    0,
  )
})

test('pedido idempotente recupera snapshot antigo e confirmação remove apenas quantidades compradas uma vez', () => {
  const { database, context, now } = fixture()
  addItem(database, context, {
    nftId: 'nft-001',
    editionId: 'nft-001-standard',
    quantity: 1,
  })
  const body = request(database, context, now)
  const first = createOrder(
    database,
    context,
    raw(body),
    'attempt-1',
    'pending',
    now,
  )
  assert.equal(first.created, true)
  assert.equal(first.order.status, 'pending')
  const snapshot = structuredClone(first.order.snapshot)
  const original = commerce(database).catalog.find(
    (nft) => nft.id === 'nft-001',
  )!
  original.name = 'Nome posterior'
  original.editions[0].priceEth = '9.5'
  original.version += 1
  addItem(database, context, {
    nftId: 'nft-001',
    editionId: 'nft-001-standard',
    quantity: 1,
  })
  addItem(database, context, {
    nftId: 'nft-002',
    editionId: 'nft-002-standard',
    quantity: 1,
  })
  const replay = createOrder(
    database,
    context,
    raw(body),
    'attempt-1',
    'default',
    now + 120_000,
  )
  assert.equal(replay.created, false)
  assert.equal(replay.order.id, first.order.id)
  assert.deepEqual(replay.order.snapshot, snapshot)
  assert.throws(
    () =>
      createOrder(
        database,
        context,
        { ...raw(body), collector: { ...body.collector, notes: 'Different' } },
        'attempt-1',
        'default',
        now,
      ),
    fault('idempotency-conflict'),
  )
  const record = ownedOrder(database, context, first.order.id)
  const confirmed = settleOrder(database, record, now + 2_000, true)
  assert.equal(confirmed.status, 'confirmed')
  assert.deepEqual(confirmed.snapshot, snapshot)
  assert.equal(original.editions[0].available, 3)
  assert.deepEqual(
    cartFor(database, context).items.map((item) => [item.nftId, item.quantity]),
    [
      ['nft-001', 1],
      ['nft-002', 1],
    ],
  )
  assert.equal(
    settleOrder(database, record, now + 3_000, true).status,
    'confirmed',
  )
  assert.equal(original.editions[0].available, 3)
  assert.equal(commerce(database).orders.length, 1)
  assert.throws(
    () =>
      ownedOrder(
        database,
        { userId: 'theo', token: 'token-theo' },
        first.order.id,
      ),
    fault('not-found'),
  )
})

test('revalidação rejeita taxas menores, preço/versão, cupom expirado e cotação consumida', () => {
  const { database, context, now } = fixture()
  addItem(database, context, {
    nftId: 'nft-001',
    editionId: 'nft-001-standard',
    quantity: 1,
  })
  applyCoupon(database, context, 'KURIO10')
  const body = request(database, context, now)
  const state = commerce(database)
  state.fees.ethereum = '0.001'
  assert.throws(
    () =>
      createOrder(database, context, raw(body), 'lower-fee', 'default', now),
    fault('quote-stale', 'fee-changed'),
  )
  state.fees.ethereum = '0.016'
  state.expiredCoupons.push('KURIO10')
  assert.throws(
    () =>
      createOrder(
        database,
        context,
        raw(body),
        'coupon-expired',
        'default',
        now,
      ),
    fault('coupon-expired'),
  )
  state.expiredCoupons = []
  state.catalog[0].version += 1
  assert.throws(
    () =>
      createOrder(database, context, raw(body), 'new-version', 'default', now),
    fault('quote-stale', 'price-changed'),
  )
  const updated = request(database, context, now)
  createOrder(database, context, raw(updated), 'accepted', 'pending', now)
  assert.throws(
    () =>
      createOrder(
        database,
        context,
        raw(updated),
        'duplicate-quote',
        'pending',
        now,
      ),
    fault('quote-stale', 'cart-changed'),
  )
  assert.equal(state.orders.length, 1)
})

test('recusa, carteira revogada e stock esgotado preservam carrinho e são terminais', () => {
  for (const reason of [
    'payment-declined',
    'wallet-disconnected',
    'availability-changed',
  ] as const) {
    const { database, context, now } = fixture()
    addItem(database, context, {
      nftId: 'nft-001',
      editionId: 'nft-001-standard',
      quantity: 1,
    })
    const body = request(database, context, now)
    const { order } = createOrder(
      database,
      context,
      raw(body),
      reason,
      reason === 'payment-declined' ? reason : 'pending',
      now,
    )
    if (reason === 'wallet-disconnected') database.connections = []
    if (reason === 'availability-changed')
      commerce(database).catalog[0].editions[0].available = 0
    const record = ownedOrder(database, context, order.id)
    const declined = settleOrder(database, record, now + 2_000, true)
    assert.equal(declined.status, 'declined')
    if (declined.status === 'declined') assert.equal(declined.reason, reason)
    assert.equal(cartFor(database, context).items[0].quantity, 1)
    assert.equal(
      settleOrder(database, record, now + 3_000, true).version,
      declined.version,
    )
  }
})

test('reduzir e depois acrescentar durante pedido pendente preserva as unidades novas e o snapshot comprado', () => {
  for (const legacy of [false, true]) {
    const { database, context, now } = fixture()
    const cart = addItem(database, context, {
      nftId: 'nft-001',
      editionId: 'nft-001-standard',
      quantity: 2,
    })
    const { order } = createOrder(
      database,
      context,
      raw(request(database, context, now)),
      `reduce-add-${legacy}`,
      'pending',
      now,
    )
    const record = ownedOrder(database, context, order.id)
    if (legacy) delete record.remainingCartQuantities
    const snapshot = structuredClone(order.snapshot)
    updateItem(database, context, cart.items[0].id, 1)
    addItem(database, context, {
      nftId: 'nft-001',
      editionId: 'nft-001-standard',
      quantity: 1,
    })
    assert.equal(cartFor(database, context).items[0].quantity, 2)
    const confirmed = settleOrder(database, record, now + 2_000, true)
    assert.equal(confirmed.status, 'confirmed')
    assert.equal(cartFor(database, context).items[0].quantity, 1)
    assert.deepEqual(confirmed.snapshot, snapshot)
    assert.equal(confirmed.snapshot.items[0].quantity, 2)
    assert.equal(commerce(database).catalog[0].editions[0].available, 2)
    settleOrder(database, record, now + 3_000, true)
    assert.equal(cartFor(database, context).items[0].quantity, 1)
  }
})

test('confirmar pedidos sobrepostos não consome as unidades acrescentadas após ambos', () => {
  const { database, context, now } = fixture()
  addItem(database, context, {
    nftId: 'nft-001',
    editionId: 'nft-001-standard',
    quantity: 2,
  })
  const first = createOrder(
    database,
    context,
    raw(request(database, context, now)),
    'overlap-first',
    'pending',
    now,
  ).order
  const second = createOrder(
    database,
    context,
    raw(request(database, context, now)),
    'overlap-second',
    'pending',
    now,
  ).order
  addItem(database, context, {
    nftId: 'nft-001',
    editionId: 'nft-001-standard',
    quantity: 1,
  })
  assert.equal(
    settleOrder(
      database,
      ownedOrder(database, context, first.id),
      now + 2_000,
      true,
    ).status,
    'confirmed',
  )
  assert.equal(cartFor(database, context).items[0].quantity, 1)
  assert.equal(
    settleOrder(
      database,
      ownedOrder(database, context, second.id),
      now + 3_000,
      true,
    ).status,
    'confirmed',
  )
  assert.equal(cartFor(database, context).items[0].quantity, 1)
  assert.equal(commerce(database).catalog[0].editions[0].available, 0)
})

test('redução de estoque durante fusão atualiza alocação sem alterar a quantidade comprada', () => {
  const { database, context, now } = fixture()
  addItem(database, context, {
    nftId: 'nft-001',
    editionId: 'nft-001-standard',
    quantity: 3,
  })
  addItem(
    database,
    { userId: null, guestId: 'merge-pending' },
    { nftId: 'nft-001', editionId: 'nft-001-standard', quantity: 1 },
  )
  const { order } = createOrder(
    database,
    context,
    raw(request(database, context, now)),
    'merge-pending',
    'pending',
    now,
  )
  const edition = commerce(database).catalog[0].editions[0]
  edition.available = 2
  mergeGuestCart(database, context.userId!, 'merge-pending')
  assert.equal(cartFor(database, context).items[0].quantity, 2)
  edition.available = 5
  addItem(database, context, {
    nftId: 'nft-001',
    editionId: 'nft-001-standard',
    quantity: 1,
  })
  const confirmed = settleOrder(
    database,
    ownedOrder(database, context, order.id),
    now + 2_000,
    true,
  )
  assert.equal(confirmed.status, 'confirmed')
  assert.equal(confirmed.snapshot.items[0].quantity, 3)
  assert.equal(edition.available, 2)
  assert.equal(cartFor(database, context).items[0].quantity, 1)
})
