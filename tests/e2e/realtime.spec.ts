import { expect, test } from '@playwright/test'
import type { Page, Request } from '@playwright/test'
import type {
  AuthenticationResponse,
  Cart,
  NftUpdatedEvent,
  Order,
  OrderUpdatedEvent,
} from '../../src/contracts'

interface RealtimeStatus {
  online: boolean
  connections: {
    id: string
    userId: string | null
    scope: number
    ready: boolean
  }[]
  counters: {
    opened: number
    closed: number
    nftSent: number
    orderSent: number
  }
  events: {
    eventId: string
    type: string
    resourceId: string
    version: number
  }[]
}

async function control<T = unknown>(page: Page, path: string, body?: unknown) {
  const result = await page.evaluate(
    async ({ path, body }) => {
      const response = await fetch(`/api/__mock/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      return {
        status: response.status,
        body: response.status === 204 ? null : await response.json(),
      }
    },
    { path, body },
  )
  expect(result.status).toBeGreaterThanOrEqual(200)
  expect(result.status).toBeLessThan(300)
  return result.body as T
}

function status(page: Page): Promise<RealtimeStatus> {
  return page.evaluate(async () => {
    const response = await fetch('/api/__mock/realtime/status')
    if (!response.ok)
      throw new Error('Não foi possível consultar o transporte.')
    return response.json()
  })
}

function responseFor(page: Page, method: string, path: string | RegExp) {
  return page.waitForResponse((response) => {
    const pathname = new URL(response.url()).pathname
    return (
      response.request().method() === method &&
      (typeof path === 'string'
        ? pathname === `/api${path}`
        : path.test(pathname))
    )
  })
}

async function connected(page: Page, userId?: string | null) {
  await expect(
    page.getByRole('status', {
      name: 'Atualizações em tempo real',
      exact: true,
    }),
  ).toHaveText('Atualizações em tempo real conectadas.')
  await expect
    .poll(async () => {
      const transport = await status(page)
      return transport.connections.filter((entry) => entry.ready).length
    })
    .toBe(1)
  if (userId !== undefined)
    expect((await status(page)).connections[0].userId).toBe(userId)
}

async function fillLogin(page: Page, email = 'maya@kurio.test') {
  const form = page.getByRole('form', { name: 'Entrar', exact: true })
  await form.getByRole('textbox', { name: 'E-mail', exact: true }).fill(email)
  await form.getByLabel('Senha', { exact: true }).fill('Demo123!')
  const signedIn = responseFor(page, 'POST', '/auth/login')
  await form.getByRole('button', { name: 'Entrar', exact: true }).click()
  const response = await signedIn
  expect(response.status()).toBe(200)
  const data: AuthenticationResponse = await response.json()
  await connected(page, data.user.id)
  return data.user
}

async function login(page: Page, returnTo = '/nfts/nft-001') {
  await page.goto(`/login?${new URLSearchParams({ returnTo })}`)
  const user = await fillLogin(page)
  await expect(page).toHaveURL(returnTo)
  return user
}

async function logout(page: Page) {
  const button = page.getByRole('button', { name: 'Sair', exact: true })
  if (!(await button.isVisible()))
    await page.getByRole('button', { name: 'Abrir menu', exact: true }).click()
  const signedOut = responseFor(page, 'POST', '/auth/logout')
  await button.click()
  expect((await signedOut).status()).toBe(204)
}

async function add(page: Page, quantity = 1) {
  await page.goto('/nfts/nft-001')
  await page
    .getByRole('spinbutton', { name: 'Quantidade', exact: true })
    .fill(String(quantity))
  const added = responseFor(page, 'POST', '/cart/items')
  await page
    .getByRole('button', { name: 'Adicionar ao carrinho', exact: true })
    .click()
  expect((await added).status()).toBe(200)
  await expect(
    page.getByRole('status').filter({ hasText: 'NFT adicionado ao carrinho.' }),
  ).toBeVisible()
}

async function review(page: Page) {
  await page
    .getByRole('button', { name: 'Revisar compra', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Revise sua compra', exact: true }),
  ).toBeVisible()
}

async function checkout(page: Page) {
  const user = await login(page)
  await add(page)
  await page.goto('/checkout')
  const connection = responseFor(
    page,
    'POST',
    /^\/api\/wallets\/[^/]+\/connections$/,
  )
  await page
    .getByRole('button', { name: 'Conectar carteira', exact: true })
    .click()
  expect((await connection).status()).toBe(201)
  await expect(
    page.getByRole('button', { name: 'Desconectar carteira', exact: true }),
  ).toBeVisible()
  await review(page)
  await connected(page, user.id)
  return user
}

function orderRequests(page: Page) {
  const requests: Request[] = []
  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      new URL(request.url()).pathname === '/api/orders'
    )
      requests.push(request)
  })
  return requests
}

async function pendingOrder(
  page: Page,
  scenario: 'pending' | 'payment-declined' = 'pending',
) {
  await control(page, 'commerce/scenario', { name: scenario })
  const created = responseFor(page, 'POST', '/orders')
  await page
    .getByRole('button', { name: 'Confirmar compra', exact: true })
    .click()
  const response = await created
  expect(response.status()).toBe(201)
  const order: Order = await response.json()
  await expect(page).toHaveURL(`/orders/${order.id}`)
  await expect(
    page.getByRole('heading', { name: 'Pedido pendente', exact: true }),
  ).toBeVisible()
  await connected(page, order.userId)
  return order
}

function nftChange(page: Page, priceEth: string, available?: number) {
  return control<{ event: NftUpdatedEvent }>(page, 'realtime/nft', {
    nftId: 'nft-001',
    editionId: 'nft-001-standard',
    priceEth,
    ...(available === undefined ? {} : { available }),
  })
}

function updatedNotice(page: Page) {
  return page.getByRole('status').filter({
    hasText:
      'Preço ou disponibilidade de um NFT foi atualizado. Os valores foram recalculados.',
  })
}

test.beforeEach(async ({ page }) => {
  await page.goto('/login')
  await expect(
    page.getByRole('heading', { name: 'Entre na sua conta', exact: true }),
  ).toBeVisible()
  await control(page, 'reset')
  await page.reload()
  await connected(page, null)
})

test('Socket.IO atualiza o catálogo e o detalhe com preço e disponibilidade da mesma API', async ({
  page,
}) => {
  await page.goto('/')
  await connected(page, null)
  const card = page.getByRole('listitem').filter({
    has: page.getByRole('heading', { name: 'Chromatic Drift', exact: true }),
  })
  await expect(card.getByTestId('nft-price')).toHaveText(
    '0.125000000000000001 ETH',
  )
  const first = await nftChange(page, '0.2', 2)
  expect(first.event).toMatchObject({
    type: 'nft.updated',
    resourceId: 'nft-001',
    version: first.event.data.version,
  })
  await expect(card.getByTestId('nft-price')).toHaveText('0.2 ETH')
  await card.getByRole('link').first().click()
  await expect(
    page.getByText('2 unidades disponíveis', { exact: true }),
  ).toBeVisible()
  await expect(page.getByText('0.2 ETH', { exact: true })).toBeVisible()
  const before = (await status(page)).counters.nftSent
  await nftChange(page, '0.3', 1)
  await expect(page.getByText('0.3 ETH', { exact: true })).toBeVisible()
  await expect(
    page.getByText('1 unidades disponíveis', { exact: true }),
  ).toBeVisible()
  expect((await status(page)).counters.nftSent).toBeGreaterThan(before)
})

test('carrinho aberto anuncia o evento e recota o resumo com precisão', async ({
  page,
}) => {
  await add(page, 2)
  await page.goto('/cart')
  await connected(page, null)
  await expect(page.getByTestId('cart-total')).toHaveText(
    '0.266000000000000002 ETH',
  )
  await nftChange(page, '0.2', 3)
  await expect(updatedNotice(page)).toBeVisible()
  await expect(page.getByTestId('cart-subtotal')).toHaveText('0.4 ETH')
  await expect(page.getByTestId('cart-total')).toHaveText('0.416 ETH')
  await expect(
    page.getByRole('spinbutton', {
      name: 'Quantidade de Chromatic Drift',
      exact: true,
    }),
  ).toHaveAttribute('max', '3')
  await page.reload()
  await expect(page.getByTestId('cart-total')).toHaveText('0.416 ETH')
})

test('evento de preço invalida a revisão antes de enviar pedido e exige novo consentimento', async ({
  page,
}) => {
  await checkout(page)
  const requests = orderRequests(page)
  await nftChange(page, '0.2')
  await expect(updatedNotice(page)).toContainText(
    'Revise a compra novamente antes de confirmar.',
  )
  await expect(
    page.getByRole('heading', { name: 'Revise sua compra', exact: true }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Confirmar compra', exact: true }),
  ).toHaveCount(0)
  await expect(page.getByTestId('cart-total')).toHaveText('0.216 ETH')
  expect(requests).toHaveLength(0)
  await review(page)
  const order = await pendingOrder(page)
  expect(order.snapshot.totalEth).toBe('0.216')
  expect(requests).toHaveLength(1)
})

test('checkout invalida a revisão pela reconciliação REST quando o evento foi perdido durante desconexão', async ({
  page,
}) => {
  await checkout(page)
  const requests = orderRequests(page)
  await control(page, 'realtime/connection', { online: false })
  await expect(
    page.getByRole('status', {
      name: 'Atualizações em tempo real',
      exact: true,
    }),
  ).toHaveText('Conexão interrompida. Tentando reconectar…')
  const reconciled = page.waitForResponse(async (response) => {
    if (
      response.request().method() !== 'GET' ||
      new URL(response.url()).pathname !== '/api/cart' ||
      response.status() !== 200
    )
      return false
    const cart: Cart = await response.json()
    return cart.items.some((item) =>
      item.nft.editions.some(
        (edition) =>
          edition.id === 'nft-001-standard' && edition.priceEth === '0.22',
      ),
    )
  })
  await nftChange(page, '0.22')
  await reconciled
  await expect(updatedNotice(page)).toBeVisible()
  await expect(page.getByTestId('cart-total')).toHaveText('0.236 ETH')
  await expect(
    page.getByRole('heading', { name: 'Revise sua compra', exact: true }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Confirmar compra', exact: true }),
  ).toHaveCount(0)
  expect(requests).toHaveLength(0)
  await control(page, 'realtime/connection', { online: true })
  await connected(page)
  await review(page)
  const order = await pendingOrder(page)
  expect(order.snapshot.totalEth).toBe('0.236')
  expect(requests).toHaveLength(1)
})

test('evento de estoque esgotado bloqueia a revisão sem perder o item do carrinho', async ({
  page,
}) => {
  await checkout(page)
  const requests = orderRequests(page)
  await nftChange(page, '0.125000000000000001', 0)
  await expect(updatedNotice(page)).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Confirmar compra', exact: true }),
  ).toHaveCount(0)
  await page
    .getByRole('button', { name: 'Revisar compra', exact: true })
    .click()
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: /dispon|estoque|esgot|revise/i })
      .first(),
  ).toBeVisible()
  expect(requests).toHaveLength(0)
  await page
    .getByRole('link', { name: '← Voltar ao carrinho', exact: true })
    .click()
  await expect(
    page
      .getByRole('list', { name: 'Itens do carrinho', exact: true })
      .getByRole('listitem'),
  ).toHaveCount(1)
  await expect(
    page.getByRole('button', { name: 'Conectar e finalizar', exact: true }),
  ).toBeDisabled()
})

test('eventos NFT duplicados e antigos não fazem preço nem estoque regredirem', async ({
  page,
}) => {
  await page.goto('/nfts/nft-001')
  await connected(page, null)
  const older = await nftChange(page, '0.2', 3)
  await expect(page.getByText('0.2 ETH', { exact: true })).toBeVisible()
  const latest = await nftChange(page, '0.3', 2)
  await expect(page.getByText('0.3 ETH', { exact: true })).toBeVisible()
  const before = (await status(page)).counters.nftSent
  const duplicate = await control<{ event: NftUpdatedEvent }>(
    page,
    'realtime/nft',
    {
      nftId: 'nft-001',
      editionId: 'nft-001-standard',
      delivery: 'duplicate',
    },
  )
  expect(duplicate.event.eventId).toBe(latest.event.eventId)
  await control(page, 'realtime/replay', { eventId: older.event.eventId })
  const stale = await control<{ event: NftUpdatedEvent }>(
    page,
    'realtime/nft',
    {
      nftId: 'nft-001',
      editionId: 'nft-001-standard',
      delivery: 'stale',
    },
  )
  expect(stale.event.version).toBeLessThan(latest.event.version)
  await expect
    .poll(async () => (await status(page)).counters.nftSent)
    .toBeGreaterThanOrEqual(before + 4)
  await expect(page.getByText('0.3 ETH', { exact: true })).toBeVisible()
  await expect(page.getByText('0.2 ETH', { exact: true })).toHaveCount(0)
  await expect(
    page.getByText('2 unidades disponíveis', { exact: true }),
  ).toBeVisible()
  await page.reload()
  await expect(page.getByText('0.3 ETH', { exact: true })).toBeVisible()
})

test('order.updated confirma pela conexão Socket.IO mesmo com consultas REST indisponíveis', async ({
  page,
}) => {
  await checkout(page)
  const requests = orderRequests(page)
  const order = await pendingOrder(page)
  await control(page, 'commerce/scenario', { name: 'offline-orders' })
  const before = (await status(page)).counters.orderSent
  const result = await control<{ event: OrderUpdatedEvent }>(
    page,
    'realtime/order',
    {
      orderId: order.id,
    },
  )
  expect(result.event).toMatchObject({
    type: 'order.updated',
    resourceId: order.id,
    userId: order.userId,
    data: { id: order.id, status: 'confirmed', snapshot: order.snapshot },
  })
  await expect(
    page.getByRole('heading', { name: 'Compra confirmada', exact: true }),
  ).toBeVisible()
  await expect(page.getByTestId('order-id')).toHaveText(order.id)
  await expect(page.getByTestId('order-total')).toHaveText(
    `${order.snapshot.totalEth} ETH`,
  )
  expect((await status(page)).counters.orderSent).toBeGreaterThan(before)
  expect(requests).toHaveLength(1)
})

test('order.updated informa recusa com REST indisponível e preserva o carrinho', async ({
  page,
}) => {
  await checkout(page)
  const requests = orderRequests(page)
  const before = (await status(page)).counters.orderSent
  const order = await pendingOrder(page, 'payment-declined')
  await control(page, 'commerce/scenario', { name: 'offline-orders' })
  await expect(
    page.getByRole('heading', { name: 'Pagamento recusado', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Compra confirmada', exact: true }),
  ).toHaveCount(0)
  await expect(page.getByTestId('order-id')).toHaveText(order.id)
  await expect(page.getByTestId('order-total')).toHaveText(
    `${order.snapshot.totalEth} ETH`,
  )
  expect((await status(page)).counters.orderSent).toBeGreaterThan(before)
  expect(requests).toHaveLength(1)
  await page
    .getByRole('link', { name: 'Voltar ao carrinho', exact: true })
    .click()
  await expect(
    page.getByRole('spinbutton', {
      name: 'Quantidade de Chromatic Drift',
      exact: true,
    }),
  ).toHaveValue('1')
  await page.getByRole('link', { name: 'Chromatic Drift', exact: true }).click()
  await expect(
    page.getByText('4 unidades disponíveis', { exact: true }),
  ).toBeVisible()
  expect(requests).toHaveLength(1)
})

test('pedido terminal ignora duplicatas e pendência antiga sem repetir a baixa', async ({
  page,
}) => {
  await checkout(page)
  const requests = orderRequests(page)
  const order = await pendingOrder(page)
  await control(page, 'commerce/scenario', { name: 'offline-orders' })
  const terminal = await control<{ event: OrderUpdatedEvent }>(
    page,
    'realtime/order',
    {
      orderId: order.id,
    },
  )
  await expect(
    page.getByRole('heading', { name: 'Compra confirmada', exact: true }),
  ).toBeVisible()
  const duplicate = await control<{ event: OrderUpdatedEvent }>(
    page,
    'realtime/order',
    {
      orderId: order.id,
      delivery: 'duplicate',
    },
  )
  expect(duplicate.event.eventId).toBe(terminal.event.eventId)
  const stale = await control<{ event: OrderUpdatedEvent }>(
    page,
    'realtime/order',
    {
      orderId: order.id,
      delivery: 'stale',
    },
  )
  expect(stale.event.data.status).toBe('pending')
  expect(stale.event.version).toBeLessThan(terminal.event.version)
  await expect(
    page.getByRole('heading', { name: 'Compra confirmada', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Pedido pendente', exact: true }),
  ).toHaveCount(0)
  await expect(page.getByTestId('order-total')).toHaveText(
    `${order.snapshot.totalEth} ETH`,
  )
  await page.goto('/cart')
  await expect(
    page.getByRole('heading', { name: 'Seu carrinho está vazio', exact: true }),
  ).toBeVisible()
  await page.goto('/nfts/nft-001')
  await expect(
    page.getByText('3 unidades disponíveis', { exact: true }),
  ).toBeVisible()
  expect(requests).toHaveLength(1)
})

test('reconexão reconcilia por REST uma alteração de NFT cujo evento foi perdido', async ({
  page,
}) => {
  await page.goto('/nfts/nft-001')
  await connected(page, null)
  await expect(
    page.getByText('0.125000000000000001 ETH', { exact: true }),
  ).toBeVisible()
  await control(page, 'realtime/connection', { online: false })
  await expect(
    page.getByRole('status', {
      name: 'Atualizações em tempo real',
      exact: true,
    }),
  ).toHaveText('Conexão interrompida. Tentando reconectar…')
  await nftChange(page, '0.25', 1)
  await expect(page.getByText('0.25 ETH', { exact: true })).toHaveCount(0)
  const reconciled = responseFor(page, 'GET', '/nfts/nft-001')
  await control(page, 'realtime/connection', { online: true })
  expect((await reconciled).status()).toBe(200)
  await connected(page, null)
  await expect(page.getByText('0.25 ETH', { exact: true })).toBeVisible()
  await expect(
    page.getByText('1 unidades disponíveis', { exact: true }),
  ).toBeVisible()
})

test('desconexão durante pedido pendente recupera o mesmo pedido e snapshot após reconectar e atualizar', async ({
  page,
}) => {
  await checkout(page)
  const requests = orderRequests(page)
  const order = await pendingOrder(page)
  await page.reload()
  await connected(page, order.userId)
  await expect(
    page.getByRole('heading', { name: 'Pedido pendente', exact: true }),
  ).toBeVisible()
  await control(page, 'commerce/scenario', { name: 'offline-orders' })
  await control(page, 'realtime/connection', { online: false })
  await expect(
    page.getByRole('status', {
      name: 'Atualizações em tempo real',
      exact: true,
    }),
  ).toHaveText('Conexão interrompida. Tentando reconectar…')
  await control(page, 'realtime/order', { orderId: order.id })
  await expect(
    page.getByRole('heading', { name: 'Pedido pendente', exact: true }),
  ).toBeVisible()
  await expect(page.getByTestId('order-id')).toHaveText(order.id)
  await control(page, 'commerce/scenario', { name: 'default' })
  const reconciled = responseFor(page, 'GET', `/orders/${order.id}`)
  await control(page, 'realtime/connection', { online: true })
  const response = await reconciled
  expect(response.status()).toBe(200)
  expect(await response.json()).toMatchObject({
    id: order.id,
    status: 'confirmed',
    snapshot: order.snapshot,
  })
  await connected(page, order.userId)
  await expect(
    page.getByRole('heading', { name: 'Compra confirmada', exact: true }),
  ).toBeVisible()
  await page.reload()
  await expect(page.getByTestId('order-id')).toHaveText(order.id)
  await expect(page.getByTestId('order-total')).toHaveText(
    `${order.snapshot.totalEth} ETH`,
  )
  expect(requests).toHaveLength(1)
})

test('trocar de usuário libera a conexão anterior e não entrega pedido privado atrasado à nova conta', async ({
  page,
}) => {
  await checkout(page)
  const order = await pendingOrder(page)
  await control(page, 'realtime/order', { orderId: order.id, delayMs: 1200 })
  await logout(page)
  await expect(
    page.getByRole('heading', { name: 'Entre na sua conta', exact: true }),
  ).toBeVisible()
  const forbidden = responseFor(page, 'GET', `/orders/${order.id}`)
  const theo = await fillLogin(page, 'theo@kurio.test')
  expect((await forbidden).status()).toBe(404)
  await expect(
    page.getByRole('heading', { name: 'Pedido não encontrado', exact: true }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Kurio, início', exact: true }).click()
  const card = page.getByRole('listitem').filter({
    has: page.getByRole('heading', { name: 'Chromatic Drift', exact: true }),
  })
  await expect(card.getByTestId('nft-price')).toBeVisible()
  await connected(page, theo.id)
  // The later public event is a delivery barrier for the earlier private event.
  // Both are scheduled through MSW and received by the real Socket.IO client.
  await control(page, 'realtime/nft', {
    nftId: 'nft-001',
    editionId: 'nft-001-standard',
    priceEth: '0.37',
    delayMs: 1500,
  })
  await expect(card.getByTestId('nft-price')).toHaveText('0.37 ETH')
  await connected(page, theo.id)
  const transport = await status(page)
  expect(transport.connections).toHaveLength(1)
  expect(transport.connections[0].userId).toBe(theo.id)
  expect(transport.events.some((event) => event.resourceId === order.id)).toBe(
    false,
  )
  await expect(page.getByTestId('order-id')).toHaveCount(0)
  await expect(page.getByTestId('order-total')).toHaveCount(0)
  await expect(page.getByText('Maya Silva', { exact: true })).toHaveCount(0)
  await expect(
    page.getByRole('heading', { name: 'Compra confirmada', exact: true }),
  ).toHaveCount(0)
})
