import assert from 'node:assert/strict'
import test from 'node:test'
import type { Nft } from '../../src/contracts/index.ts'
import type { AccountDatabase } from '../../src/mocks/account/database.ts'
import {
  availablePrice,
  filterCatalog,
  parseCatalogListRequest,
} from '../../src/mocks/catalog-filters.ts'
import { nftFixtures } from '../../src/mocks/fixtures.ts'
import {
  addItem,
  commerce,
  createQuote,
} from '../../src/mocks/commerce/model.ts'

test('parâmetros de preço/rede validam strings ETH sem notação exponencial ou limites invertidos', () => {
  const parsed = parseCatalogListRequest(
    new URL(
      'http://localhost/api/nfts?network=polygon&minPrice=0.125000000000000001&maxPrice=1&page=2',
    ),
  )
  assert.ok(!('code' in parsed))
  assert.equal(parsed.network, 'polygon')
  assert.equal(parsed.minPrice, '0.125000000000000001')
  assert.equal(parsed.maxPrice, '1')
  assert.equal(parsed.page, 2)
  for (const query of [
    'network=bitcoin',
    'minPrice=1e-2',
    'minPrice=-1',
    'maxPrice=0.0000000000000000001',
    'minPrice=',
    'minPrice=2&maxPrice=1',
  ]) {
    const result = parseCatalogListRequest(
      new URL(`http://localhost/api/nfts?${query}`),
    )
    assert.ok('code' in result)
    assert.equal(result.code, 'validation')
  }
})

test('limites inclusivos conservam um wei e refletem a menor edição disponível', () => {
  const nft = structuredClone(nftFixtures[0])
  assert.equal(availablePrice(nft), 125000000000000001n)
  assert.equal(
    filterCatalog([nft], {
      minPrice: '0.125000000000000001',
      maxPrice: '0.125000000000000001',
    }).items.length,
    1,
  )
  assert.equal(filterCatalog([nft], { maxPrice: '0.125' }).items.length, 0)
  assert.equal(
    filterCatalog([nft], { minPrice: '0.125000000000000002' }).items.length,
    0,
  )
  nft.editions[0].available = 0
  assert.equal(availablePrice(nft), 480000000000000000n)
  assert.equal(
    filterCatalog([nft], { minPrice: '0.48', maxPrice: '0.48' }).items.length,
    1,
  )
  nft.editions[1].available = 0
  assert.equal(filterCatalog([nft], {}).items.length, 1)
  assert.equal(filterCatalog([nft], { minPrice: '0' }).items.length, 0)
})

test('rede, categoria, texto e preço compõem AND; contagens ignoram apenas sua própria dimensão', () => {
  const catalog: Nft[] = [
    ['a', 'art', 'ethereum', '0.2'],
    ['b', 'music', 'polygon', '0.3'],
    ['c', 'art', 'polygon', '0.4'],
    ['d', 'photography', 'solana', '0.2'],
  ].map(([id, category, network, price]) => ({
    ...structuredClone(nftFixtures[0]),
    id,
    name: `Peça ${id}`,
    category: category as Nft['category'],
    network: network as Nft['network'],
    collection: 'Coleção compartilhada',
    editions: [
      {
        id: `${id}-standard`,
        label: 'Edição aberta',
        available: 1,
        priceEth: price,
      },
    ],
  }))
  const result = filterCatalog(catalog, {
    q: 'PECA',
    collection: 'colecao compartilhada',
    category: 'art',
    network: 'polygon',
    minPrice: '0.25',
    maxPrice: '0.5',
  })
  assert.deepEqual(
    result.items.map((nft) => nft.id),
    ['c'],
  )
  assert.deepEqual(result.categoryCounts, { art: 1, photography: 0, music: 1 })
  assert.deepEqual(result.networkCounts, { ethereum: 0, polygon: 1, solana: 0 })
  const empty = filterCatalog(catalog, { q: 'inexistente' })
  assert.deepEqual(empty.items, [])
  assert.deepEqual(empty.categoryCounts, { art: 0, photography: 0, music: 0 })
  assert.deepEqual(empty.networkCounts, { ethereum: 0, polygon: 0, solana: 0 })
})

test('fixtures distribuem as três redes sem alterar identidade e migração aditiva conserva carrinho/cotação', () => {
  const counts = filterCatalog(nftFixtures, {}).networkCounts
  assert.deepEqual(counts, { ethereum: 9, polygon: 9, solana: 6 })
  for (const network of ['ethereum', 'polygon', 'solana'] as const)
    assert.deepEqual(
      new Set(
        nftFixtures
          .filter((nft) => nft.network === network)
          .map((nft) => nft.category),
      ),
      new Set(['art', 'photography', 'music']),
    )
  const database: AccountDatabase = {
    version: 1,
    users: [],
    sessions: [],
    connections: [],
  }
  const context = { userId: null, guestId: 'legacy-guest' }
  const cart = addItem(database, context, {
    nftId: 'nft-001',
    editionId: 'nft-001-standard',
    quantity: 2,
  })
  const quote = createQuote(database, context, {
    cartVersion: cart.version,
    network: 'ethereum',
  })
  const state = commerce(database)
  const cartState = () =>
    Object.values(state.carts).map((cart) => ({
      id: cart.id,
      userId: cart.userId,
      version: cart.version,
      couponCode: cart.couponCode,
      adjustments: cart.adjustments,
      items: cart.items.map((item) => ({
        id: item.id,
        nftId: item.nftId,
        editionId: item.editionId,
        quantity: item.quantity,
      })),
    }))
  const oldCart = structuredClone(cartState())
  const oldQuotes = structuredClone(state.quotes)
  const version = state.catalog[0].version
  delete state.catalog[0].network
  const migrated = commerce(database)
  assert.equal(migrated, state)
  assert.equal(migrated.catalog[0].network, 'ethereum')
  assert.equal(migrated.catalog[0].version, version + 1)
  assert.deepEqual(cartState(), oldCart)
  assert.deepEqual(migrated.quotes, oldQuotes)
  assert.equal(migrated.quotes[0].quote.id, quote.id)
  commerce(database)
  assert.equal(migrated.catalog[0].version, version + 1)
})
