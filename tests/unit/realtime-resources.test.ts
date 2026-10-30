import assert from 'node:assert/strict'
import test from 'node:test'
import type {
  Nft,
  NftUpdatedEvent,
  Order,
  OrderUpdatedEvent,
} from '../../src/contracts/index.ts'
import {
  ResourceLedger,
  validMarketplaceEvent,
} from '../../src/features/realtime/resources.ts'

const timestamp = '2026-10-30T00:00:00.000Z'
test('metadados de descoberta são opcionais em eventos legados e validados quando presentes', () => {
  assert.equal(validMarketplaceEvent(nftEvent(1)), true)
  for (const popularityScore of [0, 70, 100]) {
    const event = nftEvent(1)
    event.data.listedAt = timestamp
    event.data.popularityScore = popularityScore
    assert.equal(validMarketplaceEvent(event), true)
  }
  for (const data of [
    { listedAt: 'invalid' },
    { popularityScore: -1 },
    { popularityScore: 101 },
    { popularityScore: 1.5 },
    { popularityScore: '70' },
  ]) {
    const event = nftEvent(1)
    assert.equal(
      validMarketplaceEvent({ ...event, data: { ...event.data, ...data } }),
      false,
    )
  }
})

function nft(version: number, id = 'nft-1'): Nft {
  return {
    id,
    version,
    name: 'Obra de teste',
    description: 'Uma obra para verificar ordenação de eventos.',
    collection: 'Coleção',
    category: 'art',
    creator: { id: 'creator-1', name: 'Artista' },
    image: { src: '/artwork.svg', alt: 'Arte' },
    gallery: [{ src: '/artwork.svg', alt: 'Arte' }],
    editions: [
      {
        id: 'edition-1',
        label: 'Edição',
        priceEth: '0.125000000000000001',
        available: 2,
      },
    ],
  }
}
function nftEvent(
  version: number,
  eventId = `nft-event-${version}`,
  id = 'nft-1',
): NftUpdatedEvent {
  return {
    eventId,
    type: 'nft.updated',
    resourceId: id,
    version,
    occurredAt: timestamp,
    data: nft(version, id),
  }
}
function order(
  status: Order['status'],
  version: number,
  userId = 'maya',
): Order {
  const value = {
    id: 'order-1',
    userId,
    idempotencyKey: 'attempt-1',
    version,
    createdAt: timestamp,
    updatedAt: timestamp,
    snapshot: {
      items: [
        {
          cartItemId: 'cart-item-1',
          nftId: 'nft-1',
          editionId: 'edition-1',
          name: 'Obra',
          editionLabel: 'Edição',
          image: { src: '/artwork.svg', alt: 'Arte' },
          quantity: 1,
          unitPriceEth: '0.1',
          lineTotalEth: '0.1',
        },
      ],
      collector: {
        name: 'Maya',
        email: 'maya@example.test',
        username: 'maya',
        profileName: 'Maya',
        ensName: 'maya.eth',
        referralCode: 'KURIO',
        secondaryAddress: '',
        notes: '',
      },
      wallet: {
        id: 'wallet-1',
        label: 'Carteira',
        address: `0x${'1'.repeat(40)}`,
        network: 'ethereum' as const,
      },
      couponCode: null,
      quoteId: 'quote-1',
      createdAt: timestamp,
      subtotalEth: '0.1',
      discountEth: '0',
      networkFeeEth: '0.016',
      totalEth: '0.116',
    },
  }
  if (status === 'confirmed')
    return {
      ...value,
      status,
      confirmedAt: timestamp,
      transactionReference: 'sim-order-1',
      simulatedExplorerUrl: '/orders/order-1#transacao-simulada',
    }
  if (status === 'declined')
    return {
      ...value,
      status,
      declinedAt: timestamp,
      reason: 'payment-declined',
      message: 'Pagamento recusado.',
    }
  return { ...value, status }
}
function orderEvent(
  status: Order['status'],
  version: number,
  userId = 'maya',
): OrderUpdatedEvent {
  return {
    eventId: `order-event-${status}-${version}-${userId}`,
    type: 'order.updated',
    resourceId: 'order-1',
    version,
    userId,
    occurredAt: timestamp,
    data: order(status, version, userId),
  }
}

test('eventos rejeitam envelope incompatível, dados incompletos e valores fora do contrato', () => {
  assert.equal(validMarketplaceEvent(nftEvent(1)), true)
  assert.equal(validMarketplaceEvent(orderEvent('pending', 1)), true)
  assert.equal(validMarketplaceEvent(null), false)
  for (const change of [
    { resourceId: 'outro' },
    { version: 2 },
    { eventId: '' },
    { occurredAt: 'ontem' },
    { type: 'outro' },
  ]) {
    assert.equal(validMarketplaceEvent({ ...nftEvent(1), ...change }), false)
  }
  const malformed = nftEvent(1)
  malformed.data.editions[0].priceEth = '1e-2'
  assert.equal(validMarketplaceEvent(malformed), false)
  malformed.data.editions[0].priceEth = '0.1'
  malformed.data.editions[0].available = 1.5
  assert.equal(validMarketplaceEvent(malformed), false)
  assert.equal(
    validMarketplaceEvent({ ...orderEvent('pending', 1), userId: 'theo' }),
    false,
  )
  const confirmed = orderEvent('confirmed', 2)
  if (confirmed.data.status === 'confirmed')
    confirmed.data.simulatedExplorerUrl = 'https://example.test/real'
  assert.equal(validMarketplaceEvent(confirmed), false)
})

test('duplicatas e eventos antigos não regredem NFT; versões são independentes por identidade', () => {
  const ledger = new ResourceLedger()
  const recent = nftEvent(3)
  assert.equal(ledger.accept(recent, null), recent)
  assert.equal(ledger.accept(recent, null), null)
  assert.equal(ledger.accept(nftEvent(2), null), null)
  assert.equal(ledger.accept(nftEvent(3, 'same-version'), null), null)
  const other = nftEvent(1, 'other-nft', 'nft-2')
  assert.equal(ledger.accept(other, null), other)
  assert.equal(ledger.keepNft(nft(1)).version, 3)
  assert.equal(ledger.keepNft(nft(2, 'nft-2')).version, 2)
  assert.equal(ledger.keepNft(nft(5)).version, 5)
  assert.equal(ledger.accept(nftEvent(4), null), null)
})

test('evento privado ou enviado sob nome errado não contamina o recurso nem consome sua identidade', () => {
  const ledger = new ResourceLedger()
  const event = orderEvent('pending', 1)
  assert.equal(ledger.accept(event, null), null)
  assert.equal(ledger.accept(event, 'theo'), null)
  assert.equal(ledger.accept(event, 'maya', 'nft.updated'), null)
  assert.equal(ledger.accept(event, 'maya', 'order.updated'), event)
  assert.equal(ledger.keepOrder(order('pending', 1, 'theo')).userId, 'theo')
})

test('confirmação e recusa são terminais mesmo perante versão maior e respostas REST atrasadas', () => {
  for (const terminal of ['confirmed', 'declined'] as const) {
    const ledger = new ResourceLedger()
    ledger.keepOrder(order('pending', 1))
    const final = orderEvent(terminal, 2)
    assert.equal(ledger.accept(final, 'maya'), final)
    assert.equal(ledger.accept(orderEvent('pending', 99), 'maya'), null)
    const otherStatus = terminal === 'confirmed' ? 'declined' : 'confirmed'
    assert.equal(ledger.accept(orderEvent(otherStatus, 100), 'maya'), null)
    assert.equal(ledger.keepOrder(order('pending', 1)).status, terminal)
    assert.equal(ledger.keepOrder(order('pending', 101)).status, terminal)
  }
})

test('snapshot conhecido é imutável e ordem depende da versão, não do horário de entrega', () => {
  const ledger = new ResourceLedger()
  const pending = order('pending', 1)
  ledger.keepOrder(pending)
  const altered = orderEvent('confirmed', 2)
  altered.data = {
    ...altered.data,
    snapshot: { ...altered.data.snapshot, totalEth: '99' },
  }
  assert.equal(ledger.accept(altered, 'maya'), null)
  const final = orderEvent('confirmed', 2)
  final.occurredAt = '2026-10-29T00:00:00.000Z'
  assert.equal(ledger.accept(final, 'maya'), final)
  const newerRest = ledger.keepOrder({
    ...order('confirmed', 3),
    snapshot: { ...pending.snapshot, totalEth: '200' },
  })
  assert.equal(newerRest.snapshot.totalEth, '0.116')
})

test('limpar o ciclo privado elimina pedidos e IDs consumidos preservando as versões públicas', () => {
  const ledger = new ResourceLedger()
  ledger.accept(nftEvent(4), null)
  const event = orderEvent('confirmed', 2)
  ledger.accept(event, 'maya')
  ledger.clearPrivate()
  assert.equal(ledger.keepNft(nft(1)).version, 4)
  assert.equal(ledger.keepOrder(order('pending', 1)).status, 'pending')
  assert.equal(ledger.accept(event, 'maya'), event)
})
