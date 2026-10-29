import assert from 'node:assert/strict'
import test from 'node:test'
import { ethFromWei, formatEth, parseEth } from '../../src/lib/eth.ts'

test('preserva um wei e totais além da precisão segura de Number', () => {
  const price = '9007199254740993.000000000000000001'
  assert.equal(ethFromWei(parseEth(price)), price)
  assert.equal(ethFromWei(parseEth('0.1') + parseEth('0.2')), '0.3')
  assert.equal(ethFromWei(parseEth('0.000000000000000001') * 3n), '0.000000000000000003')
})

test('normaliza zeros decimais sem arredondar valores válidos', () => {
  assert.equal(formatEth('1.190000000000000000'), '1.19')
  assert.equal(formatEth('0.000000000000000001'), '0.000000000000000001')
  assert.equal(formatEth('0.00'), '0')
})

test('rejeita notação exponencial, negativos e precisão superior a 18 casas', () => {
  for (const value of ['-1', '1e-18', '0.0000000000000000001', 'NaN', '1,2', '', '.1', '01', ' 1']) {
    assert.throws(() => parseEth(value), RangeError)
  }
  assert.throws(() => ethFromWei(-1n), RangeError)
})
