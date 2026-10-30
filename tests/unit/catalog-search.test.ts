import assert from 'node:assert/strict'
import test from 'node:test'
import { validateCatalogSearch } from '../../src/features/catalog/search.ts'
import {
  parseMarketplaceSearch,
  stringifyMarketplaceSearch,
} from '../../src/lib/search-params.ts'

test('URLs de faixa ETH preservam um wei sem passar pelo parser JSON numérico', () => {
  const exact = '0.125000000000000001'
  const search = validateCatalogSearch(
    parseMarketplaceSearch(
      `?minPrice=${exact}&maxPrice=${exact}&network=ethereum&page=2`,
    ),
  )
  assert.equal(search.minPrice, exact)
  assert.equal(search.maxPrice, exact)
  assert.equal(search.network, 'ethereum')
  assert.equal(search.page, 2)
  const encoded = stringifyMarketplaceSearch(search)
  assert.equal(new URLSearchParams(encoded).get('minPrice'), exact)
  assert.deepEqual(
    validateCatalogSearch(parseMarketplaceSearch(encoded)),
    search,
  )
  assert.equal(
    validateCatalogSearch(parseMarketplaceSearch('?minPrice=%220.24%22'))
      .minPrice,
    '0.24',
  )
})

test('normalização descarta preços e redes inválidos e mantém contexto de retorno', () => {
  for (const minPrice of ['1e-2', '-1', 'Infinity', '0.0000000000000000001'])
    assert.equal(validateCatalogSearch({ minPrice }).minPrice, undefined)
  const search = validateCatalogSearch({
    minPrice: '2',
    maxPrice: '1',
    network: 'bitcoin',
  })
  assert.equal(search.minPrice, undefined)
  assert.equal(search.maxPrice, undefined)
  assert.equal(search.network, undefined)
  assert.equal(validateCatalogSearch({ feed: 'unknown' }).feed, undefined)
  const feed = validateCatalogSearch({
    feed: 'trending',
    sort: 'popular',
    page: 2,
  })
  assert.equal(feed.feed, 'trending')
  assert.equal(feed.sort, 'popular')
  assert.deepEqual(
    validateCatalogSearch(
      parseMarketplaceSearch(stringifyMarketplaceSearch(feed)),
    ),
    feed,
  )
  const original = {
    returnTo: '/checkout?q=nome%20com%20espaço',
    q: '100% de arte',
  }
  assert.deepEqual(
    parseMarketplaceSearch(stringifyMarketplaceSearch(original)),
    original,
  )
})
