import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import type { Nft, NftListResponse } from '../../src/contracts'

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

function pagination(page: Page) {
  return page.getByRole('navigation', {
    name: 'Paginação do catálogo',
    exact: true,
  })
}

function tab(page: Page, name: string) {
  return page.getByRole('tab', { name, exact: true })
}

async function allNfts(page: Page): Promise<Nft[]> {
  return page.evaluate(async () => {
    const response = await fetch('/api/nfts?pageSize=48')
    if (!response.ok) throw new Error('Não foi possível conferir o catálogo.')
    return (await response.json()).items
  })
}

function isNewRelease(nft: Nft) {
  const reference = Date.parse('2026-10-30T00:00:00.000Z')
  const listedAt = Date.parse(nft.listedAt ?? '')
  return (
    listedAt >= reference - 30 * 24 * 60 * 60 * 1000 && listedAt <= reference
  )
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

test('paginação numerada marca a página atual, permite salto direto e respeita limites e histórico', async ({
  page,
}) => {
  const initial = await openCatalog(page)
  const pages = Math.ceil(initial.total / initial.pageSize)
  expect(pages).toBeGreaterThan(1)
  const nav = pagination(page)
  await expect(
    nav.getByRole('button', { name: 'Página 1', exact: true }),
  ).toHaveAttribute('aria-current', 'page')
  await expect(
    nav.getByRole('button', { name: 'Página anterior', exact: true }),
  ).toHaveCount(0)
  for (let number = 1; number <= pages; number += 1)
    await expect(
      nav.getByRole('button', { name: `Página ${number}`, exact: true }),
    ).toBeVisible()
  await expect(
    nav.getByRole('button', { name: `Página ${pages + 1}`, exact: true }),
  ).toHaveCount(0)

  const lastPage = catalogResponse(page, { page: String(pages) })
  await nav
    .getByRole('button', { name: `Página ${pages}`, exact: true })
    .click()
  const last: NftListResponse = await (await lastPage).json()
  await expectItems(page, last.items)
  await expect(
    nav.getByRole('button', { name: `Página ${pages}`, exact: true }),
  ).toHaveAttribute('aria-current', 'page')
  await expect(
    nav.getByRole('button', { name: 'Próxima página', exact: true }),
  ).toBeDisabled()
  expect(new URL(page.url()).searchParams.get('page')).toBe(String(pages))

  const restored = catalogResponse(page, { page: String(pages) })
  await page.reload()
  expect((await restored).status()).toBe(200)
  await expectItems(page, last.items)
  await expect(
    nav.getByRole('button', { name: `Página ${pages}`, exact: true }),
  ).toHaveAttribute('aria-current', 'page')
  await page.goBack()
  await expectItems(page, initial.items)
  await expect(
    nav.getByRole('button', { name: 'Página 1', exact: true }),
  ).toHaveAttribute('aria-current', 'page')
  await page.goForward()
  await expectItems(page, last.items)
  const previous = catalogResponse(page, { page: String(pages - 1) })
  await nav
    .getByRole('button', { name: 'Página anterior', exact: true })
    .click()
  const previousData: NftListResponse = await (await previous).json()
  await expectItems(page, previousData.items)
  await expect(
    nav.getByRole('button', { name: `Página ${pages - 1}`, exact: true }),
  ).toHaveAttribute('aria-current', 'page')
})

test('um resultado e catálogo vazio não criam páginas fictícias nem habilitam avançar', async ({
  page,
}) => {
  const single = await openCatalog(page, { q: 'Chromatic Drift' })
  expect(single.total).toBe(1)
  const nav = pagination(page)
  await expect(
    nav.getByRole('button', { name: 'Página 1', exact: true }),
  ).toHaveAttribute('aria-current', 'page')
  await expect(
    nav.getByRole('button', { name: 'Página 2', exact: true }),
  ).toHaveCount(0)
  await expect(
    nav.getByRole('button', { name: 'Próxima página', exact: true }),
  ).toBeDisabled()
  const response = catalogResponse(page, { q: 'sem-obra-correspondente' })
  await page
    .getByRole('searchbox', { name: 'Buscar NFTs', exact: true })
    .fill('sem-obra-correspondente')
  await page
    .getByRole('button', { name: 'Aplicar filtros', exact: true })
    .click()
  const empty: NftListResponse = await (await response).json()
  expect(empty.total).toBe(0)
  await expect(
    page.getByRole('heading', { name: 'Nenhum NFT encontrado', exact: true }),
  ).toBeVisible()
  await expect(nav).toHaveCount(0)
})

test('abas consultam lançamentos recentes e popularidade e restauram seleção, URL e histórico', async ({
  page,
}) => {
  await openCatalog(page)
  const baseline = await allNfts(page)
  await expect(tab(page, 'Todos os NFTs')).toHaveAttribute(
    'aria-selected',
    'true',
  )
  const newResponse = catalogResponse(page, { feed: 'new' })
  await tab(page, 'Novos lançamentos').click()
  const recent: NftListResponse = await (await newResponse).json()
  const expectedRecent = baseline.filter(isNewRelease)
  expect(expectedRecent.length).toBeGreaterThan(0)
  expect(expectedRecent.length).toBeLessThan(baseline.length)
  expect(recent.total).toBe(expectedRecent.length)
  expect(recent.items.map((nft) => nft.id)).toEqual(
    expectedRecent.slice(0, recent.pageSize).map((nft) => nft.id),
  )
  await expectItems(page, recent.items)
  await expect(tab(page, 'Novos lançamentos')).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(page.getByRole('tabpanel')).toHaveAttribute(
    'aria-labelledby',
    'catalog-tab-new',
  )
  expect(new URL(page.url()).searchParams.get('feed')).toBe('new')

  const trendingResponse = catalogResponse(page, {
    feed: 'trending',
    sort: 'popular',
  })
  await tab(page, 'Em alta').click()
  const trending: NftListResponse = await (await trendingResponse).json()
  const expectedTrending = baseline
    .filter((nft) => (nft.popularityScore ?? 0) >= 70)
    .sort(
      (left, right) =>
        (right.popularityScore ?? 0) - (left.popularityScore ?? 0) ||
        left.id.localeCompare(right.id),
    )
  expect(expectedTrending.length).toBeGreaterThan(0)
  expect(expectedTrending.length).toBeLessThan(baseline.length)
  expect(trending.total).toBe(expectedTrending.length)
  expect(trending.items.map((nft) => nft.id)).toEqual(
    expectedTrending.slice(0, trending.pageSize).map((nft) => nft.id),
  )
  await expectItems(page, trending.items)
  await expect(tab(page, 'Em alta')).toHaveAttribute('aria-selected', 'true')
  await expect(
    page.getByRole('combobox', { name: 'Ordenar por', exact: true }),
  ).toHaveValue('popular')
  const restored = catalogResponse(page, { feed: 'trending', sort: 'popular' })
  await page.reload()
  expect((await restored).status()).toBe(200)
  await expectItems(page, trending.items)
  await expect(tab(page, 'Em alta')).toHaveAttribute('aria-selected', 'true')
  await page.goBack()
  await expect(tab(page, 'Novos lançamentos')).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expectItems(page, recent.items)
  await page.goForward()
  await expect(tab(page, 'Em alta')).toHaveAttribute('aria-selected', 'true')
  await expectItems(page, trending.items)
})

test('trocar aba preserva filtros e ordenação explícita, reinicia a página e mantém o feed ao aplicar', async ({
  page,
}) => {
  const search = {
    q: 'a',
    network: 'polygon',
    minPrice: '0',
    maxPrice: '3',
    sort: 'name',
  }
  const initial = await openCatalog(page, { ...search, page: '2' })
  expect(initial.total).toBeGreaterThan(initial.pageSize)
  const selected = { ...search, feed: 'new', page: '1' }
  const newResponse = catalogResponse(page, selected)
  await tab(page, 'Novos lançamentos').click()
  const recent: NftListResponse = await (await newResponse).json()
  expect(recent.total).toBeGreaterThan(0)
  expect(
    recent.items.every(
      (nft) => nft.network === search.network && isNewRelease(nft),
    ),
  ).toBe(true)
  expect(recent.items.map((nft) => nft.name)).toEqual(
    recent.items
      .map((nft) => nft.name)
      .sort((left, right) => left.localeCompare(right, 'en')),
  )
  await expectItems(page, recent.items)
  for (const [key, value] of Object.entries(selected))
    expect(
      new URL(page.url()).searchParams.get(key) ??
        (key === 'page' ? '1' : null),
    ).toBe(value)
  const sort = page.getByRole('combobox', { name: 'Ordenar por', exact: true })
  await expect(sort).toHaveValue('name')
  await sort.selectOption('price-desc')
  const sortedResponse = catalogResponse(page, {
    ...selected,
    sort: 'price-desc',
  })
  await page
    .getByRole('button', { name: 'Aplicar filtros', exact: true })
    .click()
  const sorted: NftListResponse = await (await sortedResponse).json()
  await expectItems(page, sorted.items)
  expect(new URL(page.url()).searchParams.get('feed')).toBe('new')
  await expect(tab(page, 'Novos lançamentos')).toHaveAttribute(
    'aria-selected',
    'true',
  )
  const allResponse = catalogResponse(page, {
    ...search,
    sort: 'price-desc',
    page: '1',
  })
  await tab(page, 'Todos os NFTs').click()
  const all: NftListResponse = await (await allResponse).json()
  await expectItems(page, all.items)
  expect(new URL(page.url()).searchParams.has('feed')).toBe(false)
  await expect(sort).toHaveValue('price-desc')
})

test('abas usam setas, Home e End com foco e seleção acessíveis', async ({
  page,
}) => {
  await openCatalog(page)
  const all = tab(page, 'Todos os NFTs')
  const recent = tab(page, 'Novos lançamentos')
  const trending = tab(page, 'Em alta')
  await expect(all).toHaveAttribute('aria-controls', 'catalog-results')
  await all.focus()
  await all.press('ArrowRight')
  await expect(recent).toBeFocused()
  await expect(recent).toHaveAttribute('aria-selected', 'true')
  expect(new URL(page.url()).searchParams.get('feed')).toBe('new')
  await recent.press('End')
  await expect(trending).toBeFocused()
  await expect(trending).toHaveAttribute('aria-selected', 'true')
  expect(new URL(page.url()).searchParams.get('feed')).toBe('trending')
  await trending.press('Home')
  await expect(all).toBeFocused()
  await expect(all).toHaveAttribute('aria-selected', 'true')
  expect(new URL(page.url()).searchParams.has('feed')).toBe(false)
  await all.press('ArrowLeft')
  await expect(trending).toBeFocused()
  await expect(trending).toHaveAttribute('aria-selected', 'true')
  expect(new URL(page.url()).searchParams.get('feed')).toBe('trending')
})
