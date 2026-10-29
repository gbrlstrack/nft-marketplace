import assert from 'node:assert/strict'
import test from 'node:test'
import { registrationEns } from '../../src/mocks/account/ens.ts'

test('cadastro mantém nomes com sublinhado e deriva aliases ENS válidos', () => {
  const userId = '12345678-abcd-4000-8000-123456789abc'
  const cases = [
    ['nova_conta', 'nova-conta.eth'],
    ['_Nova_Conta_', 'nova-conta.eth'],
    ['___', 'collector-12345678abcd.eth'],
  ] as const
  for (const [username, expected] of cases) {
    const alias = registrationEns(username, userId)
    assert.equal(alias, expected)
    assert.match(alias, /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.eth$/i)
  }
})
