import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import type { Nft, NftListResponse, NftNetwork } from '../../src/contracts'

function catalogResponse(page: Page, search: Record<string, string> = {}) {
  return page.waitForResponse((response) => {
    const url = new URL(response.url())
    return (
      response.request().method() === 'GET' &&
      url.pathname === '/api/nfts' &&
      Object.entries(search).every(
        ([key, value]) => url.searchParams.get(key) === value,
      )
    )
  })
}

function filters(page: Page) {
  return page.getByRole('form', { name: 'Filtros do catálogo', exact: true })
}

function toolbar(page: Page) {
  return page.getByRole('group', {
    name: 'Busca e ordenação do catálogo',
    exact: true,
  })
}

async function expectItems(page: Page, items: Nft[]) {
  const cards = page
    .getByRole('list', { name: 'NFTs disponíveis', exact: true })
    .getByRole('listitem')
  await expect(cards).toHaveCount(items.length)
  for (const [index, nft] of items.entries())
    await expect(
      cards.nth(index).getByRole('heading', { name: nft.name, exact: true }),
    ).toBeVisible()
}

async function openCatalog(page: Page, search: Record<string, string> = {}) {
  const response = catalogResponse(page, search)
  await page.goto(`/?${new URLSearchParams(search)}`)
  const result = await response
  expect(result.status()).toBe(200)
  const data: NftListResponse = await result.json()
  await expectItems(page, data.items)
  return data
}

async function allNfts(page: Page): Promise<Nft[]> {
  return page.evaluate(async () => {
    const response = await fetch('/api/nfts?pageSize=48')
    if (!response.ok) throw new Error('Não foi possível conferir o catálogo.')
    return (await response.json()).items
  })
}

function wei(value: string) {
  const [whole, fraction = ''] = value.split('.')
  return BigInt(whole + fraction.padEnd(18, '0'))
}

function lowestPrice(nft: Nft) {
  return nft.editions
    .filter((edition) => edition.available > 0)
    .reduce<bigint | null>((lowest, edition) => {
      const price = wei(edition.priceEth)
      return lowest === null || price < lowest ? price : lowest
    }, null)
}

function within(nft: Nft, minimum: string, maximum: string) {
  const price = lowestPrice(nft)
  return price !== null && price >= wei(minimum) && price <= wei(maximum)
}

function networkCounts(items: Nft[]) {
  return Object.fromEntries(
    (['ethereum', 'polygon', 'solana'] as NftNetwork[]).map((network) => [
      network,
      items.filter((nft) => nft.network === network).length,
    ]),
  )
}

/** Use the native range keyboard interaction, not a setter in app state. */
async function setRangeWithKeyboard(slider: Locator, cents: number) {
  await slider.focus()
  await slider.press('Home')
  const minimum = Number((await slider.getAttribute('min')) || 0)
  const maximum = Number((await slider.getAttribute('max')) || 1600)
  const pageStep = Math.max(1, Math.floor((maximum - minimum) / 10))
  let current = Number(await slider.inputValue())
  while (current + pageStep <= cents) {
    await slider.press('PageUp')
    const updated = Number(await slider.inputValue())
    if (updated === current) break
    current = updated
  }
  while (current < cents) {
    await slider.press('ArrowRight')
    const updated = Number(await slider.inputValue())
    if (updated === current) break
    current = updated
  }
  while (current > cents) {
    await slider.press('ArrowLeft')
    const updated = Number(await slider.inputValue())
    if (updated === current) break
    current = updated
  }
  await expect(slider).toHaveValue(String(cents))
}

test.beforeEach(async ({ page }) => {
  await page.goto('/login')
  await expect(
    page.getByRole('heading', { name: 'Entre na sua conta', exact: true }),
  ).toBeVisible()
  const status = await page.evaluate(async () => {
    const response = await fetch('/api/__mock/reset', { method: 'POST' })
    return response.status
  })
  expect(status).toBe(204)
})

test('categoria, rede e faixa combinam com ordenação e restauram URL, refresh e histórico', async ({
  page,
}) => {
  await openCatalog(page, { page: '2' })
  const baseline = await allNfts(page)
  const upper = filters(page).getByRole('slider', {
    name: 'Preço máximo em ETH',
    exact: true,
  })
  const lower = filters(page).getByRole('slider', {
    name: 'Preço mínimo em ETH',
    exact: true,
  })
  await setRangeWithKeyboard(upper, 160)
  await setRangeWithKeyboard(lower, 20)
  await filters(page).getByText('Arte digital', { exact: true }).click()
  await toolbar(page)
    .getByRole('combobox', { name: 'Ordenar por', exact: true })
    .selectOption('name')
  const selected = {
    category: 'art',
    network: 'polygon',
    minPrice: '0.2',
    maxPrice: '1.6',
    sort: 'name',
  }
  const response = catalogResponse(page, selected)
  await filters(page).getByText('Polygon', { exact: true }).click()
  const data: NftListResponse = await (await response).json()
  const expected = baseline
    .filter(
      (nft) =>
        nft.category === 'art' &&
        nft.network === 'polygon' &&
        within(nft, '0.2', '1.6'),
    )
    .sort((left, right) => left.name.localeCompare(right.name, 'en'))
  expect(expected.length).toBeGreaterThan(0)
  expect(data.total).toBe(expected.length)
  expect(data.items.map((nft) => nft.id)).toEqual(expected.map((nft) => nft.id))
  expect(data.networkCounts).toEqual(
    networkCounts(
      baseline.filter(
        (nft) => nft.category === 'art' && within(nft, '0.2', '1.6'),
      ),
    ),
  )
  await expectItems(page, data.items)
  for (const [key, value] of Object.entries(selected))
    expect(new URL(page.url()).searchParams.get(key)).toBe(value)
  expect(new URL(page.url()).searchParams.get('page') ?? '1').toBe('1')

  const restored = catalogResponse(page, selected)
  await page.reload()
  expect((await restored).status()).toBe(200)
  await expectItems(page, expected)
  await expect(lower).toHaveValue('20')
  await expect(upper).toHaveValue('160')
  await expect(
    filters(page).getByRole('radio', { name: /^Polygon \(/ }),
  ).toBeChecked()
  await expect(
    toolbar(page).getByRole('combobox', { name: 'Ordenar por', exact: true }),
  ).toHaveValue('name')

  await page.goBack()
  expect(new URL(page.url()).searchParams.get('page')).toBe('2')
  expect(new URL(page.url()).searchParams.has('network')).toBe(false)
  await expect(lower).toHaveValue('2')
  await expect(upper).toHaveValue('1230')
  await page.goForward()
  await expectItems(page, expected)
  await filters(page)
    .getByRole('button', { name: 'Limpar filtros', exact: true })
    .click()
  await expect(page).toHaveURL('/')
  await expect(
    filters(page).getByRole('radio', { name: /^Polygon \(/ }),
  ).not.toBeChecked()
  await expectItems(page, baseline.slice(0, 8))
})

test('range responde ao teclado e só aplica o rascunho ao confirmar, inclusive sem mover os limites', async ({
  page,
}) => {
  await openCatalog(page)
  const baseline = await allNfts(page)
  const lower = filters(page).getByRole('slider', {
    name: 'Preço mínimo em ETH',
    exact: true,
  })
  const upper = filters(page).getByRole('slider', {
    name: 'Preço máximo em ETH',
    exact: true,
  })
  await expect(lower).toHaveValue('2')
  await expect(upper).toHaveValue('1230')
  await lower.focus()
  await lower.press('ArrowRight')
  await upper.focus()
  await upper.press('ArrowLeft')
  await expect(lower).toHaveValue('3')
  await expect(upper).toHaveValue('1229')
  expect(new URL(page.url()).searchParams.has('minPrice')).toBe(false)
  expect(new URL(page.url()).searchParams.has('maxPrice')).toBe(false)
  await expectItems(page, baseline.slice(0, 8))

  const applied = catalogResponse(page, { minPrice: '0.03', maxPrice: '12.29' })
  await filters(page)
    .getByRole('button', { name: 'Aplicar faixa de preço', exact: true })
    .click()
  const data: NftListResponse = await (await applied).json()
  expect(data.total).toBe(
    baseline.filter((nft) => within(nft, '0.03', '12.29')).length,
  )
  expect(new URL(page.url()).searchParams.get('minPrice')).toBe('0.03')
  expect(new URL(page.url()).searchParams.get('maxPrice')).toBe('12.29')
  await filters(page)
    .getByRole('button', { name: 'Limpar filtros', exact: true })
    .click()
  await expect(lower).toHaveValue('2')
  await expect(upper).toHaveValue('1230')
  const defaults = catalogResponse(page, { minPrice: '0.02', maxPrice: '12.3' })
  await filters(page)
    .getByRole('button', { name: 'Aplicar faixa de preço', exact: true })
    .click()
  expect((await defaults).status()).toBe(200)
  expect(new URL(page.url()).searchParams.get('minPrice')).toBe('0.02')
  expect(new URL(page.url()).searchParams.get('maxPrice')).toBe('12.3')
})

test('limites diretos de 18 casas preservam um wei e incluem a edição exatamente no limite', async ({
  page,
}) => {
  const exact = '0.125000000000000001'
  const search = { network: 'ethereum', minPrice: exact, maxPrice: exact }
  const data = await openCatalog(page, search)
  expect(data.total).toBe(1)
  expect(data.items.map((nft) => nft.id)).toEqual(['nft-001'])
  expect(data.items[0].editions[0].priceEth).toBe(exact)
  for (const field of ['minPrice', 'maxPrice'])
    expect(new URL(page.url()).searchParams.get(field)).toBe(exact)
  await toolbar(page)
    .getByRole('button', { name: 'Aplicar filtros', exact: true })
    .click()
  for (const field of ['minPrice', 'maxPrice'])
    expect(new URL(page.url()).searchParams.get(field)).toBe(exact)
  const refreshed = catalogResponse(page, search)
  await page.reload()
  const response = await refreshed
  expect(response.status()).toBe(200)
  const restored: NftListResponse = await response.json()
  expect(restored.total).toBe(1)
  expect(restored.items[0].id).toBe('nft-001')
  await expectItems(page, restored.items)
})

test('API rejeita rede e limites inválidos sem alterar o catálogo', async ({
  page,
}) => {
  await openCatalog(page)
  const invalid: Record<string, string>[] = [
    { network: 'bitcoin' },
    { minPrice: '-1' },
    { minPrice: '1e-3' },
    { minPrice: '0.1234567890123456789' },
    { maxPrice: 'NaN' },
    { minPrice: '2', maxPrice: '1' },
  ]
  const responses = await page.evaluate(async (inputs) => {
    return await Promise.all(
      inputs.map(async (input) => {
        const response = await fetch(`/api/nfts?${new URLSearchParams(input)}`)
        return { status: response.status, body: await response.json() }
      }),
    )
  }, invalid)
  for (const response of responses) {
    expect(response.status).toBe(422)
    expect(response.body.error.code).toBe('validation')
    expect(Object.keys(response.body.error.fields).length).toBeGreaterThan(0)
  }
  const baseline = await allNfts(page)
  expect(baseline).toHaveLength(24)
  await expectItems(page, baseline.slice(0, 8))
})

test('contagens de rede antecedem paginação e trocar a rede volta à primeira página', async ({
  page,
}) => {
  const initial = await openCatalog(page, { network: 'ethereum' })
  const baseline = await allNfts(page)
  const counts = networkCounts(baseline)
  const ethereum = baseline.filter((nft) => nft.network === 'ethereum')
  expect(initial.total).toBe(ethereum.length)
  expect(initial.networkCounts).toEqual(counts)
  expect(initial.total).toBeGreaterThan(initial.pageSize)
  await expect(
    filters(page).getByRole('radio', { name: /^Ethereum \(/ }),
  ).toBeChecked()
  const next = catalogResponse(page, { network: 'ethereum', page: '2' })
  await page
    .getByRole('button', { name: 'Próxima página', exact: true })
    .click()
  const second: NftListResponse = await (await next).json()
  expect(second.networkCounts).toEqual(counts)
  expect(second.total).toBe(initial.total)
  await expectItems(page, ethereum.slice(8, 16))

  const refreshed = catalogResponse(page, { network: 'ethereum', page: '2' })
  await page.reload()
  expect((await refreshed).status()).toBe(200)
  await expectItems(page, ethereum.slice(8, 16))
  const changed = catalogResponse(page, { network: 'solana', page: '1' })
  await filters(page).getByText('Solana', { exact: true }).click()
  const solana: NftListResponse = await (await changed).json()
  const expected = baseline.filter((nft) => nft.network === 'solana')
  expect(solana.total).toBe(expected.length)
  expect(solana.networkCounts).toEqual(counts)
  expect(new URL(page.url()).searchParams.get('page') ?? '1').toBe('1')
  expect(new URL(page.url()).searchParams.has('minPrice')).toBe(false)
  expect(new URL(page.url()).searchParams.has('maxPrice')).toBe(false)
  await expectItems(page, expected)
})
