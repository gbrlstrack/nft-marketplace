import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import type { Cart } from '../../src/contracts'

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

async function add(page: Page, nftId = 'nft-001', quantity = 1): Promise<Cart> {
  await page.goto(`/nfts/${nftId}`)
  await page
    .getByRole('spinbutton', { name: 'Quantidade', exact: true })
    .fill(String(quantity))
  const added = responseFor(page, 'POST', '/cart/items')
  await page
    .getByRole('button', { name: 'Adicionar ao carrinho', exact: true })
    .click()
  const response = await added
  expect(response.status()).toBe(200)
  await expect(
    page.getByRole('status').filter({ hasText: 'NFT adicionado ao carrinho.' }),
  ).toBeVisible()
  return response.json()
}

async function login(page: Page, returnTo = '/cart') {
  await page.goto(`/login?${new URLSearchParams({ returnTo })}`)
  const form = page.getByRole('form', { name: 'Entrar', exact: true })
  await form
    .getByRole('textbox', { name: 'E-mail', exact: true })
    .fill('maya@kurio.test')
  await form.getByLabel('Senha', { exact: true }).fill('Demo123!')
  const response = responseFor(page, 'POST', '/auth/login')
  await form.getByRole('button', { name: 'Entrar', exact: true }).click()
  expect((await response).status()).toBe(200)
  await expect(page).toHaveURL(returnTo)
}

async function logout(page: Page) {
  const button = page.getByRole('button', { name: 'Sair', exact: true })
  if (!(await button.isVisible()))
    await page.getByRole('button', { name: 'Abrir menu', exact: true }).click()
  const response = responseFor(page, 'POST', '/auth/logout')
  await button.click()
  expect((await response).status()).toBe(204)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/login')
  await expect(
    page.getByRole('heading', { name: 'Entre na sua conta', exact: true }),
  ).toBeVisible()
  await mockControl(page, 'reset')
  await page.reload()
})

test('polling substitui o carrinho visitante após reset mesmo com versão menor e sem recarregar', async ({
  page,
}) => {
  const original = await add(page)
  expect(original.version).toBeGreaterThanOrEqual(2)
  await page.goto('/cart')
  const quantity = page.getByRole('spinbutton', {
    name: 'Quantidade de Chromatic Drift',
    exact: true,
  })
  await expect(quantity).toHaveValue('1')

  const replacement = page.waitForResponse(async (response) => {
    if (
      response.request().method() !== 'GET' ||
      new URL(response.url()).pathname !== '/api/cart' ||
      response.status() !== 200
    )
      return false
    const cart: Cart = await response.json()
    return cart.id !== original.id && cart.version === 1
  })
  await mockControl(page, 'reset')
  const cart: Cart = await (await replacement).json()
  expect(cart.id).not.toBe(original.id)
  expect(cart.userId).toBeNull()
  expect(cart.items).toEqual([])
  await expect(
    page.getByRole('heading', { name: 'Seu carrinho está vazio', exact: true }),
  ).toBeVisible()
  await expect(quantity).toHaveCount(0)
  await expect(
    page.getByRole('heading', { name: 'Chromatic Drift', exact: true }),
  ).toHaveCount(0)
})

test('edições da mesma obra mantêm seleção, limites e linhas independentes após refresh', async ({
  page,
}) => {
  await add(page)
  const edition = page.getByRole('combobox', { name: 'Edição', exact: true })
  const quantity = page.getByRole('spinbutton', {
    name: 'Quantidade',
    exact: true,
  })
  await expect(edition).toHaveValue('nft-001-standard')
  await expect(quantity).toHaveAttribute('max', '4')
  await expect(
    page.getByText('0.125000000000000001 ETH', { exact: true }),
  ).toBeVisible()

  const secondImage = page.getByRole('button', {
    name: 'Ver imagem 2',
    exact: true,
  })
  await secondImage.click()
  await expect(secondImage).toHaveAttribute('aria-pressed', 'true')
  await expect(
    page.getByRole('img', {
      name: 'Estudo geométrico complementar de demonstração para Chromatic Drift',
      exact: true,
    }),
  ).toHaveAttribute('src', '/artworks/linear-tide.svg')

  await quantity.fill('4')
  await edition.selectOption('nft-001-collector')
  await expect(edition).toHaveValue('nft-001-collector')
  await expect(quantity).toHaveValue('1')
  await expect(quantity).toHaveAttribute('max', '2')
  await expect(page.getByText('0.48 ETH', { exact: true })).toBeVisible()
  await quantity.fill('3')
  await expect(quantity).toHaveValue('2')
  const added = responseFor(page, 'POST', '/cart/items')
  await page
    .getByRole('button', { name: 'Adicionar ao carrinho', exact: true })
    .click()
  const response = await added
  expect(response.status()).toBe(200)
  const cart: Cart = await response.json()
  expect(cart.items).toHaveLength(2)
  expect(cart.items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        nftId: 'nft-001',
        editionId: 'nft-001-standard',
        quantity: 1,
      }),
      expect.objectContaining({
        nftId: 'nft-001',
        editionId: 'nft-001-collector',
        quantity: 2,
      }),
    ]),
  )

  await page.goto('/cart')
  const standard = page.getByRole('listitem').filter({
    has: page.getByText('Edição aberta', { exact: true }),
  })
  const collector = page.getByRole('listitem').filter({
    has: page.getByText('Edição de colecionador', { exact: true }),
  })
  for (const refresh of [false, true]) {
    if (refresh) await page.reload()
    await expect(
      page.getByRole('heading', { name: 'Chromatic Drift', exact: true }),
    ).toHaveCount(2)
    await expect(standard.getByRole('spinbutton')).toHaveValue('1')
    await expect(standard.getByRole('spinbutton')).toHaveAttribute('max', '4')
    await expect(standard).toContainText('0.125000000000000001 ETH')
    await expect(collector.getByRole('spinbutton')).toHaveValue('2')
    await expect(collector.getByRole('spinbutton')).toHaveAttribute('max', '2')
    await expect(collector).toContainText('0.48 ETH')
    await expect(collector).toContainText('0.96 ETH')
    await expect(
      collector.getByRole('button', {
        name: 'Aumentar quantidade de Chromatic Drift',
        exact: true,
      }),
    ).toBeDisabled()
    await expect(page.getByTestId('cart-subtotal')).toContainText(
      '1.085000000000000001',
    )
    await expect(page.getByTestId('cart-total')).toContainText(
      '1.101000000000000001',
    )
  }
})

test('carrinho edita quantidades, calcula ETH exato e mantém cupom após refresh', async ({
  page,
}) => {
  const initial = await add(page, 'nft-001', 2)
  expect(initial.items).toHaveLength(1)
  expect(initial.items[0].quantity).toBe(2)
  await page.goto('/cart')
  await expect(
    page.getByRole('heading', { name: 'Carrinho de NFTs', exact: true }),
  ).toBeVisible()
  const quantity = page.getByRole('spinbutton', {
    name: 'Quantidade de Chromatic Drift',
    exact: true,
  })
  await expect(quantity).toHaveValue('2')
  const updated = responseFor(page, 'PATCH', /^\/api\/cart\/items\/[^/]+$/)
  await quantity.fill('3')
  await quantity.press('Tab')
  const update = await updated
  expect(update.status()).toBe(200)
  expect((await update.json()).items[0].quantity).toBe(3)
  await expect(page.getByTestId('cart-subtotal')).toContainText(
    '0.375000000000000003',
  )
  await expect(page.getByTestId('cart-fee')).toContainText('0.016')

  const coupon = page.getByRole('form', {
    name: 'Cupom de desconto',
    exact: true,
  })
  for (const code of ['INVALIDO', 'EXPIRED']) {
    await coupon
      .getByRole('textbox', { name: 'Código promocional', exact: true })
      .fill(code)
    const failed = responseFor(page, 'PUT', '/cart/coupon')
    await coupon
      .getByRole('button', { name: 'Aplicar cupom', exact: true })
      .click()
    expect((await failed).status()).toBe(422)
    await expect(page.getByRole('alert').last()).toContainText(
      /cupom|código|expir/i,
    )
  }
  await coupon
    .getByRole('textbox', { name: 'Código promocional', exact: true })
    .fill('KURIO10')
  const applied = responseFor(page, 'PUT', '/cart/coupon')
  await coupon
    .getByRole('button', { name: 'Aplicar cupom', exact: true })
    .click()
  expect((await applied).status()).toBe(200)
  await expect(page.getByTestId('cart-discount')).toContainText('0.0375')
  await expect(page.getByTestId('cart-total')).toContainText(
    '0.353500000000000003',
  )

  await page.reload()
  await expect(quantity).toHaveValue('3')
  await expect(page.getByTestId('cart-total')).toContainText(
    '0.353500000000000003',
  )
  const removed = responseFor(page, 'PUT', '/cart/coupon')
  await page.getByRole('button', { name: 'Remover cupom', exact: true }).click()
  expect((await removed).status()).toBe(200)
  await expect(page.getByTestId('cart-total')).toContainText(
    '0.391000000000000003',
  )
})

test('login funde o carrinho visitante com a conta, informa ajuste de estoque e não o expõe no logout', async ({
  page,
}) => {
  await login(page, '/nfts/nft-001')
  await add(page, 'nft-001', 3)
  await logout(page)
  await add(page, 'nft-001', 3)
  await login(page)
  const quantity = page.getByRole('spinbutton', {
    name: 'Quantidade de Chromatic Drift',
    exact: true,
  })
  await expect(quantity).toHaveValue('4')
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: /ajust|estoque|dispon/i })
      .first(),
  ).toBeVisible()
  await page.reload()
  await expect(quantity).toHaveValue('4')
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: /ajust|estoque|dispon/i })
      .first(),
  ).toBeVisible()
  await logout(page)
  await page.goto('/cart')
  await expect(
    page.getByRole('heading', { name: 'Seu carrinho está vazio', exact: true }),
  ).toBeVisible()
  await login(page)
  await expect(quantity).toHaveValue('4')
})

test('quantidades respeitam estoque, edição esgotada impede adição e remoção recupera o estado vazio', async ({
  page,
}) => {
  await page.goto('/nfts/nft-007')
  await expect(
    page.getByRole('button', { name: 'Adicionar ao carrinho', exact: true }),
  ).toBeDisabled()
  await add(page, 'nft-001', 4)
  await page.goto('/cart')
  const quantity = page.getByRole('spinbutton', {
    name: 'Quantidade de Chromatic Drift',
    exact: true,
  })
  await expect(quantity).toHaveValue('4')
  await expect(quantity).toHaveAttribute('max', '4')
  await expect(
    page.getByRole('button', {
      name: 'Aumentar quantidade de Chromatic Drift',
      exact: true,
    }),
  ).toBeDisabled()
  await mockControl(page, 'commerce/catalog', {
    nftId: 'nft-001',
    editionId: 'nft-001-standard',
    available: 0,
  })
  await page.reload()
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: /estoque|dispon|esgot/i })
      .first(),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Conectar e finalizar', exact: true }),
  ).toBeDisabled()
  const removed = responseFor(page, 'DELETE', /^\/api\/cart\/items\/[^/]+$/)
  await page
    .getByRole('button', { name: 'Remover Chromatic Drift', exact: true })
    .click()
  expect((await removed).status()).toBe(200)
  await expect(
    page.getByRole('heading', { name: 'Seu carrinho está vazio', exact: true }),
  ).toBeVisible()
  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'Seu carrinho está vazio', exact: true }),
  ).toBeVisible()
})

test('cookie visitante aposentado é renovado sem expor o carrinho autenticado', async ({
  page,
  context,
}) => {
  await add(page)
  const oldGuest = (await context.cookies()).find(
    (cookie) => cookie.name === 'nft_cart',
  )
  expect(oldGuest).toBeTruthy()
  await login(page)
  await expect(
    page.getByRole('spinbutton', {
      name: 'Quantidade de Chromatic Drift',
      exact: true,
    }),
  ).toHaveValue('1')
  await logout(page)
  await context.addCookies([
    {
      name: 'nft_cart',
      value: oldGuest!.value,
      url: 'http://127.0.0.1:4173',
      sameSite: 'Lax',
    },
  ])
  const renewed = responseFor(page, 'GET', '/cart')
  await page.goto('/cart')
  expect((await renewed).status()).toBe(200)
  await expect(
    page.getByRole('heading', { name: 'Seu carrinho está vazio', exact: true }),
  ).toBeVisible()
  const newGuest = (await context.cookies()).find(
    (cookie) => cookie.name === 'nft_cart',
  )
  expect(newGuest?.value).toBeTruthy()
  expect(newGuest?.value).not.toBe(oldGuest!.value)
  await login(page)
  await expect(
    page.getByRole('spinbutton', {
      name: 'Quantidade de Chromatic Drift',
      exact: true,
    }),
  ).toHaveValue('1')
})

test('finalizar como visitante exige login e retoma o checkout com os itens preservados', async ({
  page,
}) => {
  await add(page, 'nft-001', 2)
  await page.goto('/cart')
  await page
    .getByRole('button', { name: 'Conectar e finalizar', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Entre na sua conta', exact: true }),
  ).toBeVisible()
  expect(new URL(page.url()).searchParams.get('returnTo')).toBe('/checkout')
  const form = page.getByRole('form', { name: 'Entrar', exact: true })
  await form
    .getByRole('textbox', { name: 'E-mail', exact: true })
    .fill('maya@kurio.test')
  await form.getByLabel('Senha', { exact: true }).fill('Demo123!')
  await form.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page).toHaveURL('/checkout')
  await expect(
    page.getByRole('heading', { name: 'Pagamento com carteira', exact: true }),
  ).toBeVisible()
  await expect(page.getByTestId('cart-subtotal')).toContainText(
    '0.250000000000000002',
  )
})
