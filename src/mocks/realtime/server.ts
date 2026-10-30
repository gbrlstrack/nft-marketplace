import { ws } from 'msw/ws'
import { http, HttpResponse } from 'msw/http'
import type {
  ApiErrorResponse,
  MarketplaceEvent,
} from '../../contracts/index.ts'
import { readDatabase } from '../account/database.ts'
import { ApiFault, invalid, jsonBody, text } from '../account/validation.ts'
import { parseEth } from '../../lib/eth.ts'
import {
  authorize,
  contextFrom,
  editionFor,
  ownedOrder,
  settleOrder,
  type CommerceContext,
} from '../commerce/model.ts'
import {
  commerceTransaction,
  emitMockEvent,
  eventHistory,
  resetMockEvents,
  resourceEvent,
  resumeOrderSettlements,
  subscribeMockEvents,
} from './events.ts'
import { bindSocketProtocol, type MockSocketClient } from './protocol.ts'

const onlineKey = 'kurio:realtime-online'
interface Connection {
  client: MockSocketClient
  context: CommerceContext
  scope: number
  ready: boolean
  outbound: Promise<void>
  wire: ReturnType<typeof bindSocketProtocol>
}
const connections = new Map<string, Connection>()
const pending = new Map<
  string,
  { event: MarketplaceEvent; timer?: ReturnType<typeof setTimeout> }
>()
const counters = { opened: 0, closed: 0, nftSent: 0, orderSent: 0 }

function isOnline() {
  return (
    typeof sessionStorage === 'undefined' ||
    sessionStorage.getItem(onlineKey) !== 'false'
  )
}

function cookiesNow(): Record<string, string | undefined> {
  if (typeof document === 'undefined') return {}
  return Object.fromEntries(
    document.cookie
      .split('; ')
      .filter(Boolean)
      .map((pair) => {
        const equal = pair.indexOf('=')
        return [pair.slice(0, equal), decodeURIComponent(pair.slice(equal + 1))]
      }),
  )
}

async function sendTo(connection: Connection, event: MarketplaceEvent) {
  if (
    !isOnline() ||
    !connection.ready ||
    connections.get(connection.client.id) !== connection
  )
    return
  try {
    const database = await readDatabase()
    authorize(database, connection.context)
    if (
      event.type === 'order.updated' &&
      connection.context.userId !== event.userId
    )
      return
    if (connections.get(connection.client.id) !== connection || !isOnline())
      return
    connection.wire.emit(event.type, event)
    if (event.type === 'nft.updated') counters.nftSent += 1
    else counters.orderSent += 1
  } catch {
    connection.wire.close()
  }
}

/** Delayed deliveries belong to the sockets present now, never to a later session. */
function deliver(event: MarketplaceEvent, delayMs = 0) {
  const targets = [...connections.values()].filter(
    (connection) =>
      connection.ready &&
      (event.type === 'nft.updated' ||
        event.userId === connection.context.userId),
  )
  const id = crypto.randomUUID()
  const job: {
    event: MarketplaceEvent
    timer?: ReturnType<typeof setTimeout>
  } = { event }
  pending.set(id, job)
  const run = async () => {
    try {
      await Promise.all(
        targets.map((connection) => {
          connection.outbound = connection.outbound.then(() =>
            sendTo(connection, event),
          )
          return connection.outbound
        }),
      )
    } finally {
      pending.delete(id)
    }
  }
  if (delayMs) job.timer = setTimeout(() => void run(), delayMs)
  else void run()
}

subscribeMockEvents((event) => deliver(event))

const socketLink = ws.link(/^wss?:\/\/[^/]+\/$/)
const socketHandler = socketLink.addEventListener(
  'connection',
  ({ client, server }) => {
    if (!client.url.pathname.startsWith('/socket.io/')) {
      server.connect()
      return
    }
    if (
      client.url.searchParams.get('EIO') !== '4' ||
      client.url.searchParams.get('transport') !== 'websocket'
    ) {
      client.close(1003, 'Engine.IO v4 WebSocket is required')
      return
    }
    if (!isOnline()) {
      client.close(1012, 'Simulated offline transport')
      return
    }
    const capturedCookies = cookiesNow()
    const wire = bindSocketProtocol(
      client,
      async (rawAuth) => {
        if (!rawAuth || typeof rawAuth !== 'object') return false
        const auth = rawAuth as Record<string, unknown>
        if (!Number.isSafeInteger(auth.scope) || Number(auth.scope) < 0)
          return false
        try {
          const database = await readDatabase()
          const context = contextFrom(database, capturedCookies)
          if (auth.userId !== context.userId) return false
          connection.context = context
          connection.scope = Number(auth.scope)
          return isOnline() && connections.get(client.id) === connection
        } catch {
          return false
        }
      },
      () => {
        connection.ready = true
        counters.opened += 1
        if (connection.context.userId)
          void resumeOrderSettlements(connection.context.userId)
      },
      () => {
        connections.delete(client.id)
        counters.closed += 1
      },
    )
    const connection: Connection = {
      client,
      context: { userId: null },
      scope: 0,
      ready: false,
      outbound: Promise.resolve(),
      wire,
    }
    connections.set(client.id, connection)
  },
)

async function respond(operation: () => Promise<Response>) {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof ApiFault)
      return HttpResponse.json<ApiErrorResponse>(
        { error: error.detail },
        { status: error.status },
      )
    return HttpResponse.json<ApiErrorResponse>(
      {
        error: {
          code: 'transient',
          message: 'Não foi possível executar o cenário em tempo real.',
        },
      },
      { status: 503 },
    )
  }
}

function options(body: Record<string, unknown>) {
  const delivery = body.delivery ?? 'normal'
  if (!['normal', 'duplicate', 'stale'].includes(String(delivery)))
    invalid({ delivery: 'Use normal, duplicate ou stale.' })
  const delayMs = body.delayMs ?? 0
  if (
    typeof delayMs !== 'number' ||
    !Number.isSafeInteger(delayMs) ||
    delayMs < 0 ||
    delayMs > 10_000
  )
    invalid({ delayMs: 'Use um atraso inteiro entre 0 e 10000 ms.' })
  return { delivery, delayMs }
}

function staleEvent(
  type: MarketplaceEvent['type'],
  resourceId: string,
  version: number,
) {
  const event = eventHistory()
    .reverse()
    .find(
      (known) =>
        known.type === type &&
        known.resourceId === resourceId &&
        known.version < version,
    )
  if (!event)
    invalid({ delivery: 'Não há versão anterior deste recurso no cenário.' })
  return event
}

function respondEvent(
  event: MarketplaceEvent,
  delivery: unknown,
  delayMs: number,
) {
  deliver(event, delayMs)
  if (delivery === 'duplicate') deliver(event, delayMs)
  return HttpResponse.json({ event })
}

export function resetRealtime() {
  resetMockEvents()
  for (const job of pending.values()) clearTimeout(job.timer)
  pending.clear()
  if (typeof sessionStorage !== 'undefined')
    sessionStorage.removeItem(onlineKey)
  for (const connection of [...connections.values()]) connection.wire.close()
  Object.assign(counters, { opened: 0, closed: 0, nftSent: 0, orderSent: 0 })
}

export const realtimeHandlers = [
  socketHandler,
  http.get('/api/__mock/realtime/status', ({ cookies }) =>
    respond(async () => {
      const context = contextFrom(await readDatabase(), cookies)
      const visible = (event: MarketplaceEvent) =>
        event.type === 'nft.updated' || event.userId === context.userId
      return HttpResponse.json({
        online: isOnline(),
        connections: [...connections.values()]
          .filter((entry) => entry.context.userId === context.userId)
          .map((entry) => ({
            id: entry.client.id,
            userId: entry.context.userId,
            scope: entry.scope,
            ready: entry.ready,
          })),
        counters: { ...counters },
        pendingDeliveries: [...pending.values()].filter((job) =>
          visible(job.event),
        ).length,
        events: eventHistory()
          .filter(visible)
          .map(({ eventId, type, resourceId, version }) => ({
            eventId,
            type,
            resourceId,
            version,
          })),
      })
    }),
  ),
  http.post('/api/__mock/realtime/connection', ({ request }) =>
    respond(async () => {
      const body = await jsonBody(request)
      if (typeof body.online !== 'boolean')
        invalid({ online: 'Informe true ou false.' })
      if (typeof sessionStorage !== 'undefined')
        sessionStorage.setItem(onlineKey, String(body.online))
      if (!body.online)
        for (const connection of [...connections.values()])
          connection.wire.close()
      return HttpResponse.json({ online: body.online })
    }),
  ),
  http.post('/api/__mock/realtime/nft', ({ request }) =>
    respond(async () => {
      const body = await jsonBody(request)
      const { delivery, delayMs } = options(body)
      const nftId = text(body, 'nftId'),
        editionId = text(body, 'editionId')
      if (delivery === 'stale') {
        const { nft } = editionFor(await readDatabase(), nftId, editionId)
        return respondEvent(
          staleEvent('nft.updated', nftId, nft.version),
          delivery,
          delayMs,
        )
      }
      const { result: nft, changed } = await commerceTransaction((database) => {
        const { nft, edition } = editionFor(database, nftId, editionId)
        if (body.priceEth !== undefined) {
          if (typeof body.priceEth !== 'string')
            invalid({ priceEth: 'Envie valor ETH decimal como string.' })
          try {
            parseEth(body.priceEth)
          } catch {
            invalid({ priceEth: 'Use ETH não negativo com até 18 casas.' })
          }
          edition.priceEth = body.priceEth
        }
        if (body.available !== undefined) {
          if (
            typeof body.available !== 'number' ||
            !Number.isSafeInteger(body.available) ||
            body.available < 0
          )
            invalid({ available: 'Use disponibilidade inteira não negativa.' })
          edition.available = body.available
        }
        if (body.priceEth !== undefined || body.available !== undefined)
          nft.version += 1
        return nft
      })
      const event =
        changed.find(
          (entry) =>
            entry.type === 'nft.updated' && entry.resourceId === nft.id,
        ) || resourceEvent(nft, 'nft.updated')
      return respondEvent(event, delivery, delayMs)
    }),
  ),
  http.post('/api/__mock/realtime/order', ({ request, cookies }) =>
    respond(async () => {
      const context = contextFrom(await readDatabase(), cookies)
      const body = await jsonBody(request)
      const { delivery, delayMs } = options(body)
      const orderId = text(body, 'orderId')
      if (delivery === 'stale') {
        const { order } = ownedOrder(await readDatabase(), context, orderId)
        return respondEvent(
          staleEvent('order.updated', orderId, order.version),
          delivery,
          delayMs,
        )
      }
      const { result: order, changed } = await commerceTransaction((database) =>
        settleOrder(
          database,
          ownedOrder(database, context, orderId),
          Date.now(),
          true,
        ),
      )
      for (const event of changed)
        if (event.type === 'nft.updated') emitMockEvent(event)
      const event =
        changed.find(
          (entry) =>
            entry.type === 'order.updated' && entry.resourceId === order.id,
        ) || resourceEvent(order, 'order.updated')
      return respondEvent(event, delivery, delayMs)
    }),
  ),
  http.post('/api/__mock/realtime/replay', ({ request, cookies }) =>
    respond(async () => {
      const context = contextFrom(await readDatabase(), cookies)
      const body = await jsonBody(request)
      const { delayMs } = options(body)
      const event = eventHistory().find(
        (entry) => entry.eventId === text(body, 'eventId'),
      )
      if (
        !event ||
        (event.type === 'order.updated' && event.userId !== context.userId)
      )
        throw new ApiFault(404, {
          code: 'not-found',
          resource: 'event',
          message: 'Evento não encontrado.',
        })
      if (event.type === 'order.updated') {
        const database = await readDatabase()
        authorize(database, context, true)
        ownedOrder(database, context, event.resourceId)
      }
      return respondEvent(event, 'normal', delayMs)
    }),
  ),
]
