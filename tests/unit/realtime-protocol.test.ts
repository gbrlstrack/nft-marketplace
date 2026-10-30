import assert from 'node:assert/strict'
import test from 'node:test'
import { PacketType } from 'socket.io-parser'
import {
  bindSocketProtocol,
  engineFrame,
  interruptSocketHandshake,
  socketFrame,
  type MockSocketClient,
} from '../../src/mocks/realtime/protocol.ts'

class TestPeer extends EventTarget {
  id = 'isolated-socket'
  url = new URL('ws://localhost/socket.io/?EIO=4&transport=websocket')
  frames: string[] = []
  closed: { code?: number; reason?: string } | null = null

  send(data: unknown) {
    assert.equal(typeof data, 'string')
    this.frames.push(String(data))
  }

  close(code?: number, reason?: string) {
    if (this.closed) return
    this.closed = { code, reason }
    this.dispatchEvent(new Event('close'))
  }

  fromClient(data: string) {
    this.dispatchEvent(new MessageEvent('message', { data }))
  }

  handle() {
    return this as unknown as MockSocketClient
  }
}

const nextTurn = () => new Promise<void>((resolve) => setImmediate(resolve))

test('interrupção offline conclui abertura Engine.IO e fecha antes de aprovar namespace', () => {
  const peer = new TestPeer()
  interruptSocketHandshake(peer.handle())
  assert.equal(peer.frames.length, 1)
  assert.equal(peer.frames[0][0], '0')
  assert.equal(
    peer.closed,
    null,
    'Manager precisa observar a abertura antes do fechamento',
  )
  peer.fromClient('40{"userId":"maya","scope":1}')
  assert.deepEqual(peer.closed, {
    code: 1012,
    reason: 'Simulated offline transport',
  })
  assert.equal(
    peer.frames.length,
    1,
    'nenhum CONNECT ack ou evento privado é enviado',
  )
})

test('binding envia Engine.IO open e aguarda autenticação antes de aprovar Socket.IO', async () => {
  const peer = new TestPeer()
  let resolveAuth: (value: boolean) => void = () => undefined
  const authorization = new Promise<boolean>((resolve) => {
    resolveAuth = resolve
  })
  let receivedAuth: unknown
  let ready = 0
  let closed = 0
  const wire = bindSocketProtocol(
    peer.handle(),
    (auth) => {
      receivedAuth = auth
      return authorization
    },
    () => ready++,
    () => closed++,
  )
  try {
    assert.equal(peer.frames.length, 1)
    assert.equal(peer.frames[0][0], '0')
    const open = JSON.parse(peer.frames[0].slice(1))
    assert.equal(open.sid, peer.id)
    assert.deepEqual(open.upgrades, [])
    assert.equal(open.pingInterval, 25_000)
    assert.equal(open.pingTimeout, 10_000)

    wire.emit('nft.updated', { version: 1 })
    assert.equal(peer.frames.length, 1, 'nenhum evento antes da autorização')
    peer.fromClient('40{"userId":"maya","scope":3}')
    await nextTurn()
    assert.deepEqual(receivedAuth, { userId: 'maya', scope: 3 })
    assert.equal(ready, 0)
    assert.equal(peer.frames.length, 1)

    resolveAuth(true)
    await nextTurn()
    assert.equal(ready, 1)
    assert.equal(peer.frames[1], '40{"sid":"isolated-socket"}')
    wire.emit('nft.updated', { version: 2 })
    assert.equal(peer.frames[2], '42["nft.updated",{"version":2}]')

    peer.fromClient('41')
    assert.equal(peer.closed?.code, 1000)
    assert.equal(closed, 1)
    wire.emit('nft.updated', { version: 3 })
    assert.equal(
      peer.frames.length,
      3,
      'conexão encerrada não envia outro evento',
    )
    wire.close()
    assert.equal(closed, 1, 'limpeza ocorre somente uma vez')
  } finally {
    wire.close()
  }
})

test('autorização recusada não aprova namespace nem entrega dados privados', async () => {
  const peer = new TestPeer()
  let ready = false
  const wire = bindSocketProtocol(
    peer.handle(),
    async () => false,
    () => {
      ready = true
    },
    () => undefined,
  )
  try {
    peer.fromClient('40{"userId":"theo","scope":1}')
    await nextTurn()
    assert.equal(ready, false)
    assert.equal(peer.closed?.code, 1008)
    assert.equal(peer.frames.length, 2)
    assert.match(peer.frames[1], /^44\{/)
    wire.emit('order.updated', { userId: 'maya' })
    assert.equal(peer.frames.length, 2)
  } finally {
    wire.close()
  }
})

test('autenticação atrasada não reabre conexão já encerrada', async () => {
  const peer = new TestPeer()
  let resolveAuth: (value: boolean) => void = () => undefined
  let ready = false
  const wire = bindSocketProtocol(
    peer.handle(),
    () =>
      new Promise((resolve) => {
        resolveAuth = resolve
      }),
    () => {
      ready = true
    },
    () => undefined,
  )
  peer.fromClient('40{"userId":"maya","scope":1}')
  wire.close()
  resolveAuth(true)
  await nextTurn()
  assert.equal(ready, false)
  assert.equal(peer.frames.length, 1)
})

test('pacotes inválidos e namespace fora do contrato fecham a conexão', () => {
  for (const frame of ['4invalid', '40/private,{"userId":null,"scope":0}']) {
    const peer = new TestPeer()
    const wire = bindSocketProtocol(
      peer.handle(),
      async () => true,
      () => undefined,
      () => undefined,
    )
    try {
      peer.fromClient(frame)
      assert.ok(peer.closed)
      assert.equal(peer.frames.length, 1)
    } finally {
      wire.close()
    }
  }
})

test('codificação preserva separação entre Engine.IO e eventos Socket.IO de texto', () => {
  assert.equal(engineFrame({ type: 'ping' }), '2')
  assert.equal(engineFrame({ type: 'pong' }), '3')
  assert.equal(
    socketFrame({
      type: PacketType.EVENT,
      nsp: '/',
      data: ['order.updated', { totalEth: '0.000000000000000001' }],
    }),
    '42["order.updated",{"totalEth":"0.000000000000000001"}]',
  )
  assert.throws(
    () =>
      socketFrame({
        type: PacketType.EVENT,
        nsp: '/',
        data: ['binary', new Uint8Array([1, 2])],
      }),
    /somente eventos Socket.IO de texto/,
  )
})
