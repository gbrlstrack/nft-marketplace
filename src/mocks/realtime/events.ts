import type { MarketplaceEvent, Nft, Order } from '../../contracts/index.ts'
import {
  readDatabase,
  writeDatabase,
  type AccountDatabase,
} from '../account/database.ts'
import { commerce, settleOrder } from '../commerce/model.ts'

const history: MarketplaceEvent[] = []
const listeners = new Set<(event: MarketplaceEvent) => void>()
const settlements = new Map<string, ReturnType<typeof setTimeout>>()

export function subscribeMockEvents(
  listener: (event: MarketplaceEvent) => void,
) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function envelope(resource: Nft | Order, type: MarketplaceEvent['type']) {
  const common = {
    eventId: crypto.randomUUID(),
    type,
    resourceId: resource.id,
    version: resource.version,
    occurredAt: new Date().toISOString(),
    data: structuredClone(resource),
  }
  return (
    type === 'order.updated'
      ? { ...common, userId: (resource as Order).userId }
      : common
  ) as MarketplaceEvent
}

export function rememberEvent(event: MarketplaceEvent): MarketplaceEvent {
  if (!history.some((known) => known.eventId === event.eventId)) {
    history.push(structuredClone(event))
    if (history.length > 256) history.shift()
  }
  return event
}

export function resourceEvent(
  resource: Nft | Order,
  type: MarketplaceEvent['type'],
) {
  const known = [...history]
    .reverse()
    .find(
      (event) =>
        event.type === type &&
        event.resourceId === resource.id &&
        event.version === resource.version,
    )
  return known || rememberEvent(envelope(resource, type))
}

export function eventHistory() {
  return structuredClone(history)
}

export function emitMockEvent(event: MarketplaceEvent) {
  rememberEvent(event)
  for (const listener of listeners) listener(structuredClone(event))
}

/** Collect envelopes only after the shared database transaction commits. */
export async function commerceTransaction<T>(
  operation: (database: AccountDatabase) => T | Promise<T>,
) {
  const { result, previous, changed } = await writeDatabase(
    async (database) => {
      const state = commerce(database)
      const oldNfts = structuredClone(state.catalog)
      const oldOrders = structuredClone(
        state.orders.map((record) => record.order),
      )
      const result = await operation(database)
      const changed: MarketplaceEvent[] = []
      const previous: MarketplaceEvent[] = []
      for (const nft of state.catalog) {
        const old = oldNfts.find((entry) => entry.id === nft.id)
        if (!old || old.version !== nft.version) {
          if (old) previous.push(envelope(old, 'nft.updated'))
          changed.push(envelope(nft, 'nft.updated'))
        }
      }
      for (const { order } of state.orders) {
        const old = oldOrders.find((entry) => entry.id === order.id)
        if (!old || old.version !== order.version) {
          if (old) previous.push(envelope(old, 'order.updated'))
          changed.push(envelope(order, 'order.updated'))
        }
      }
      return { result, previous, changed }
    },
  )
  for (const event of [...previous, ...changed]) rememberEvent(event)
  return { result, changed }
}

export async function writeCommerce<T>(
  operation: (database: AccountDatabase) => T | Promise<T>,
): Promise<T> {
  const { result, changed } = await commerceTransaction(operation)
  for (const event of changed) emitMockEvent(event)
  return result
}

/** The persisted settleAt is authoritative; this timer only makes live delivery prompt. */
export async function scheduleOrderSettlement(orderId: string) {
  if (settlements.has(orderId)) return
  const database = await readDatabase()
  const record = commerce(database).orders.find(
    (entry) => entry.order.id === orderId,
  )
  if (!record || record.order.status !== 'pending' || record.settleAt === null)
    return
  const timer = setTimeout(
    () => {
      settlements.delete(orderId)
      void writeCommerce((current) => {
        const pending = commerce(current).orders.find(
          (entry) => entry.order.id === orderId,
        )
        if (pending) settleOrder(current, pending)
      }).catch(() => undefined)
    },
    Math.max(0, record.settleAt - Date.now()),
  )
  settlements.set(orderId, timer)
}

export async function resumeOrderSettlements(userId: string) {
  const database = await readDatabase()
  for (const record of commerce(database).orders) {
    if (record.order.userId === userId && record.order.status === 'pending')
      void scheduleOrderSettlement(record.order.id)
  }
}

export function resetMockEvents() {
  history.length = 0
  for (const timer of settlements.values()) clearTimeout(timer)
  settlements.clear()
}
