import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

const demoPassword = 'Demo123!'

async function mockControl(page: Page, path: string, body?: unknown) {
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

function responseFor(page: Page, method: string, path: string) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === method &&
      new URL(response.url()).pathname === `/api${path}`,
  )
}

async function login(
  page: Page,
  password = demoPassword,
  returnTo = '/profile',
) {
  await page.goto(`/login?${new URLSearchParams({ returnTo })}`)
  const form = page.getByRole('form', { name: 'Entrar', exact: true })
  await form
    .getByRole('textbox', { name: 'E-mail', exact: true })
    .fill('maya@kurio.test')
  await form.getByLabel('Senha', { exact: true }).fill(password)
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

async function fillWallet(form: Locator, role: 'primary' | 'secondary') {
  await form
    .getByRole('textbox', { name: 'Nome de exibição', exact: true })
    .fill(role === 'primary' ? 'Maya principal' : 'Maya reserva')
  await form
    .getByRole('textbox', { name: 'Apelido da carteira', exact: true })
    .fill(role === 'primary' ? 'Coleção principal' : 'Coleção reserva')
  await form
    .getByRole('combobox', { name: 'Rede', exact: true })
    .selectOption(role === 'primary' ? 'ethereum' : 'sepolia')
  await form
    .getByRole('textbox', { name: 'Nome do perfil', exact: true })
    .fill('maya')
  await form
    .getByRole('textbox', { name: 'Endereço da carteira', exact: true })
    .fill(role === 'primary' ? `0x${'a'.repeat(40)}` : `0x${'b'.repeat(40)}`)
  await form
    .getByRole('textbox', { name: 'Endereço secundário', exact: true })
    .fill('')
  await form
    .getByRole('combobox', { name: 'Tipo de carteira', exact: true })
    .selectOption('metamask')
  await form
    .getByRole('textbox', { name: 'Código de indicação', exact: true })
    .fill('KURIO2026')
  await form
    .getByRole('textbox', { name: 'E-mail', exact: true })
    .fill('maya@kurio.test')
  await form
    .getByRole('textbox', { name: 'Nome ENS', exact: true })
    .fill(role === 'primary' ? 'maya.eth' : 'maya-reserva.eth')
}

test.beforeEach(async ({ page }) => {
  await page.goto('/login')
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Entre na sua conta',
      exact: true,
    }),
  ).toBeVisible()
  await mockControl(page, 'reset')
  await page.reload()
})

test('perfil valida campos, trata falha e persiste apenas alterações confirmadas', async ({
  page,
}) => {
  await login(page)
  const form = page.getByRole('form', { name: 'Dados do perfil', exact: true })
  const name = form.getByRole('textbox', {
    name: 'Nome de exibição',
    exact: true,
  })
  await expect(name).toHaveValue('Maya Silva')
  await name.fill('')
  await form.getByRole('button', { name: 'Salvar perfil', exact: true }).click()
  await expect(name).toHaveAttribute('aria-invalid', 'true')
  const descriptionId = await name.getAttribute('aria-describedby')
  expect(descriptionId).toBeTruthy()
  await expect(page.locator(`[id="${descriptionId}"]`)).toBeVisible()

  await name.fill('Maya Colecionadora')
  await form
    .getByRole('textbox', { name: 'Nome de usuário', exact: true })
    .fill('maya_art')
  await form
    .getByRole('textbox', { name: 'E-mail', exact: true })
    .fill('theo@kurio.test')
  const conflict = responseFor(page, 'PATCH', '/profile')
  await form.getByRole('button', { name: 'Salvar perfil', exact: true }).click()
  expect((await conflict).status()).toBe(409)
  await expect(form.getByRole('alert')).toBeVisible()

  await form
    .getByRole('textbox', { name: 'E-mail', exact: true })
    .fill('maya@kurio.test')
  await form
    .getByRole('textbox', { name: 'Nome ENS', exact: true })
    .fill('maya-art.eth')
  await form
    .getByRole('textbox', { name: 'Apelido da carteira', exact: true })
    .fill('Minha carteira de arte')
  await form
    .getByRole('textbox', { name: 'Biografia', exact: true })
    .fill('Arte, música e fotografia digital.')
  await mockControl(page, 'scenario', { name: 'profile-error' })
  const failure = responseFor(page, 'PATCH', '/profile')
  await form.getByRole('button', { name: 'Salvar perfil', exact: true }).click()
  expect((await failure).status()).toBe(503)
  await expect(form.getByRole('alert')).toBeVisible()
  await mockControl(page, 'scenario', { name: 'default' })
  const saved = responseFor(page, 'PATCH', '/profile')
  await form.getByRole('button', { name: 'Salvar perfil', exact: true }).click()
  expect((await saved).status()).toBe(200)
  await expect(form.getByRole('status')).toContainText('Perfil atualizado.')
  await page.reload()
  await expect(name).toHaveValue('Maya Colecionadora')
  await expect(
    form.getByRole('textbox', { name: 'Nome de usuário', exact: true }),
  ).toHaveValue('maya_art')
  await expect(
    form.getByRole('textbox', { name: 'Nome ENS', exact: true }),
  ).toHaveValue('maya-art.eth')
  await expect(
    form.getByRole('textbox', { name: 'Apelido da carteira', exact: true }),
  ).toHaveValue('Minha carteira de arte')
  await expect(
    form.getByRole('textbox', { name: 'Biografia', exact: true }),
  ).toHaveValue('Arte, música e fotografia digital.')
  const width = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }))
  expect(width.content).toBeLessThanOrEqual(width.viewport)
})

test('avatar raster é persistido e removido, enquanto SVG é rejeitado', async ({
  page,
}) => {
  await login(page)
  const upload = page.getByLabel('Avatar', { exact: true })
  await upload.setInputFiles({
    name: 'avatar.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    ),
  })
  await expect(page.getByRole('alert')).toContainText(/PNG|JPEG|WebP|imagem/i)
  await upload.setInputFiles(resolve('prototype', 'Mobile', 'Login.png'))
  const saved = responseFor(page, 'PUT', '/profile/avatar')
  await page.getByRole('button', { name: 'Salvar avatar', exact: true }).click()
  expect((await saved).status()).toBe(200)
  const avatar = page.getByRole('main').getByRole('img', {
    name: 'Avatar de Maya Silva',
    exact: true,
  })
  await expect(avatar).toHaveAttribute('src', /^data:image\/png;base64,/)
  await page.reload()
  await expect(avatar).toHaveAttribute('src', /^data:image\/png;base64,/)
  const removed = responseFor(page, 'DELETE', '/profile/avatar')
  await page
    .getByRole('button', { name: 'Remover avatar', exact: true })
    .click()
  expect((await removed).status()).toBe(200)
  await expect(
    page.getByRole('img', { name: 'Sem avatar', exact: true }),
  ).toBeVisible()
  await page.reload()
  await expect(
    page.getByRole('img', { name: 'Sem avatar', exact: true }),
  ).toBeVisible()
})

test('alteração de senha valida confirmação e senha atual sem persistir texto em claro', async ({
  page,
}) => {
  await login(page)
  const form = page.getByRole('form', { name: 'Alterar senha', exact: true })
  await form.locator('input[name=currentPassword]').fill('SenhaIncorreta123!')
  await form.locator('input[name=newPassword]').fill('NovaSenha456!')
  await form.locator('input[name=confirmation]').fill('Diferente456!')
  await form.getByRole('button', { name: 'Alterar senha', exact: true }).click()
  await expect(form.locator('input[name=confirmation]')).toHaveAttribute(
    'aria-invalid',
    'true',
  )
  await form.locator('input[name=confirmation]').fill('NovaSenha456!')
  const refused = responseFor(page, 'PUT', '/profile/password')
  await form.getByRole('button', { name: 'Alterar senha', exact: true }).click()
  expect((await refused).status()).toBe(422)
  await expect(form.getByRole('alert')).toBeVisible()
  await form.locator('input[name=currentPassword]').fill(demoPassword)
  const saved = responseFor(page, 'PUT', '/profile/password')
  await form.getByRole('button', { name: 'Alterar senha', exact: true }).click()
  expect((await saved).status()).toBe(204)
  await expect(form.getByRole('status')).toContainText('Senha alterada.')
  const persisted = await page.evaluate(() =>
    Object.values(localStorage).join('\n'),
  )
  expect(persisted).not.toContain(demoPassword)
  expect(persisted).not.toContain('NovaSenha456!')
  await logout(page)

  await page.goto('/login')
  const signIn = page.getByRole('form', { name: 'Entrar', exact: true })
  await signIn
    .getByRole('textbox', { name: 'E-mail', exact: true })
    .fill('maya@kurio.test')
  await signIn.getByLabel('Senha', { exact: true }).fill(demoPassword)
  const oldPassword = responseFor(page, 'POST', '/auth/login')
  await signIn.getByRole('button', { name: 'Entrar', exact: true }).click()
  expect((await oldPassword).status()).toBe(401)
  await expect(signIn.getByRole('alert')).toBeVisible()
  await login(page, 'NovaSenha456!')
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Perfil do colecionador',
      exact: true,
    }),
  ).toBeVisible()
})

test('carteiras principal e secundária validam endereço e persistem cadastro e edição', async ({
  page,
}) => {
  await login(page, demoPassword, '/wallets')
  const primary = page.getByRole('form', {
    name: 'Carteira principal',
    exact: true,
  })
  const secondary = page.getByRole('form', {
    name: 'Carteira secundária',
    exact: true,
  })
  await fillWallet(primary, 'primary')
  await primary
    .getByRole('textbox', { name: 'Endereço da carteira', exact: true })
    .fill('endereco-invalido')
  await primary
    .getByRole('button', { name: 'Salvar carteira', exact: true })
    .click()
  await expect(
    primary.getByRole('textbox', { name: 'Endereço da carteira', exact: true }),
  ).toHaveAttribute('aria-invalid', 'true')
  await primary
    .getByRole('textbox', { name: 'Endereço da carteira', exact: true })
    .fill(`0x${'a'.repeat(40)}`)
  const updated = page.waitForResponse(
    (response) =>
      response.request().method() === 'PUT' &&
      /^\/api\/wallets\/[^/]+$/.test(new URL(response.url()).pathname),
  )
  await primary
    .getByRole('button', { name: 'Salvar carteira', exact: true })
    .click()
  expect((await updated).status()).toBe(200)
  await expect(primary.getByRole('status')).toContainText('Carteira salva.')

  await fillWallet(secondary, 'secondary')
  const created = responseFor(page, 'POST', '/wallets')
  await secondary
    .getByRole('button', { name: 'Salvar carteira', exact: true })
    .click()
  expect((await created).status()).toBe(201)
  await expect(secondary.getByRole('status')).toContainText('Carteira salva.')
  await page.reload()
  await expect(
    primary.getByRole('textbox', { name: 'Apelido da carteira', exact: true }),
  ).toHaveValue('Coleção principal')
  await expect(
    primary.getByRole('textbox', { name: 'Endereço da carteira', exact: true }),
  ).toHaveValue(`0x${'a'.repeat(40)}`)
  await expect(
    secondary.getByRole('textbox', {
      name: 'Apelido da carteira',
      exact: true,
    }),
  ).toHaveValue('Coleção reserva')
  await expect(
    secondary.getByRole('combobox', { name: 'Rede', exact: true }),
  ).toHaveValue('sepolia')
  const width = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }))
  expect(width.content).toBeLessThanOrEqual(width.viewport)
})

test('conexão simulada de carteira representa recusa, conexão e desconexão', async ({
  page,
}) => {
  await login(page, demoPassword, '/wallets')
  const primary = page.getByRole('form', {
    name: 'Carteira principal',
    exact: true,
  })
  await expect(
    primary.getByRole('button', { name: 'Conectar carteira', exact: true }),
  ).toBeVisible()
  await mockControl(page, 'scenario', { name: 'wallet-refused' })
  const refused = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      /\/api\/wallets\/[^/]+\/connections$/.test(
        new URL(response.url()).pathname,
      ),
  )
  await primary
    .getByRole('button', { name: 'Conectar carteira', exact: true })
    .click()
  expect((await refused).status()).toBe(400)
  await expect(primary.getByRole('alert')).toContainText(/recus/i)
  await expect(
    primary.getByRole('button', { name: 'Desconectar carteira', exact: true }),
  ).toHaveCount(0)

  await mockControl(page, 'scenario', { name: 'default' })
  const connected = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      /\/api\/wallets\/[^/]+\/connections$/.test(
        new URL(response.url()).pathname,
      ),
  )
  await primary
    .getByRole('button', { name: 'Conectar carteira', exact: true })
    .click()
  expect((await connected).status()).toBe(201)
  await expect(primary.getByRole('status')).toContainText('Carteira conectada.')
  const disconnected = page.waitForResponse(
    (response) =>
      response.request().method() === 'DELETE' &&
      /\/api\/wallet-connections\/[^/]+$/.test(
        new URL(response.url()).pathname,
      ),
  )
  await primary
    .getByRole('button', { name: 'Desconectar carteira', exact: true })
    .click()
  expect((await disconnected).status()).toBe(204)
  await expect(primary.getByRole('status')).toContainText(
    'Carteira desconectada.',
  )
  await expect(
    primary.getByRole('button', { name: 'Conectar carteira', exact: true }),
  ).toBeVisible()
})
