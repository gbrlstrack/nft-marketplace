import {
  decodePacket,
  encodePacket,
  type Packet as EnginePacket,
} from 'engine.io-parser'
import {
  Decoder,
  Encoder,
  PacketType,
  type Packet as SocketPacket,
} from 'socket.io-parser'
import type { WebSocketHandlerConnection } from 'msw/ws'

export type MockSocketClient = WebSocketHandlerConnection['client']
const encoder = new Encoder()

export function engineFrame(packet: EnginePacket) {
  let frame = ''
  encodePacket(packet, false, (encoded) => {
    if (typeof encoded === 'string') frame = encoded
  })
  return frame
}

export function socketFrame(packet: SocketPacket) {
  const frames = encoder.encode(packet)
  if (frames.length !== 1 || typeof frames[0] !== 'string')
    throw new Error('A simulação aceita somente eventos Socket.IO de texto.')
  return engineFrame({ type: 'message', data: frames[0] })
}

function engineOpen(clientId: string) {
  return engineFrame({
    type: 'open',
    data: JSON.stringify({
      sid: clientId,
      upgrades: [],
      pingInterval: 25_000,
      pingTimeout: 10_000,
      maxPayload: 1_000_000,
    }),
  })
}

/**
 * Finish Engine.IO opening before interrupting it: Socket.IO's Manager only
 * observes an Engine close after that stage. Never approve its namespace.
 */
export function interruptSocketHandshake(client: MockSocketClient) {
  const interrupt = () => client.close(1012, 'Simulated offline transport')
  const deadline = setTimeout(interrupt, 1_000)
  client.addEventListener('message', interrupt, { once: true })
  client.addEventListener(
    'close',
    () => {
      clearTimeout(deadline)
      client.removeEventListener('message', interrupt)
    },
    { once: true },
  )
  client.send(engineOpen(client.id))
}

/** Engine.IO v4 and the Socket.IO default namespace over text WebSocket frames. */
export function bindSocketProtocol(
  client: MockSocketClient,
  authenticate: (auth: unknown) => Promise<boolean>,
  onReady: () => void,
  onClose: () => void,
) {
  const decoder = new Decoder()
  let ready = false
  let closed = false
  let authenticating = false
  let pongDeadline: ReturnType<typeof setTimeout> | undefined
  const heartbeat = setInterval(() => {
    if (!ready || closed) return
    client.send(engineFrame({ type: 'ping' }))
    pongDeadline = setTimeout(
      () => client.close(1001, 'Heartbeat timeout'),
      10_000,
    )
  }, 25_000)
  const finish = () => {
    if (closed) return
    closed = true
    clearInterval(heartbeat)
    clearTimeout(pongDeadline)
    decoder.destroy()
    onClose()
  }
  decoder.on('decoded', (packet: SocketPacket) => {
    if (packet.nsp !== '/') {
      client.close(1008, 'Only the default namespace is supported')
      return
    }
    if (packet.type === PacketType.DISCONNECT) {
      client.close(1000, 'Client disconnect')
      return
    }
    if (packet.type !== PacketType.CONNECT || ready || authenticating) return
    authenticating = true
    void authenticate(packet.data)
      .then((accepted) => {
        if (closed) return
        if (!accepted) {
          client.send(
            socketFrame({
              type: PacketType.CONNECT_ERROR,
              nsp: '/',
              data: { message: 'Sessão incompatível ou expirada.' },
            }),
          )
          client.close(1008, 'Unauthorized')
          return
        }
        ready = true
        client.send(
          socketFrame({
            type: PacketType.CONNECT,
            nsp: '/',
            data: { sid: client.id },
          }),
        )
        onReady()
      })
      .catch(() => {
        if (!closed) client.close(1011, 'Unable to validate session')
      })
  })
  client.addEventListener('message', ({ data }) => {
    if (closed || typeof data !== 'string') return
    try {
      const packet = decodePacket(data, 'arraybuffer')
      if (packet.type === 'pong') clearTimeout(pongDeadline)
      else if (packet.type === 'close') client.close(1000, 'Engine disconnect')
      else if (packet.type === 'message' && typeof packet.data === 'string')
        decoder.add(packet.data)
      else if (packet.type === 'error') client.close(1003, 'Invalid frame')
    } catch {
      client.close(1003, 'Invalid Socket.IO frame')
    }
  })
  client.addEventListener('close', finish)
  client.send(engineOpen(client.id))
  return {
    emit(name: string, payload: unknown) {
      if (ready && !closed)
        client.send(
          socketFrame({
            type: PacketType.EVENT,
            nsp: '/',
            data: [name, payload],
          }),
        )
    },
    close() {
      finish()
      client.close(1012, 'Simulated connection interruption')
    },
  }
}
