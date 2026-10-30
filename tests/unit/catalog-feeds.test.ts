import assert from 'node:assert/strict'
import test from 'node:test'
import type { Nft } from '../../src/contracts/index.ts'
import type { AccountDatabase } from '../../src/mocks/account/database.ts'
import {
  filterCatalog,
  parseCatalogListRequest,
} from '../../src/mocks/catalog-filters.ts'
import { nftFixtures } from '../../src/mocks/fixtures.ts'
import { addItem, commerce } from '../../src/mocks/commerce/model.ts'

test('feed inválido é rejeitado e popular é default apenas quando Em alta não especifica sort', () => {
  for (const [query, expectedSort] of [
    ['', 'featured'],
    ['feed=new', 'featured'],
    ['feed=trending', 'popular'],
    ['feed=trending&sort=price-asc', 'price-asc'],
    ['feed=new&sort=popular', 'popular'],
  ]) {
    const parsed = parseCatalogListRequest(
      new URL(`http://localhost/api/nfts?${query}`),
    )
    assert.ok(!('code' in parsed))
    assert.equal(parsed.sort, expectedSort)
  }
  const invalid = parseCatalogListRequest(
    new URL('http://localhost/api/nfts?feed=unknown'),
  )
  assert.ok('code' in invalid)
  assert.equal(invalid.code, 'validation')
  assert.ok(invalid.fields?.feed)
})

test('janela de novos lançamentos inclui ambos os limites e exclui futuros, antigos e sem data', () => {
  const timestamps = [
    '2026-09-30T00:00:00.000Z',
    '2026-10-30T00:00:00.000Z',
    '2026-09-29T23:59:59.999Z',
    '2026-10-30T00:00:00.001Z',
    undefined,
  ]
  const catalog = timestamps.map((listedAt, index) => ({
    ...structuredClone(nftFixtures[0]),
    id: `date-${index}`,
    listedAt,
  }))
  const result = filterCatalog(catalog, { feed: 'new' })
  assert.deepEqual(
    result.items.map((nft) => nft.id),
    ['date-0', 'date-1'],
  )
  assert.equal(result.categoryCounts.art, 2)
  assert.equal(filterCatalog(catalog, {}).items.length, 5)
})

test('popularidade é inclusiva em 70 e feed compõe com preço/categoria/rede e suas contagens', () => {
  const catalog: Nft[] = [
    { ...structuredClone(nftFixtures[0]), id: 'high-art', popularityScore: 70 },
    { ...structuredClone(nftFixtures[0]), id: 'low-art', popularityScore: 69 },
    {
      ...structuredClone(nftFixtures[1]),
      id: 'high-photo',
      popularityScore: 99,
    },
    {
      ...structuredClone(nftFixtures[3]),
      id: 'high-polygon',
      popularityScore: 80,
    },
    {
      ...structuredClone(nftFixtures[0]),
      id: 'unknown',
      popularityScore: undefined,
    },
  ]
  const result = filterCatalog(catalog, {
    feed: 'trending',
    category: 'art',
    network: 'ethereum',
    minPrice: '0.1',
    maxPrice: '0.3',
  })
  assert.deepEqual(
    result.items.map((nft) => nft.id),
    ['high-art'],
  )
  assert.deepEqual(result.categoryCounts, { art: 1, photography: 1, music: 0 })
  assert.deepEqual(result.networkCounts, { ethereum: 1, polygon: 0, solana: 0 })
})

test('migração de data/score agrega apenas campos ausentes e incrementa versão uma única vez', () => {
  const database: AccountDatabase = {
    version: 1,
    users: [],
    sessions: [],
    connections: [],
  }
  const context = { userId: null, guestId: 'legacy-feed-cart' }
  addItem(database, context, {
    nftId: 'nft-001',
    editionId: 'nft-001-standard',
    quantity: 2,
  })
  const state = commerce(database)
  const cartSnapshot = () =>
    Object.values(state.carts).map((cart) => ({
      ...cart,
      items: cart.items.map((item) => ({
        id: item.id,
        nftId: item.nftId,
        editionId: item.editionId,
        quantity: item.quantity,
      })),
    }))
  const carts = structuredClone(cartSnapshot())
  const prices = structuredClone(state.catalog[0].editions)
  const version = state.catalog[0].version
  delete state.catalog[0].listedAt
  delete state.catalog[0].popularityScore
  state.catalog[1].popularityScore = 0
  state.catalog[1].listedAt = '2025-01-01T00:00:00.000Z'
  const secondVersion = state.catalog[1].version
  commerce(database)
  assert.equal(state.catalog[0].version, version + 1)
  assert.equal(state.catalog[0].listedAt, nftFixtures[0].listedAt)
  assert.equal(state.catalog[0].popularityScore, nftFixtures[0].popularityScore)
  assert.equal(state.catalog[1].version, secondVersion)
  assert.equal(state.catalog[1].popularityScore, 0)
  assert.equal(state.catalog[1].listedAt, '2025-01-01T00:00:00.000Z')
  assert.deepEqual(state.catalog[0].editions, prices)
  assert.deepEqual(cartSnapshot(), carts)
  commerce(database)
  assert.equal(state.catalog[0].version, version + 1)
})
