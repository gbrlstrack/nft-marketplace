import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import type { ConfirmedOrder, Order } from '../../src/contracts'

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

async function control(page: Page, path: string, body?: unknown) {
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

async function prepareCheckout(page: Page, multipleEditions = false) {
  await page.goto('/login?returnTo=%2Fnfts%2Fnft-001')
  const login = page.getByRole('form', { name: 'Entrar', exact: true })
  await login
    .getByRole('textbox', { name: 'E-mail', exact: true })
    .fill('maya@kurio.test')
  await login.getByLabel('Senha', { exact: true }).fill('Demo123!')
  await login.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page).toHaveURL('/nfts/nft-001')
  const quantity = page.getByRole('spinbutton', {
    name: 'Quantidade',
    exact: true,
  })
  await quantity.fill(multipleEditions ? '2' : '1')
  let added = responseFor(page, 'POST', '/cart/items')
  await page
    .getByRole('button', { name: 'Adicionar ao carrinho', exact: true })
    .click()
  expect((await added).status()).toBe(200)
  if (multipleEditions) {
    await page
      .getByRole('combobox', { name: 'Edição', exact: true })
      .selectOption('nft-001-collector')
    await quantity.fill('1')
    added = responseFor(page, 'POST', '/cart/items')
    await page
      .getByRole('button', { name: 'Adicionar ao carrinho', exact: true })
      .click()
    expect((await added).status()).toBe(200)
    await page.goto('/cart')
    await page
      .getByRole('textbox', { name: 'Código promocional', exact: true })
      .fill('KURIO10')
    const applied = responseFor(page, 'PUT', '/cart/coupon')
    await page
      .getByRole('button', { name: 'Aplicar cupom', exact: true })
      .click()
    expect((await applied).status()).toBe(200)
  }
  await page.goto('/checkout')
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
  await page
    .getByRole('button', { name: 'Revisar compra', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Revise sua compra', exact: true }),
  ).toBeVisible()
}

async function confirm(page: Page) {
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

test.beforeEach(async ({ page }) => {
  await page.goto('/login')
  await expect(
    page.getByRole('heading', { name: 'Entre na sua conta', exact: true }),
  ).toBeVisible()
  await control(page, 'reset')
  await page.reload()
})

test('recibo mostra snapshot, edições e valores exatos, mantém a simulação e permite fechar', async ({
  page,
}) => {
  await prepareCheckout(page, true)
  const created = await confirm(page)
  await expect(
    page.getByRole('heading', { name: 'Compra confirmada', exact: true }),
  ).toBeVisible()
  const order: Order = await page.evaluate(async (id) => {
    const response = await fetch(`/api/orders/${encodeURIComponent(id)}`)
    if (!response.ok)
      throw new Error('Não foi possível consultar o pedido confirmado.')
    return response.json()
  }, created.id)
  expect(order.status).toBe('confirmed')
  if (order.status !== 'confirmed')
    throw new Error('O pedido ainda não foi confirmado pela API.')
  const confirmed: ConfirmedOrder = order
  expect(confirmed.snapshot.items).toHaveLength(2)
  expect(confirmed.snapshot.subtotalEth).toBe('0.730000000000000002')
  expect(confirmed.snapshot.discountEth).toBe('0.073')
  expect(confirmed.snapshot.networkFeeEth).toBe('0.016')
  expect(confirmed.snapshot.totalEth).toBe('0.673000000000000002')

  const receipt = page.getByRole('region', {
    name: 'Confirmação do pedido',
    exact: true,
  })
  await expect(
    receipt.getByText('Seus NFTs agora estão na sua carteira', { exact: true }),
  ).toBeVisible()
  await expect(
    receipt.getByRole('heading', {
      name: 'Detalhes da transação',
      exact: true,
    }),
  ).toBeVisible()
  for (const label of [
    'ID da transação',
    'Data',
    'Carteira',
    'NFTs',
    'Subtotal',
  ])
    await expect(
      receipt.getByText(label, { exact: true }).first(),
    ).toBeVisible()
  await expect(receipt.getByText('Edições', { exact: true })).toHaveCount(1)
  await expect(receipt.locator('time')).toHaveAttribute(
    'datetime',
    confirmed.confirmedAt,
  )
  await expect(receipt.getByTitle(confirmed.transactionReference)).toHaveText(
    confirmed.transactionReference,
  )
  await expect(
    receipt.getByText(confirmed.snapshot.wallet.label, { exact: true }).first(),
  ).toBeVisible()
  const images = receipt.getByRole('img')
  await expect(images).toHaveCount(confirmed.snapshot.items.length)
  for (const [index, item] of confirmed.snapshot.items.entries()) {
    await expect(images.nth(index)).toHaveAttribute('src', item.image.src)
    await expect(images.nth(index)).toHaveAttribute('width', '70')
    await expect(images.nth(index)).toHaveAttribute('height', '70')
    await expect(
      receipt.getByText(`${item.editionLabel} × ${item.quantity}`, {
        exact: true,
      }),
    ).toBeVisible()
    await expect(
      receipt.getByText(`${item.lineTotalEth} ETH`, { exact: true }),
    ).toBeVisible()
  }
  await expect(receipt.getByText(/ID do token:/)).toHaveCount(2)
  await expect(receipt.getByTestId('order-total')).toHaveText(
    `${confirmed.snapshot.totalEth} ETH`,
  )
  await expect(receipt).toContainText(confirmed.snapshot.discountEth)
  await expect(receipt).toContainText(confirmed.snapshot.networkFeeEth)
  await expect(receipt).toContainText('KURIO10')
  const transaction = receipt.getByRole('link', {
    name: 'Ver transação simulada',
    exact: true,
  })
  await expect(transaction).toHaveAttribute(
    'href',
    confirmed.simulatedExplorerUrl,
  )
  await expect(receipt.getByRole('link', { name: /Etherscan/i })).toHaveCount(0)
  await receipt.getByText('Dados do pedido', { exact: true }).click()
  await expect(receipt.getByTestId('order-id')).toHaveText(confirmed.id)
  await expect(receipt).toContainText(confirmed.transactionReference)
  await expect(receipt).toContainText(confirmed.snapshot.wallet.address)
  await expect(receipt).toContainText(confirmed.snapshot.collector.name)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)

  await control(page, 'commerce/catalog', {
    nftId: 'nft-001',
    editionId: 'nft-001-standard',
    priceEth: '9.99',
  })
  await page.reload()
  await expect(receipt.getByTestId('order-total')).toHaveText(
    `${confirmed.snapshot.totalEth} ETH`,
  )
  await receipt.getByText('Dados do pedido', { exact: true }).click()
  await expect(receipt.getByTestId('order-id')).toHaveText(confirmed.id)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  const close = receipt.getByRole('link', {
    name: 'Fechar confirmação',
    exact: true,
  })
  await close.focus()
  await expect(close).toBeFocused()
  await close.press('Enter')
  await expect(page).toHaveURL('/')
})

for (const scenario of ['pending', 'payment-declined'] as const) {
  test(`pedido ${scenario} não apresenta o recibo nem a mensagem de sucesso`, async ({
    page,
  }) => {
    await prepareCheckout(page)
    await control(page, 'commerce/scenario', { name: scenario })
    await confirm(page)
    await expect(
      page.getByRole('heading', {
        name: scenario === 'pending' ? 'Pedido pendente' : 'Pagamento recusado',
        exact: true,
      }),
    ).toBeVisible()
    await expect(
      page.getByRole('region', { name: 'Confirmação do pedido', exact: true }),
    ).toHaveCount(0)
    await expect(
      page.getByText('Seus NFTs agora estão na sua carteira', { exact: true }),
    ).toHaveCount(0)
    await expect(
      page.getByRole('link', { name: 'Fechar confirmação', exact: true }),
    ).toHaveCount(0)
    await expect(
      page.getByRole('link', { name: 'Ver transação simulada', exact: true }),
    ).toHaveCount(0)
  })
}
