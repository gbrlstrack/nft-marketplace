import { expect, test } from '@playwright/test'

test('catálogo apresenta título e acesso por teclado ao conteúdo', async ({
  page,
}) => {
  await page.goto('/')

  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Seja dono do futuro da arte digital',
      exact: true,
    }),
  ).toBeVisible()

  const skipLink = page.getByRole('link', {
    name: 'Pular para o conteúdo',
    exact: true,
  })
  await page.keyboard.press('Tab')
  await expect(skipLink).toBeFocused()
  await expect(skipLink).toBeVisible()
  const target = await skipLink.getAttribute('href')
  expect(target).toMatch(/^#[a-zA-Z][\w-]*$/)
  await skipLink.press('Enter')
  await expect(page.locator(target!)).toBeFocused()
})

test('rota inexistente oferece retorno ao catálogo e respeita o histórico', async ({
  page,
}) => {
  await page.goto('/rota-inexistente')

  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Página não encontrada',
      exact: true,
    }),
  ).toBeVisible()
  await page
    .getByRole('link', { name: 'Voltar ao catálogo', exact: true })
    .click()
  await expect(page).toHaveURL('/')
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Seja dono do futuro da arte digital',
      exact: true,
    }),
  ).toBeVisible()

  await page.goBack()
  await expect(page).toHaveURL('/rota-inexistente')
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Página não encontrada',
      exact: true,
    }),
  ).toBeVisible()
})

test('páginas iniciais preservam conteúdo sem overflow horizontal', async ({
  page,
}) => {
  for (const path of ['/', '/rota-inexistente']) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const width = await page.evaluate(() => ({
      content: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth,
    }))
    expect(width.content).toBeLessThanOrEqual(width.viewport)
  }
})

test('menu mobile controla foco e fecha por Escape', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'chromium-mobile',
    'O drawer é apresentado no viewport mobile.',
  )
  await page.goto('/')

  const trigger = page.getByRole('button', { name: 'Abrir menu', exact: true })
  await trigger.click()

  const menu = page.getByRole('dialog', { name: 'Navegação', exact: true })
  await expect(menu).toBeVisible()
  await expect(
    menu.getByRole('link', { name: 'Explorar', exact: true }),
  ).toBeVisible()
  await expect(
    menu.getByRole('button', { name: 'Fechar menu', exact: true }),
  ).toBeVisible()

  for (let index = 0; index < 6; index += 1) {
    await page.keyboard.press('Tab')
    const focusInsideMenu = await menu.evaluate((dialog) =>
      dialog.contains(document.activeElement),
    )
    expect(focusInsideMenu).toBe(true)
  }

  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await expect(trigger).toBeFocused()
})
