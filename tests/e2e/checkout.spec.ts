import { expect, test } from '@playwright/test'
import type { Page, Request } from '@playwright/test'
import type { Cart, Order } from '../../src/contracts'

async function mockControl(page: Page, path: string, body?: unknown) {
  await expect(page.getByRole('main')).toBeVisible()
  const status = await page.evaluate(
    async ({ path, body }) => {
      const response = await fetch(`/api/__mock/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      return response.status
    },
    { path, body },
  )
  expect(status).toBeGreaterThanOrEqual(200)
  expect(status).toBeLessThan(300)
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

async function login(
  page: Page,
  returnTo = '/nfts/nft-001',
  email = 'maya@kurio.test',
) {
  await page.goto(`/login?${new URLSearchParams({ returnTo })}`)
  const form = page.getByRole('form', { name: 'Entrar', exact: true })
  await form.getByRole('textbox', { name: 'E-mail', exact: true }).fill(email)
  await form.getByLabel('Senha', { exact: true }).fill('Demo123!')
  const signedIn = responseFor(page, 'POST', '/auth/login')
  await form.getByRole('button', { name: 'Entrar', exact: true }).click()
  expect((await signedIn).status()).toBe(200)
  await expect(page).toHaveURL(returnTo)
}

async function logout(page: Page) {
  const button = page.getByRole('button', { name: 'Sair', exact: true })
  if (!(await button.isVisible()))
    await page.getByRole('button', { name: 'Abrir menu', exact: true }).click()
  const signedOut = responseFor(page, 'POST', '/auth/logout')
  await button.click()
  expect((await signedOut).status()).toBe(204)
}

async function add(page: Page, nftId = 'nft-001', quantity = 1) {
  await page.goto(`/nfts/${nftId}`)
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

async function connect(page: Page) {
  const connected = responseFor(
    page,
    'POST',
    /^\/api\/wallets\/[^/]+\/connections$/,
  )
  await page
    .getByRole('button', { name: 'Conectar carteira', exact: true })
    .click()
  expect((await connected).status()).toBe(201)
  await expect(
    page.getByRole('button', { name: 'Desconectar carteira', exact: true }),
  ).toBeVisible()
}

async function review(page: Page) {
  await page
    .getByRole('button', { name: 'Revisar compra', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Revise sua compra', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Confirmar compra', exact: true }),
  ).toBeEnabled()
}

async function prepareCheckout(page: Page) {
  await login(page)
  await add(page)
  await page.goto('/checkout')
  await expect(
    page.getByRole('heading', { name: 'Pagamento com carteira', exact: true }),
  ).toBeVisible()
  const form = page.getByRole('form', {
    name: 'Dados do pagamento',
    exact: true,
  })
  await expect(
    form.getByRole('textbox', { name: 'Nome de exibição', exact: true }),
  ).toHaveValue('Maya Silva')
  await connect(page)
  await review(page)
}

async function confirm(page: Page): Promise<Order> {
  const created = responseFor(page, 'POST', '/orders')
  await page
    .getByRole('button', { name: 'Confirmar compra', exact: true })
    .click()
  const response = await created
  expect(response.status()).toBe(201)
  const order: Order = await response.json()
  await expect(page).toHaveURL(`/orders/${order.id}`)
  return order
}

function captureOrderRequests(page: Page): Request[] {
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

test.beforeEach(async ({ page }) => {
  await page.goto('/login')
  await expect(
    page.getByRole('heading', { name: 'Entre na sua conta', exact: true }),
  ).toBeVisible()
  await mockControl(page, 'reset')
  await page.reload()
})

test('compra completa confirma somente pela API e conserva o snapshot do recibo', async ({
  page,
}) => {
  await page.goto('/')
  const catalog = page.getByRole('list', {
    name: 'NFTs disponíveis',
    exact: true,
  })
  await catalog
    .getByRole('link')
    .filter({
      has: page.getByRole('heading', { name: 'Chromatic Drift', exact: true }),
    })
    .click()
  const added = responseFor(page, 'POST', '/cart/items')
  await page
    .getByRole('button', { name: 'Adicionar ao carrinho', exact: true })
    .click()
  expect((await added).status()).toBe(200)
  await page.goto('/cart')
  await page
    .getByRole('button', { name: 'Conectar e finalizar', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Entre na sua conta', exact: true }),
  ).toBeVisible()
  const form = page.getByRole('form', { name: 'Entrar', exact: true })
  await form
    .getByRole('textbox', { name: 'E-mail', exact: true })
    .fill('maya@kurio.test')
  await form.getByLabel('Senha', { exact: true }).fill('Demo123!')
  await form.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page).toHaveURL('/checkout')
  await connect(page)
  await review(page)
  const order = await confirm(page)
  expect(order.snapshot.totalEth).toBe('0.141000000000000001')
  await expect(
    page.getByRole('heading', { name: 'Compra confirmada', exact: true }),
  ).toBeVisible()
  await expect(page.getByTestId('order-id')).toContainText(order.id)
  await expect(page.getByTestId('order-total')).toContainText(
    order.snapshot.totalEth,
  )
  await expect(
    page.getByRole('link', { name: /transação simulada/i }),
  ).toHaveAttribute('href', `/orders/${order.id}#transacao-simulada`)
  await mockControl(page, 'commerce/catalog', {
    nftId: 'nft-001',
    editionId: 'nft-001-standard',
    priceEth: '9.99',
  })
  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'Compra confirmada', exact: true }),
  ).toBeVisible()
  await expect(page.getByTestId('order-total')).toContainText(
    '0.141000000000000001',
  )
  await page.goto('/cart')
  await expect(
    page.getByRole('heading', { name: 'Seu carrinho está vazio', exact: true }),
  ).toBeVisible()
})

test('pagamento recusado é terminal e preserva o carrinho', async ({
  page,
}) => {
  await prepareCheckout(page)
  await mockControl(page, 'commerce/scenario', { name: 'payment-declined' })
  await confirm(page)
  await expect(
    page.getByRole('heading', { name: 'Pagamento recusado', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Compra confirmada', exact: true }),
  ).toHaveCount(0)
  await mockControl(page, 'commerce/scenario', { name: 'default' })
  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'Pagamento recusado', exact: true }),
  ).toBeVisible()
  await page.goto('/cart')
  await expect(
    page.getByRole('spinbutton', {
      name: 'Quantidade de Chromatic Drift',
      exact: true,
    }),
  ).toHaveValue('1')
})

test('clique repetido compartilha uma tentativa e desconta estoque apenas uma vez', async ({
  page,
}) => {
  await prepareCheckout(page)
  const requests = captureOrderRequests(page)
  const created = responseFor(page, 'POST', '/orders')
  await page
    .getByRole('button', { name: 'Confirmar compra', exact: true })
    .dblclick()
  const order: Order = await (await created).json()
  await expect(
    page.getByRole('heading', { name: 'Compra confirmada', exact: true }),
  ).toBeVisible()
  expect(requests).toHaveLength(1)
  expect(await requests[0].headerValue('Idempotency-Key')).toBe(
    order.idempotencyKey,
  )
  await page.goto('/nfts/nft-001')
  await expect(
    page.getByText('3 unidades disponíveis', { exact: true }),
  ).toBeVisible()
})

test('timeout após criação recupera o mesmo pedido por idempotência e sobrevive ao refresh', async ({
  page,
}) => {
  await prepareCheckout(page)
  await mockControl(page, 'commerce/scenario', { name: 'order-timeout' })
  const requests = captureOrderRequests(page)
  const started = page.waitForRequest(
    (request) =>
      request.method() === 'POST' &&
      new URL(request.url()).pathname === '/api/orders',
  )
  const recovered = responseFor(
    page,
    'GET',
    /^\/api\/orders\/by-idempotency-key\/[^/]+$/,
  )
  await page
    .getByRole('button', { name: 'Confirmar compra', exact: true })
    .click()
  const request = await started
  const response = await recovered
  expect(response.status()).toBe(200)
  const order: Order = await response.json()
  expect(order.idempotencyKey).toBe(
    await request.headerValue('Idempotency-Key'),
  )
  expect(order.snapshot.quoteId).toBe(request.postDataJSON().quoteId)
  await expect(page).toHaveURL(`/orders/${order.id}`)
  await expect(
    page.getByRole('heading', { name: 'Compra confirmada', exact: true }),
  ).toBeVisible()
  await page.reload()
  await expect(page.getByTestId('order-id')).toContainText(order.id)
  await expect(
    page.getByRole('heading', { name: 'Compra confirmada', exact: true }),
  ).toBeVisible()
  expect(requests).toHaveLength(1)
})

test('pedido pendente é recuperado e confirmação remove somente as quantidades compradas', async ({
  page,
}) => {
  await prepareCheckout(page)
  await mockControl(page, 'commerce/scenario', { name: 'pending' })
  const order = await confirm(page)
  await expect(
    page.getByRole('heading', { name: 'Pedido pendente', exact: true }),
  ).toBeVisible()
  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'Pedido pendente', exact: true }),
  ).toBeVisible()
  await add(page, 'nft-001')
  await add(page, 'nft-002')
  await page.goto(`/orders/${order.id}`)
  await expect(
    page.getByRole('heading', { name: 'Pedido pendente', exact: true }),
  ).toBeVisible()
  await mockControl(page, 'commerce/settle', { orderId: order.id })
  await expect(
    page.getByRole('heading', { name: 'Compra confirmada', exact: true }),
  ).toBeVisible()
  await expect(page.getByTestId('order-total')).toContainText(
    order.snapshot.totalEth,
  )
  await page.goto('/cart')
  await expect(
    page
      .getByRole('list', { name: 'Itens do carrinho', exact: true })
      .getByRole('listitem'),
  ).toHaveCount(2)
  await expect(
    page.getByRole('spinbutton', {
      name: 'Quantidade de Chromatic Drift',
      exact: true,
    }),
  ).toHaveValue('1')
  await expect(
    page.getByRole('spinbutton', {
      name: 'Quantidade de Quiet Geometry',
      exact: true,
    }),
  ).toHaveValue('1')
  await page.reload()
  await expect(
    page.getByRole('spinbutton', {
      name: 'Quantidade de Chromatic Drift',
      exact: true,
    }),
  ).toHaveValue('1')
  await expect(
    page.getByRole('spinbutton', {
      name: 'Quantidade de Quiet Geometry',
      exact: true,
    }),
  ).toHaveValue('1')
})

test('confirmar pedido pendente preserva a unidade adicionada após reduzir a quantidade original', async ({
  page,
}) => {
  await login(page)
  await add(page, 'nft-001', 2)
  await page.goto('/checkout')
  await connect(page)
  await review(page)
  await mockControl(page, 'commerce/scenario', { name: 'pending' })
  const order = await confirm(page)
  expect(order.snapshot.items).toHaveLength(1)
  expect(order.snapshot.items[0].quantity).toBe(2)
  expect(order.snapshot.totalEth).toBe('0.266000000000000002')
  await expect(
    page.getByRole('heading', { name: 'Pedido pendente', exact: true }),
  ).toBeVisible()

  await page.goto('/cart')
  const quantity = page.getByRole('spinbutton', {
    name: 'Quantidade de Chromatic Drift',
    exact: true,
  })
  await expect(quantity).toHaveValue('2')
  const edited = responseFor(page, 'PATCH', /^\/api\/cart\/items\/[^/]+$/)
  await quantity.fill('1')
  await quantity.press('Tab')
  const editResponse = await edited
  expect(editResponse.status()).toBe(200)
  const reduced: Cart = await editResponse.json()
  expect(reduced.items).toHaveLength(1)
  expect(reduced.items[0].quantity).toBe(1)
  const itemId = reduced.items[0].id

  const appended = responseFor(page, 'POST', '/cart/items')
  await add(page, 'nft-001', 1)
  const increased: Cart = await (await appended).json()
  expect(increased.items).toHaveLength(1)
  expect(increased.items[0]).toMatchObject({ id: itemId, quantity: 2 })
  await page.goto(`/orders/${order.id}`)
  await expect(
    page.getByRole('heading', { name: 'Pedido pendente', exact: true }),
  ).toBeVisible()
  await mockControl(page, 'commerce/settle', { orderId: order.id })
  await expect(
    page.getByRole('heading', { name: 'Compra confirmada', exact: true }),
  ).toBeVisible()
  await expect(page.getByTestId('order-total')).toContainText(
    '0.266000000000000002',
  )
  await expect(
    page.getByText('Edição aberta × 2', { exact: true }),
  ).toBeVisible()
  await page.goto('/cart')
  await expect(quantity).toHaveValue('1')
  await page.goto('/nfts/nft-001')
  await expect(
    page.getByText('2 unidades disponíveis', { exact: true }),
  ).toBeVisible()
  await page.goto('/cart')
  await expect(quantity).toHaveValue('1')
})

for (const change of [
  {
    label: 'preço',
    path: 'commerce/catalog',
    body: { nftId: 'nft-001', editionId: 'nft-001-standard', priceEth: '0.2' },
    total: '0.216',
  },
  {
    label: 'taxa',
    path: 'commerce/fees',
    body: { network: 'ethereum', feeEth: '0.02' },
    total: '0.145000000000000001',
  },
]) {
  test(`alteração de ${change.label} após revisão exige novo consentimento`, async ({
    page,
  }) => {
    await prepareCheckout(page)
    const requests = captureOrderRequests(page)
    await mockControl(page, change.path, change.body)
    if (change.label === 'preço') {
      await expect(
        page.getByRole('button', { name: 'Confirmar compra', exact: true }),
      ).toHaveCount(0)
      await expect(
        page
          .getByRole('status')
          .filter({ hasText: /Preço ou disponibilidade/ }),
      ).toBeVisible()
    } else {
      await page
        .getByRole('button', { name: 'Confirmar compra', exact: true })
        .click()
      await expect(
        page
          .getByRole('alert')
          .filter({ hasText: /mudaram|revise/i })
          .first(),
      ).toBeVisible()
    }
    expect(requests).toHaveLength(0)
    await expect(
      page.getByRole('heading', { name: 'Revise sua compra', exact: true }),
    ).toHaveCount(0)
    await review(page)
    const order = await confirm(page)
    expect(order.snapshot.totalEth).toBe(change.total)
    await expect(
      page.getByRole('heading', { name: 'Compra confirmada', exact: true }),
    ).toBeVisible()
  })
}

test('edição esgotada depois da revisão não cria pedido e mantém o item para correção', async ({
  page,
}) => {
  await prepareCheckout(page)
  const requests = captureOrderRequests(page)
  await mockControl(page, 'commerce/catalog', {
    nftId: 'nft-001',
    editionId: 'nft-001-standard',
    available: 0,
  })
  await expect(
    page.getByRole('button', { name: 'Confirmar compra', exact: true }),
  ).toHaveCount(0)
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: /dispon|estoque|esgot|revise/i })
      .first(),
  ).toBeVisible()
  expect(requests).toHaveLength(0)
  await expect(
    page.getByRole('heading', { name: 'Compra confirmada', exact: true }),
  ).toHaveCount(0)
  await page.goto('/cart')
  await expect(
    page
      .getByRole('list', { name: 'Itens do carrinho', exact: true })
      .getByRole('listitem'),
  ).toHaveCount(1)
})

test('cupom expirado após a revisão impede o pedido até corrigir a cotação', async ({
  page,
}) => {
  await login(page)
  await add(page)
  await page.goto('/cart')
  const coupon = page.getByRole('form', {
    name: 'Cupom de desconto',
    exact: true,
  })
  await coupon
    .getByRole('textbox', { name: 'Código promocional', exact: true })
    .fill('KURIO10')
  const applied = responseFor(page, 'PUT', '/cart/coupon')
  await coupon
    .getByRole('button', { name: 'Aplicar cupom', exact: true })
    .click()
  expect((await applied).status()).toBe(200)
  await page.goto('/checkout')
  await connect(page)
  await review(page)
  const requests = captureOrderRequests(page)
  await mockControl(page, 'commerce/coupon/expire', { code: 'KURIO10' })
  await page
    .getByRole('button', { name: 'Confirmar compra', exact: true })
    .click()
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: /cupom|expir/i })
      .first(),
  ).toBeVisible()
  expect(requests).toHaveLength(0)
  await expect(
    page.getByRole('heading', { name: 'Compra confirmada', exact: true }),
  ).toHaveCount(0)
})

test('expiração da sessão no checkout preserva dados e destino para retomada', async ({
  page,
}) => {
  await login(page)
  await add(page)
  await page.goto('/checkout')
  const form = page.getByRole('form', {
    name: 'Dados do pagamento',
    exact: true,
  })
  await form
    .getByRole('textbox', { name: 'Nome de exibição', exact: true })
    .fill('Maya Retomada')
  await form
    .getByRole('textbox', { name: 'Observação do colecionador', exact: true })
    .fill('Preservar esta observação durante o login.')
  await connect(page)
  await review(page)
  const requests = captureOrderRequests(page)
  await mockControl(page, 'session/expire')
  await page
    .getByRole('button', { name: 'Confirmar compra', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Entre na sua conta', exact: true }),
  ).toBeVisible()
  expect(new URL(page.url()).searchParams.get('returnTo')).toBe('/checkout')
  expect(requests).toHaveLength(0)
  await login(page, '/checkout')
  await expect(
    form.getByRole('textbox', { name: 'Nome de exibição', exact: true }),
  ).toHaveValue('Maya Retomada')
  await expect(
    form.getByRole('textbox', {
      name: 'Observação do colecionador',
      exact: true,
    }),
  ).toHaveValue('Preservar esta observação durante o login.')
  await connect(page)
  await review(page)
  const order = await confirm(page)
  expect(order.snapshot.collector.name).toBe('Maya Retomada')
  await expect(
    page.getByRole('heading', { name: 'Compra confirmada', exact: true }),
  ).toBeVisible()
})

test('recibo não revela dados do pedido para outro usuário', async ({
  page,
}) => {
  await prepareCheckout(page)
  const order = await confirm(page)
  await expect(
    page.getByRole('heading', { name: 'Compra confirmada', exact: true }),
  ).toBeVisible()
  await logout(page)
  const forbidden = responseFor(page, 'GET', `/orders/${order.id}`)
  await login(page, `/orders/${order.id}`, 'theo@kurio.test')
  expect((await forbidden).status()).toBe(404)
  await expect(
    page.getByRole('heading', { name: 'Compra confirmada', exact: true }),
  ).toHaveCount(0)
  await expect(page.getByTestId('order-total')).toHaveCount(0)
  await expect(page.getByText('Maya Silva', { exact: true })).toHaveCount(0)
  const forbiddenControl = await page.evaluate(async (orderId) => {
    const response = await fetch('/api/__mock/commerce/settle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId }),
    })
    return { status: response.status, body: await response.text() }
  }, order.id)
  expect(forbiddenControl.status).toBe(404)
  expect(forbiddenControl.body).not.toContain('Maya Silva')
  expect(forbiddenControl.body).not.toContain('maya@kurio.test')
  expect(forbiddenControl.body).not.toContain('"snapshot"')
  expect(forbiddenControl.body).not.toContain(order.snapshot.totalEth)
})

test('checkout informa recusa da carteira e exige conexão ativa antes da revisão', async ({
  page,
}) => {
  await login(page)
  await add(page)
  await page.goto('/checkout')
  const requests = captureOrderRequests(page)
  await mockControl(page, 'scenario', { name: 'wallet-refused' })
  const refused = responseFor(
    page,
    'POST',
    /^\/api\/wallets\/[^/]+\/connections$/,
  )
  await page
    .getByRole('button', { name: 'Conectar carteira', exact: true })
    .click()
  expect((await refused).status()).toBe(400)
  await expect(
    page.getByRole('alert').filter({ hasText: /recus/i }).first(),
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'Revisar compra', exact: true })
    .click()
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: /conect.*carteira/i })
      .first(),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Revise sua compra', exact: true }),
  ).toHaveCount(0)
  expect(requests).toHaveLength(0)
  await mockControl(page, 'scenario', { name: 'default' })
  await connect(page)
  const disconnected = responseFor(
    page,
    'DELETE',
    /^\/api\/wallet-connections\/[^/]+$/,
  )
  await page
    .getByRole('button', { name: 'Desconectar carteira', exact: true })
    .click()
  expect((await disconnected).status()).toBe(204)
  await page
    .getByRole('button', { name: 'Revisar compra', exact: true })
    .click()
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: /conect.*carteira/i })
      .first(),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Revise sua compra', exact: true }),
  ).toHaveCount(0)
  expect(requests).toHaveLength(0)
})

test('pedido pendente mantém seus dados após falha de conexão e recupera o mesmo pedido sem reenviar compra', async ({
  page,
}) => {
  await prepareCheckout(page)
  await mockControl(page, 'commerce/scenario', { name: 'pending' })
  const requests = captureOrderRequests(page)
  const order = await confirm(page)
  await expect(
    page.getByRole('heading', { name: 'Pedido pendente', exact: true }),
  ).toBeVisible()
  const disconnected = page.waitForEvent('requestfailed', {
    predicate: (request) =>
      request.method() === 'GET' &&
      new URL(request.url()).pathname === `/api/orders/${order.id}`,
  })
  await mockControl(page, 'commerce/scenario', { name: 'offline-orders' })
  await disconnected
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: /conex|últimos dados/i })
      .first(),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Pedido pendente', exact: true }),
  ).toBeVisible()
  await expect(page.getByTestId('order-id')).toContainText(order.id)
  expect(requests).toHaveLength(1)

  await mockControl(page, 'commerce/settle', { orderId: order.id })
  const recovered = responseFor(page, 'GET', `/orders/${order.id}`)
  await mockControl(page, 'commerce/scenario', { name: 'default' })
  await page.reload()
  const response = await recovered
  expect(response.status()).toBe(200)
  expect(await response.json()).toMatchObject({
    id: order.id,
    status: 'confirmed',
  })
  await expect(
    page.getByRole('heading', { name: 'Compra confirmada', exact: true }),
  ).toBeVisible()
  await expect(page.getByTestId('order-total')).toContainText(
    order.snapshot.totalEth,
  )
  await expect(page.getByTestId('order-id')).toContainText(order.id)
  expect(requests).toHaveLength(1)
})

test('checkout associa erros aos campos inválidos e só envia pedido após correção e revisão', async ({
  page,
}) => {
  await login(page)
  await add(page)
  await page.goto('/checkout')
  const form = page.getByRole('form', {
    name: 'Dados do pagamento',
    exact: true,
  })
  const name = form.getByRole('textbox', {
    name: 'Nome de exibição',
    exact: true,
  })
  const email = form.getByRole('textbox', { name: 'E-mail', exact: true })
  const requests = captureOrderRequests(page)
  await name.fill('')
  await email.fill('email-invalido')
  await page
    .getByRole('button', { name: 'Revisar compra', exact: true })
    .click()
  for (const field of [name, email]) {
    await expect(field).toHaveAttribute('aria-invalid', 'true')
    const descriptionId = await field.getAttribute('aria-describedby')
    expect(descriptionId).toBeTruthy()
    await expect(page.locator(`[id="${descriptionId}"]`)).toBeVisible()
  }
  await expect(
    page.getByRole('heading', { name: 'Revise sua compra', exact: true }),
  ).toHaveCount(0)
  expect(requests).toHaveLength(0)

  await name.fill('Maya Validada')
  await email.fill('maya@kurio.test')
  await connect(page)
  await review(page)
  await expect(name).toHaveAttribute('aria-invalid', 'false')
  await expect(email).toHaveAttribute('aria-invalid', 'false')
  const order = await confirm(page)
  expect(order.snapshot.collector).toMatchObject({
    name: 'Maya Validada',
    email: 'maya@kurio.test',
  })
  await expect(
    page.getByRole('heading', { name: 'Compra confirmada', exact: true }),
  ).toBeVisible()
  expect(requests).toHaveLength(1)
})
