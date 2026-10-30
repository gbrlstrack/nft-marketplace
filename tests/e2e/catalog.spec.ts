import { expect, test } from '@playwright/test'
import type { Page, Request } from '@playwright/test'
import type { NftListResponse } from '../../src/contracts'

function isCatalogRequest(
  request: Request,
  search: Record<string, string> = {},
) {
  const url = new URL(request.url())
  return (
    request.method() === 'GET' &&
    url.pathname === '/api/nfts' &&
    Object.entries(search).every(
      ([key, value]) => url.searchParams.get(key) === value,
    )
  )
}

function catalogResponse(page: Page, search: Record<string, string> = {}) {
  return page.waitForResponse((response) =>
    isCatalogRequest(response.request(), search),
  )
}

async function expectItems(page: Page, names: string[]) {
  const cards = page
    .getByRole('list', { name: 'NFTs disponíveis', exact: true })
    .getByRole('listitem')
  await expect(cards).toHaveCount(names.length)
  for (const [index, name] of names.entries()) {
    await expect(
      cards.nth(index).getByRole('heading', { level: 3, name, exact: true }),
    ).toBeVisible()
  }
}

function displayedWei(text: string): bigint {
  const amount = text.match(/\d+(?:[.,]\d+)?/)?.[0].replace(',', '.')
  if (!amount) throw new Error(`Preço ETH ausente: ${text}`)
  const [whole, fraction = ''] = amount.split('.')
  if (fraction.length > 18) throw new Error(`Precisão ETH inválida: ${text}`)
  return BigInt(whole + fraction.padEnd(18, '0'))
}

/** A stale query may finish or be cancelled; either outcome must preserve the newest UI. */
function catalogRequestCompletion(page: Page, query: string): Promise<void> {
  return new Promise((resolve) => {
    const finished = (request: Request) => {
      if (!isCatalogRequest(request, { q: query })) return
      page.off('requestfinished', finished)
      page.off('requestfailed', finished)
      resolve()
    }
    page.on('requestfinished', finished)
    page.on('requestfailed', finished)
  })
}

test('filtros combinados, paginação, URL, refresh e histórico preservam os resultados', async ({
  page,
}) => {
  const initial = catalogResponse(page)
  await page.goto('/')
  const initialData: NftListResponse = await (await initial).json()
  expect(initialData.total).toBe(24)
  expect(initialData.pageSize).toBe(8)
  expect(initialData.categoryCounts).toEqual({
    art: 8,
    photography: 8,
    music: 8,
  })
  await expectItems(
    page,
    initialData.items.map((nft) => nft.name),
  )

  const next = catalogResponse(page, { page: '2' })
  await page
    .getByRole('button', { name: 'Próxima página', exact: true })
    .click()
  const nextData: NftListResponse = await (await next).json()
  await expectItems(
    page,
    nextData.items.map((nft) => nft.name),
  )
  expect(new URL(page.url()).searchParams.get('page')).toBe('2')

  const filters = page.getByRole('form', {
    name: 'Filtros do catálogo',
    exact: true,
  })
  const toolbar = page.getByRole('group', {
    name: 'Busca e ordenação do catálogo',
    exact: true,
  })
  await toolbar.getByLabel('Buscar NFTs', { exact: true }).fill('a')
  await toolbar.getByLabel('Coleção', { exact: true }).fill('Chromatic')
  await filters.getByText('Arte digital', { exact: true }).click()
  await page
    .getByRole('combobox', { name: 'Ordenar por', exact: true })
    .selectOption('name')
  const search = {
    q: 'a',
    category: 'art',
    collection: 'Chromatic',
    sort: 'name',
    page: '1',
  }
  const filtered = catalogResponse(page, search)
  await page
    .getByRole('button', { name: 'Aplicar filtros', exact: true })
    .click()
  const filteredData: NftListResponse = await (await filtered).json()
  expect(filteredData.total).toBe(3)
  expect(filteredData.categoryCounts).toEqual({
    art: 3,
    photography: 3,
    music: 3,
  })
  expect(
    filteredData.items.every(
      (nft) => nft.category === 'art' && nft.collection === 'Chromatic',
    ),
  ).toBe(true)
  await expectItems(page, [
    'Chromatic Drift',
    'Coral Architecture',
    'Parallel Worlds',
  ])
  const url = new URL(page.url())
  for (const [key, value] of Object.entries(search)) {
    expect(url.searchParams.get(key) ?? (key === 'page' ? '1' : null)).toBe(
      value,
    )
  }

  const restored = catalogResponse(page, search)
  await page.reload()
  expect((await restored).status()).toBe(200)
  await expectItems(page, [
    'Chromatic Drift',
    'Coral Architecture',
    'Parallel Worlds',
  ])
  await expect(toolbar.getByLabel('Buscar NFTs', { exact: true })).toHaveValue(
    'a',
  )
  await expect(toolbar.getByLabel('Coleção', { exact: true })).toHaveValue(
    'Chromatic',
  )
  await expect(
    filters.getByRole('radio', { name: 'Arte digital (3)', exact: true }),
  ).toBeChecked()
  await expect(
    page.getByRole('combobox', { name: 'Ordenar por', exact: true }),
  ).toHaveValue('name')

  await page.goBack()
  await expectItems(
    page,
    nextData.items.map((nft) => nft.name),
  )
  expect(new URL(page.url()).searchParams.get('page')).toBe('2')
  await expect(toolbar.getByLabel('Buscar NFTs', { exact: true })).toHaveValue(
    '',
  )
  await expect(toolbar.getByLabel('Coleção', { exact: true })).toHaveValue('')
  await expect(
    filters.getByRole('radio', { name: 'Arte digital (8)', exact: true }),
  ).not.toBeChecked()
  await expect(
    page.getByRole('combobox', { name: 'Ordenar por', exact: true }),
  ).toHaveValue('featured')
  await page
    .getByRole('button', { name: 'Página anterior', exact: true })
    .click()
  await expectItems(
    page,
    initialData.items.map((nft) => nft.name),
  )
  expect(new URL(page.url()).searchParams.get('page') ?? '1').toBe('1')
})

test('ordenação de preço usa valores ETH precisos nas duas direções', async ({
  page,
}) => {
  const response = catalogResponse(page, { sort: 'price-asc' })
  await page.goto('/?sort=price-asc')
  expect((await response).status()).toBe(200)
  const list = page.getByRole('list', { name: 'NFTs disponíveis', exact: true })
  await expect(list.getByRole('listitem')).toHaveCount(8)
  const ascending = (await list.getByTestId('nft-price').allTextContents()).map(
    displayedWei,
  )
  expect(ascending).toHaveLength(8)
  expect(ascending).toContain(125000000000000001n)
  for (let index = 1; index < ascending.length; index += 1) {
    expect(ascending[index]).toBeGreaterThanOrEqual(ascending[index - 1])
  }

  await page
    .getByRole('combobox', { name: 'Ordenar por', exact: true })
    .selectOption('price-desc')
  const descendingResponse = catalogResponse(page, { sort: 'price-desc' })
  await page
    .getByRole('button', { name: 'Aplicar filtros', exact: true })
    .click()
  const descendingResult = await descendingResponse
  expect(descendingResult.status()).toBe(200)
  const descendingData: NftListResponse = await descendingResult.json()
  await expectItems(
    page,
    descendingData.items.map((nft) => nft.name),
  )
  const descending = (
    await list.getByTestId('nft-price').allTextContents()
  ).map(displayedWei)
  expect(descending).toHaveLength(8)
  expect(descending[0]).toBeGreaterThan(ascending[0])
  for (let index = 1; index < descending.length; index += 1) {
    expect(descending[index]).toBeLessThanOrEqual(descending[index - 1])
  }
})

test('detalhe funciona por acesso direto e trata NFT inexistente', async ({
  page,
}) => {
  const detail = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/nfts/nft-001',
  )
  await page.goto('/nfts/nft-001')
  expect((await detail).status()).toBe(200)
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Chromatic Drift',
      exact: true,
    }),
  ).toBeVisible()

  const missing = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/nfts/inexistente',
  )
  await page.goto('/nfts/inexistente')
  expect((await missing).status()).toBe(404)
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'NFT não encontrado',
      exact: true,
    }),
  ).toBeVisible()
  await page
    .getByRole('link', { name: 'Voltar ao catálogo', exact: true })
    .click()
  await expect(
    page
      .getByRole('list', { name: 'NFTs disponíveis', exact: true })
      .getByRole('listitem'),
  ).toHaveCount(8)
})

test('busca sem resultado permite limpar os filtros e recuperar o catálogo', async ({
  page,
}) => {
  const empty = catalogResponse(page, { q: 'nft-que-nao-existe' })
  await page.goto('/?q=nft-que-nao-existe')
  const data: NftListResponse = await (await empty).json()
  expect(data.total).toBe(0)
  await expect(
    page.getByRole('heading', {
      level: 2,
      name: 'Nenhum NFT encontrado',
      exact: true,
    }),
  ).toBeVisible()

  const recovered = catalogResponse(page)
  await page
    .getByRole('form', { name: 'Filtros do catálogo', exact: true })
    .getByRole('button', { name: 'Limpar filtros', exact: true })
    .click()
  expect((await recovered).status()).toBe(200)
  await expectItems(page, [
    'Chromatic Drift',
    'Quiet Geometry',
    'Echoes of Tomorrow',
    'Solar Bloom',
    'Blue Hour',
    'Analog Dreams',
    'Infinite Garden',
    'Still in Motion',
  ])
  expect(new URL(page.url()).searchParams.get('q') ?? '').toBe('')
})

test('cenário vazio determinístico apresenta estado vazio sem cards', async ({
  page,
}) => {
  const response = catalogResponse(page)
  await page.goto('/?mockScenario=empty')
  const data: NftListResponse = await (await response).json()
  expect(data).toMatchObject({ items: [], total: 0 })
  await expect(
    page.getByRole('heading', {
      level: 2,
      name: 'Nenhum NFT encontrado',
      exact: true,
    }),
  ).toBeVisible()
  await expect(
    page.getByRole('list', { name: 'NFTs disponíveis', exact: true }),
  ).toHaveCount(0)
})

test('rede lenta mostra skeleton e preserva resultados após carregar', async ({
  page,
}) => {
  const response = catalogResponse(page)
  await page.goto('/?mockScenario=slow')
  const loading = page.getByRole('status', {
    name: 'Carregando NFTs',
    exact: true,
  })
  await expect(loading).toBeVisible()
  const data: NftListResponse = await (await response).json()
  await expectItems(
    page,
    data.items.map((nft) => nft.name),
  )
  await expect(loading).toBeHidden()
})

test('falha HTTP permite nova tentativa e recuperação no cenário padrão', async ({
  page,
}) => {
  const failure = catalogResponse(page)
  await page.goto('/?mockScenario=catalog-error')
  expect((await failure).status()).toBe(503)
  const error = page.getByRole('heading', {
    level: 2,
    name: 'Não foi possível carregar os NFTs',
    exact: true,
  })
  await expect(error).toBeVisible()
  const retry = catalogResponse(page)
  await page
    .getByRole('button', { name: 'Tentar novamente', exact: true })
    .click()
  expect((await retry).status()).toBe(503)
  await expect(error).toBeVisible()

  const recovery = catalogResponse(page)
  await page.goto('/?mockScenario=default')
  const data: NftListResponse = await (await recovery).json()
  await expectItems(
    page,
    data.items.map((nft) => nft.name),
  )
})

test('resposta antiga não substitui a busca mais recente', async ({ page }) => {
  const initial = catalogResponse(page)
  await page.goto('/?mockScenario=out-of-order')
  await initial
  await expect(
    page
      .getByRole('list', { name: 'NFTs disponíveis', exact: true })
      .getByRole('listitem'),
  ).toHaveCount(8)
  const shortFinished = catalogRequestCompletion(page, 'a')
  const shortStarted = page.waitForRequest((request) =>
    isCatalogRequest(request, { q: 'a' }),
  )
  const toolbar = page.getByRole('group', {
    name: 'Busca e ordenação do catálogo',
    exact: true,
  })
  await toolbar.getByLabel('Buscar NFTs', { exact: true }).fill('a')
  await page
    .getByRole('button', { name: 'Aplicar filtros', exact: true })
    .click()
  await shortStarted

  await toolbar
    .getByLabel('Buscar NFTs', { exact: true })
    .fill('Quiet Geometry')
  const newest = catalogResponse(page, { q: 'Quiet Geometry' })
  await page
    .getByRole('button', { name: 'Aplicar filtros', exact: true })
    .click()
  const data: NftListResponse = await (await newest).json()
  expect(data.items.map((nft) => nft.name)).toEqual(['Quiet Geometry'])
  await shortFinished
  await expectItems(page, ['Quiet Geometry'])
  await expect(toolbar.getByLabel('Buscar NFTs', { exact: true })).toHaveValue(
    'Quiet Geometry',
  )
  expect(new URL(page.url()).searchParams.get('q')).toBe('Quiet Geometry')
})

test('falha de conexão apresenta feedback e permite recuperar o catálogo', async ({
  page,
}) => {
  const disconnected = page.waitForEvent('requestfailed', {
    predicate: (request) => isCatalogRequest(request),
  })
  await page.goto('/?mockScenario=offline')
  await disconnected
  await expect(
    page.getByRole('heading', {
      level: 2,
      name: 'Não foi possível carregar os NFTs',
      exact: true,
    }),
  ).toBeVisible()

  const recovered = catalogResponse(page)
  await page.goto('/?mockScenario=default')
  const data: NftListResponse = await (await recovered).json()
  await expectItems(
    page,
    data.items.map((nft) => nft.name),
  )
})
