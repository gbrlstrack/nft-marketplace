import assert from 'node:assert/strict'
import test from 'node:test'
import { safeReturnTo } from '../../src/features/auth/return-to.ts'

test('preserva caminhos internos e contexto de busca', () => {
  assert.equal(safeReturnTo('/nfts/nft-001'), '/nfts/nft-001')
  assert.equal(
    safeReturnTo('/?category=art#catalogo'),
    '/?category=art#catalogo',
  )
  assert.equal(safeReturnTo('/?q=Quiet%20Geometry'), '/?q=Quiet%20Geometry')
  assert.equal(safeReturnTo('/?q=100%25af'), '/?q=100%25af')
})

test('bloqueia redirecionamentos externos, barras codificadas e ciclos de autenticação', () => {
  for (const path of [
    'https://example.com',
    '//example.com',
    '/\\example.com',
    '/%5cexample.com',
    '/%2fexample.com',
    '/%255cexample.com',
    '/\texample.com',
    '/login',
    '/%6cogin',
    '/register?returnTo=/profile',
    null,
    '%',
  ]) {
    assert.equal(safeReturnTo(path), '/')
  }
})
