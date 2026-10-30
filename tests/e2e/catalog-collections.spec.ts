import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import type { NftListResponse } from '../../src/contracts'

function catalogResponse(page: Page, search: Record<string, string>) {
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

test('selecionar uma coleção aplica o filtro imediatamente e atualiza cards, URL e refresh', async ({
  page,
}) => {
  await page.goto('/')
  const cards = page
    .getByRole('list', { name: 'NFTs disponíveis', exact: true })
    .getByRole('listitem')
  await expect(cards).toHaveCount(8)
  const filters = page.getByRole('form', {
    name: 'Filtros do catálogo',
    exact: true,
  })
  const response = catalogResponse(page, { category: 'photography' })
  await filters.getByText('Fotografia', { exact: true }).click()
  await expect(page).toHaveURL(/category=photography/)
  const data: NftListResponse = await (await response).json()
  expect(data.total).toBe(8)
  expect(data.items.every((nft) => nft.category === 'photography')).toBe(true)
  await expect(cards).toHaveCount(data.items.length)
  for (const [index, nft] of data.items.entries())
    await expect(
      cards.nth(index).getByRole('heading', { name: nft.name, exact: true }),
    ).toBeVisible()
  expect(new URL(page.url()).searchParams.has('minPrice')).toBe(false)
  expect(new URL(page.url()).searchParams.has('maxPrice')).toBe(false)
  const refreshed = catalogResponse(page, { category: 'photography' })
  await page.reload()
  expect((await refreshed).status()).toBe(200)
  await expect(
    filters.getByRole('radio', { name: /^Fotografia \(/ }),
  ).toBeChecked()
})

test('coleção combina com busca, preço, rede e ordenação e reinicia a página sem exigir Aplicar', async ({
  page,
}) => {
  const initial = {
    network: 'polygon',
    minPrice: '0',
    maxPrice: '3',
    q: 'a',
    sort: 'name',
    page: '2',
  }
  await page.goto(`/?${new URLSearchParams(initial)}`)
  const filters = page.getByRole('form', {
    name: 'Filtros do catálogo',
    exact: true,
  })
  await expect(
    page.getByRole('list', { name: 'NFTs disponíveis' }),
  ).toBeVisible()
  const response = catalogResponse(page, {
    ...initial,
    category: 'music',
    page: '1',
    collection: 'Still Life',
  })
  await page.getByLabel('Coleção', { exact: true }).fill('Still Life')
  await filters.getByText('Música', { exact: true }).click()
  await expect(page).toHaveURL(/category=music/)
  const data: NftListResponse = await (await response).json()
  expect(data.total).toBeGreaterThan(0)
  expect(
    data.items.every(
      (nft) =>
        nft.category === 'music' &&
        nft.network === 'polygon' &&
        nft.collection === 'Still Life',
    ),
  ).toBe(true)
  for (const [key, value] of Object.entries({
    ...initial,
    category: 'music',
    collection: 'Still Life',
  }))
    expect(
      new URL(page.url()).searchParams.get(key) ??
        (key === 'page' ? '1' : null),
    ).toBe(key === 'page' ? '1' : value)
  await filters
    .getByRole('button', { name: 'Limpar filtros', exact: true })
    .click()
  await expect(page).toHaveURL('/')
  await expect(
    filters.getByRole('radio', { name: /^Música \(/ }),
  ).not.toBeChecked()
})
