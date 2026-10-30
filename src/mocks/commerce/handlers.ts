import { http, HttpResponse } from 'msw/http'
import { delay } from 'msw/utils/delay'
import type { ApiErrorResponse } from '../../contracts/index.ts'
import { readDatabase } from '../account/database.ts'
import { writeCommerce, scheduleOrderSettlement } from '../realtime/events.ts'
import { ApiFault, invalid, jsonBody, text } from '../account/validation.ts'
import { parseEth } from '../../lib/eth.ts'
import {
  addItem,
  applyCoupon,
  authorize,
  cartDto,
  cartFor,
  commerce,
  contextFrom,
  createOrder,
  createQuote,
  editionFor,
  ownedOrder,
  removeItem,
  settleOrder,
  updateItem,
  validNetwork,
  type CommerceContext,
} from './model.ts'

const scenarioKey = 'kurio:commerce-scenario'
const scenarios = [
  'default',
  'payment-declined',
  'order-timeout',
  'pending',
  'offline-orders',
] as const
export type CommerceScenario = (typeof scenarios)[number]

export function commerceScenario(): CommerceScenario {
  if (typeof sessionStorage === 'undefined') return 'default'
  const stored = sessionStorage.getItem(scenarioKey)
  return scenarios.includes(stored as CommerceScenario)
    ? (stored as CommerceScenario)
    : 'default'
}

export function resetCommerceScenario() {
  if (typeof sessionStorage !== 'undefined')
    sessionStorage.removeItem(scenarioKey)
}

function cookie(id: string) {
  return `nft_cart=${encodeURIComponent(id)}; Path=/; SameSite=Lax; Max-Age=7776000`
}

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
          message: 'Não foi possível concluir a operação. Tente novamente.',
        },
      },
      { status: 503 },
    )
  }
}

/** Bootstrap a guest eagerly, so overlapping initial requests share its cookie. */
async function capture(
  cookies: Record<string, string | undefined>,
  renewRetiredGuest = false,
): Promise<CommerceContext> {
  let guestId = cookies.nft_cart
  if (!cookies.nft_session && !guestId && typeof document !== 'undefined') {
    guestId = document.cookie
      .split('; ')
      .find((entry) => entry.startsWith('nft_cart='))
      ?.slice('nft_cart='.length)
    if (!guestId) {
      guestId = crypto.randomUUID()
      document.cookie = cookie(guestId)
    }
  }
  if (!cookies.nft_session && !guestId) guestId = crypto.randomUUID()
  const database = await readDatabase()
  if (
    !cookies.nft_session &&
    renewRetiredGuest &&
    guestId &&
    commerce(database).retiredGuestIds.includes(guestId)
  ) {
    guestId = crypto.randomUUID()
    if (typeof document !== 'undefined') document.cookie = cookie(guestId)
    return contextFrom(database, { ...cookies, nft_cart: guestId })
  }
  return contextFrom(database, cookies, guestId)
}

function withCart(
  cookies: Record<string, string | undefined>,
  operation: (context: CommerceContext) => Promise<Response>,
  renewRetiredGuest = false,
) {
  return respond(async () => {
    const context = await capture(cookies, renewRetiredGuest)
    await delay(100)
    return operation(context)
  })
}

function cartHeaders(context: CommerceContext) {
  return context.userId ? undefined : { 'Set-Cookie': cookie(context.guestId!) }
}

function decimal(value: unknown, field: string): string {
  if (typeof value !== 'string')
    invalid({ [field]: 'Envie um valor ETH decimal como string.' })
  try {
    parseEth(value)
  } catch {
    invalid({ [field]: 'Use um valor ETH não negativo com até 18 casas.' })
  }
  return value
}

export const commerceHandlers = [
  http.get('/api/cart', ({ cookies }) =>
    withCart(
      cookies,
      async (context) => {
        const cart = await writeCommerce((database) =>
          cartDto(database, cartFor(database, context)),
        )
        return HttpResponse.json(cart, { headers: cartHeaders(context) })
      },
      true,
    ),
  ),
  http.post('/api/cart/items', ({ cookies, request }) =>
    withCart(cookies, async (context) => {
      const body = await jsonBody(request)
      const cart = await writeCommerce((database) =>
        addItem(database, context, body),
      )
      return HttpResponse.json(cart, { headers: cartHeaders(context) })
    }),
  ),
  http.patch('/api/cart/items/:itemId', ({ cookies, request, params }) =>
    withCart(cookies, async (context) => {
      const body = await jsonBody(request)
      const cart = await writeCommerce((database) =>
        updateItem(database, context, String(params.itemId), body.quantity),
      )
      return HttpResponse.json(cart, { headers: cartHeaders(context) })
    }),
  ),
  http.delete('/api/cart/items/:itemId', ({ cookies, params }) =>
    withCart(cookies, async (context) => {
      const cart = await writeCommerce((database) =>
        removeItem(database, context, String(params.itemId)),
      )
      return HttpResponse.json(cart, { headers: cartHeaders(context) })
    }),
  ),
  http.put('/api/cart/coupon', ({ cookies, request }) =>
    withCart(cookies, async (context) => {
      const body = await jsonBody(request)
      const cart = await writeCommerce((database) =>
        applyCoupon(database, context, body.couponCode),
      )
      return HttpResponse.json(cart, { headers: cartHeaders(context) })
    }),
  ),
  http.post('/api/quotes', ({ cookies, request }) =>
    withCart(cookies, async (context) => {
      const body = await jsonBody(request)
      const quote = await writeCommerce((database) =>
        createQuote(database, context, body),
      )
      return HttpResponse.json(quote, {
        status: 201,
        headers: cartHeaders(context),
      })
    }),
  ),
  http.post('/api/orders', ({ cookies, request }) =>
    withCart(cookies, async (context) => {
      const body = await jsonBody(request)
      const mode = commerceScenario()
      const key = request.headers.get('Idempotency-Key') || ''
      const result = await writeCommerce((database) =>
        createOrder(database, context, body, key, mode),
      )
      if (result.order.status === 'pending')
        void scheduleOrderSettlement(result.order.id)
      if (mode === 'order-timeout' && result.created) await delay(2500)
      return HttpResponse.json(result.order, {
        status: result.created ? 201 : 200,
      })
    }),
  ),
  http.get('/api/orders/by-idempotency-key/:key', ({ cookies, params }) =>
    withCart(cookies, async (context) => {
      if (commerceScenario() === 'offline-orders') return HttpResponse.error()
      const order = await writeCommerce((database) => {
        authorize(database, context, true)
        const entry = commerce(database).idempotency.find(
          (entry) =>
            entry.userId === context.userId && entry.key === params.key,
        )
        if (!entry)
          throw new ApiFault(404, {
            code: 'not-found',
            resource: 'order',
            message: 'Esta tentativa ainda não criou um pedido.',
          })
        return settleOrder(
          database,
          ownedOrder(database, context, entry.orderId),
        )
      })
      return HttpResponse.json(order)
    }),
  ),
  http.get('/api/orders/:orderId', ({ cookies, params }) =>
    withCart(cookies, async (context) => {
      if (commerceScenario() === 'offline-orders') return HttpResponse.error()
      const order = await writeCommerce((database) =>
        settleOrder(
          database,
          ownedOrder(database, context, String(params.orderId)),
        ),
      )
      return HttpResponse.json(order)
    }),
  ),
  http.get('/api/orders', ({ cookies }) =>
    withCart(cookies, async (context) => {
      if (commerceScenario() === 'offline-orders') return HttpResponse.error()
      const items = await writeCommerce((database) => {
        authorize(database, context, true)
        return commerce(database)
          .orders.filter((entry) => entry.order.userId === context.userId)
          .map((record) => settleOrder(database, record))
      })
      return HttpResponse.json({ items })
    }),
  ),
  http.post('/api/__mock/commerce/scenario', ({ request }) =>
    respond(async () => {
      const body = await jsonBody(request)
      const name = text(body, 'name')
      if (!scenarios.includes(name as CommerceScenario))
        invalid({ name: 'Selecione um cenário de comércio disponível.' })
      if (typeof sessionStorage !== 'undefined')
        sessionStorage.setItem(scenarioKey, name)
      return HttpResponse.json({ name })
    }),
  ),
  http.post('/api/__mock/commerce/settle', ({ request, cookies }) =>
    withCart(cookies, async (context) => {
      const body = request.headers
        .get('Content-Type')
        ?.includes('application/json')
        ? await jsonBody(request)
        : {}
      await writeCommerce((database) => {
        authorize(database, context, true)
        const records = body.orderId
          ? [ownedOrder(database, context, String(body.orderId))]
          : commerce(database).orders.filter(
              (record) => record.order.userId === context.userId,
            )
        for (const record of records)
          settleOrder(database, record, Date.now(), true)
      })
      return new HttpResponse(null, { status: 204 })
    }),
  ),
  http.post('/api/__mock/commerce/catalog', ({ request }) =>
    respond(async () => {
      const body = await jsonBody(request)
      const nft = await writeCommerce((database) => {
        const { nft, edition } = editionFor(
          database,
          text(body, 'nftId'),
          text(body, 'editionId'),
        )
        if (body.priceEth !== undefined)
          edition.priceEth = decimal(body.priceEth, 'priceEth')
        if (body.available !== undefined) {
          if (
            typeof body.available !== 'number' ||
            !Number.isSafeInteger(body.available) ||
            body.available < 0
          )
            invalid({ available: 'Use disponibilidade inteira não negativa.' })
          edition.available = body.available
        }
        nft.version += 1
        return nft
      })
      return HttpResponse.json(nft)
    }),
  ),
  http.post('/api/__mock/commerce/fees', ({ request }) =>
    respond(async () => {
      const body = await jsonBody(request)
      const network = validNetwork(body.network),
        feeEth = decimal(body.feeEth, 'feeEth')
      await writeCommerce((database) => {
        commerce(database).fees[network] = feeEth
      })
      return HttpResponse.json({ network, feeEth })
    }),
  ),
  http.post('/api/__mock/commerce/coupon/expire', ({ request }) =>
    respond(async () => {
      const body = await jsonBody(request)
      if (body.code !== 'KURIO10')
        invalid({ code: 'Use KURIO10 neste controle.' })
      await writeCommerce((database) => {
        const state = commerce(database)
        if (!state.expiredCoupons.includes('KURIO10'))
          state.expiredCoupons.push('KURIO10')
      })
      return new HttpResponse(null, { status: 204 })
    }),
  ),
]
