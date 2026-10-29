import { expect, test } from '@playwright/test'
import type { Page, Request } from '@playwright/test'

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
  email = 'maya@kurio.test',
  returnTo = '/profile',
) {
  await page.goto(`/login?${new URLSearchParams({ returnTo })}`)
  const form = page.getByRole('form', { name: 'Entrar', exact: true })
  await form.getByRole('textbox', { name: 'E-mail', exact: true }).fill(email)
  await form.getByLabel('Senha', { exact: true }).fill(demoPassword)
  const response = responseFor(page, 'POST', '/auth/login')
  await form.getByRole('button', { name: 'Entrar', exact: true }).click()
  expect((await response).status()).toBe(200)
  await expect(page).toHaveURL(returnTo)
}

async function logout(page: Page) {
  const button = page.getByRole('button', { name: 'Sair', exact: true })
  if (!(await button.isVisible())) {
    await page.getByRole('button', { name: 'Abrir menu', exact: true }).click()
  }
  const response = responseFor(page, 'POST', '/auth/logout')
  await button.click()
  expect((await response).status()).toBe(204)
}

function requestCompletion(page: Page, path: string) {
  return new Promise<void>((resolve) => {
    const finished = (request: Request) => {
      if (
        request.method() !== 'GET' ||
        new URL(request.url()).pathname !== path
      )
        return
      page.off('requestfinished', finished)
      page.off('requestfailed', finished)
      resolve()
    }
    page.on('requestfinished', finished)
    page.on('requestfailed', finished)
  })
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

test('rota privada exige login, trata credenciais inválidas e recupera sessão no refresh', async ({
  page,
}) => {
  await page.goto('/profile')
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Entre na sua conta',
      exact: true,
    }),
  ).toBeVisible()
  expect(new URL(page.url()).searchParams.get('returnTo')).toBe('/profile')
  await expect(
    page.getByRole('heading', { name: 'Perfil do colecionador', exact: true }),
  ).toHaveCount(0)

  const form = page.getByRole('form', { name: 'Entrar', exact: true })
  await form
    .getByRole('textbox', { name: 'E-mail', exact: true })
    .fill('maya@kurio.test')
  await form.getByLabel('Senha', { exact: true }).fill('SenhaErrada123!')
  const invalid = responseFor(page, 'POST', '/auth/login')
  await form.getByRole('button', { name: 'Entrar', exact: true }).click()
  expect((await invalid).status()).toBe(401)
  await expect(form.getByRole('alert')).toBeVisible()

  await form.getByLabel('Senha', { exact: true }).fill(demoPassword)
  const valid = responseFor(page, 'POST', '/auth/login')
  await form.getByRole('button', { name: 'Entrar', exact: true }).click()
  expect((await valid).status()).toBe(200)
  await expect(page).toHaveURL('/profile')
  await expect(
    page
      .getByRole('form', { name: 'Dados do perfil', exact: true })
      .getByRole('textbox', { name: 'E-mail', exact: true }),
  ).toHaveValue('maya@kurio.test')

  const restored = responseFor(page, 'GET', '/auth/session')
  await page.reload()
  expect((await restored).status()).toBe(200)
  await expect(
    page
      .getByRole('form', { name: 'Dados do perfil', exact: true })
      .getByRole('textbox', { name: 'Nome de exibição', exact: true }),
  ).toHaveValue('Maya Silva')
  await logout(page)
  await page.goto('/profile')
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Entre na sua conta',
      exact: true,
    }),
  ).toBeVisible()
})

test('cadastro valida confirmação, trata conflito e autentica nova conta no destino anterior', async ({
  page,
}) => {
  await page.goto('/register?returnTo=%2Fprofile')
  const form = page.getByRole('form', { name: 'Criar perfil', exact: true })
  await form
    .getByRole('textbox', { name: 'Nome de usuário', exact: true })
    .fill('nova_colecao')
  await form
    .getByRole('textbox', { name: 'E-mail', exact: true })
    .fill('maya@kurio.test')
  await form.getByLabel('Senha', { exact: true }).fill(demoPassword)
  await form
    .getByLabel('Confirmar senha', { exact: true })
    .fill('OutraSenha123!')
  await form.getByRole('button', { name: 'Criar perfil', exact: true }).click()
  await expect(
    form.getByLabel('Confirmar senha', { exact: true }),
  ).toHaveAttribute('aria-invalid', 'true')

  await form.getByLabel('Confirmar senha', { exact: true }).fill(demoPassword)
  const conflict = responseFor(page, 'POST', '/auth/register')
  await form.getByRole('button', { name: 'Criar perfil', exact: true }).click()
  expect((await conflict).status()).toBe(409)
  await expect(form.getByRole('alert')).toBeVisible()

  await form
    .getByRole('textbox', { name: 'E-mail', exact: true })
    .fill('nova_colecao@kurio.test')
  const created = responseFor(page, 'POST', '/auth/register')
  await form.getByRole('button', { name: 'Criar perfil', exact: true }).click()
  expect((await created).status()).toBe(201)
  await expect(page).toHaveURL('/profile')
  const profile = page.getByRole('form', {
    name: 'Dados do perfil',
    exact: true,
  })
  await expect(
    profile.getByRole('textbox', { name: 'Nome de usuário', exact: true }),
  ).toHaveValue('nova_colecao')
  await page.reload()
  await expect(
    profile.getByRole('textbox', { name: 'E-mail', exact: true }),
  ).toHaveValue('nova_colecao@kurio.test')
  const persisted = await page.evaluate(() =>
    Object.values(localStorage).join('\n'),
  )
  expect(persisted).not.toContain(demoPassword)
})

for (const returnTo of ['//example.invalid', '/\\example.invalid']) {
  test(`login rejeita destino externo ${JSON.stringify(returnTo)}`, async ({
    page,
  }) => {
    await page.goto(`/login?${new URLSearchParams({ returnTo })}`)
    const form = page.getByRole('form', { name: 'Entrar', exact: true })
    await form
      .getByRole('textbox', { name: 'E-mail', exact: true })
      .fill('maya@kurio.test')
    await form.getByLabel('Senha', { exact: true }).fill(demoPassword)
    const response = responseFor(page, 'POST', '/auth/login')
    await form.getByRole('button', { name: 'Entrar', exact: true }).click()
    expect((await response).status()).toBe(200)
    await expect(page).toHaveURL('/')
  })
}

test('expiração durante edição impede salvar e preserva o destino de retomada', async ({
  page,
}) => {
  await login(page)
  const profile = page.getByRole('form', {
    name: 'Dados do perfil',
    exact: true,
  })
  await expect(
    profile.getByRole('textbox', { name: 'Nome de exibição', exact: true }),
  ).toHaveValue('Maya Silva')
  await profile
    .getByRole('textbox', { name: 'Nome de exibição', exact: true })
    .fill('Alteração sem sessão')
  await mockControl(page, 'session/expire')
  const refused = responseFor(page, 'PATCH', '/profile')
  await profile
    .getByRole('button', { name: 'Salvar perfil', exact: true })
    .click()
  const response = await refused
  expect(response.status()).toBe(401)
  expect(await response.json()).toMatchObject({
    error: { code: 'unauthorized', reason: 'expired' },
  })
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Entre na sua conta',
      exact: true,
    }),
  ).toBeVisible()
  expect(new URL(page.url()).searchParams.get('returnTo')).toBe('/profile')
  await login(page)
  await expect(
    profile.getByRole('textbox', { name: 'Nome de exibição', exact: true }),
  ).toHaveValue('Maya Silva')
})

test('favoritos exigem login, persistem e permanecem isolados ao trocar de usuário', async ({
  page,
}) => {
  await page.goto('/nfts/nft-001')
  await page
    .getByRole('button', { name: 'Adicionar aos favoritos', exact: true })
    .click()
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Entre na sua conta',
      exact: true,
    }),
  ).toBeVisible()
  expect(new URL(page.url()).searchParams.get('returnTo')).toBe('/nfts/nft-001')
  await login(page, 'maya@kurio.test', '/nfts/nft-001')
  const favorite = page.getByRole('button', {
    name: /^(Adicionar aos favoritos|Remover dos favoritos)$/,
  })
  const saved = responseFor(page, 'PUT', '/favorites/nft-001')
  await favorite.click()
  expect((await saved).status()).toBe(200)
  await expect(favorite).toHaveAttribute('aria-pressed', 'true')
  await page.reload()
  await expect(favorite).toHaveAttribute('aria-pressed', 'true')
  await page.goto('/favorites')
  await expect(
    page.getByRole('heading', {
      level: 3,
      name: 'Chromatic Drift',
      exact: true,
    }),
  ).toBeVisible()

  await logout(page)
  await login(page, 'theo@kurio.test', '/favorites')
  await expect(
    page.getByText('Você ainda não tem favoritos', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', {
      level: 3,
      name: 'Chromatic Drift',
      exact: true,
    }),
  ).toHaveCount(0)
  await page.goto('/nfts/nft-001')
  await expect(favorite).toHaveAttribute('aria-pressed', 'false')
  await logout(page)
  await login(page, 'maya@kurio.test', '/nfts/nft-001')
  await expect(favorite).toHaveAttribute('aria-pressed', 'true')

  const removed = responseFor(page, 'DELETE', '/favorites/nft-001')
  await favorite.click()
  expect((await removed).status()).toBe(200)
  await page.reload()
  await expect(favorite).toHaveAttribute('aria-pressed', 'false')
})

test('favorito otimista faz rollback após falha e permite uma nova tentativa', async ({
  page,
}) => {
  await login(page, 'maya@kurio.test', '/nfts/nft-001')
  const favorite = page.getByRole('button', {
    name: /^(Adicionar aos favoritos|Remover dos favoritos)$/,
  })
  await expect(favorite).toHaveAttribute('aria-pressed', 'false')
  await mockControl(page, 'scenario', { name: 'favorite-error' })
  const failure = responseFor(page, 'PUT', '/favorites/nft-001')
  await favorite.click()
  await expect(favorite).toHaveAttribute('aria-pressed', 'true')
  expect((await failure).status()).toBe(503)
  await expect(favorite).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByRole('alert')).toContainText(/favorit|tente/i)

  await mockControl(page, 'scenario', { name: 'default' })
  const recovered = responseFor(page, 'PUT', '/favorites/nft-001')
  await favorite.click()
  expect((await recovered).status()).toBe(200)
  await expect(favorite).toHaveAttribute('aria-pressed', 'true')
  await page.reload()
  await expect(favorite).toHaveAttribute('aria-pressed', 'true')
})

test('consulta privada atrasada não revela dados da conta anterior após logout e novo login', async ({
  page,
}) => {
  await login(page, 'maya@kurio.test', '/')
  await mockControl(page, 'scenario', { name: 'slow-private' })
  const completed = requestCompletion(page, '/api/profile')
  const started = page.waitForRequest(
    (request) =>
      request.method() === 'GET' &&
      new URL(request.url()).pathname === '/api/profile',
  )
  await page.goto('/profile')
  await started
  await logout(page)
  await mockControl(page, 'scenario', { name: 'default' })
  await login(page, 'theo@kurio.test', '/profile')
  await completed
  const profile = page.getByRole('form', {
    name: 'Dados do perfil',
    exact: true,
  })
  await expect(
    profile.getByRole('textbox', { name: 'Nome de exibição', exact: true }),
  ).toHaveValue('Theo Costa')
  await expect(
    profile.getByRole('textbox', { name: 'E-mail', exact: true }),
  ).toHaveValue('theo@kurio.test')
  await expect(page.getByText('Maya Silva', { exact: true })).toHaveCount(0)
})

test('sair durante login pendente prevalece sobre a resposta de autenticação anterior', async ({
  page,
}) => {
  await login(page)
  await page.goto('/login')
  await mockControl(page, 'scenario', { name: 'slow-auth' })
  const form = page.getByRole('form', { name: 'Entrar', exact: true })
  await form
    .getByRole('textbox', { name: 'E-mail', exact: true })
    .fill('theo@kurio.test')
  await form.getByLabel('Senha', { exact: true }).fill(demoPassword)

  const completed: string[] = []
  const signedIn = responseFor(page, 'POST', '/auth/login').then((response) => {
    completed.push('login')
    return response
  })
  const signedOut = responseFor(page, 'POST', '/auth/logout').then(
    (response) => {
      completed.push('logout')
      return response
    },
  )
  const loginStarted = page.waitForRequest(
    (request) =>
      request.method() === 'POST' &&
      new URL(request.url()).pathname === '/api/auth/login' &&
      request.postDataJSON()?.email === 'theo@kurio.test',
  )
  await form.getByRole('button', { name: 'Entrar', exact: true }).click()
  await loginStarted
  await logout(page)

  expect((await signedIn).status()).toBe(200)
  expect((await signedOut).status()).toBe(204)
  expect(completed).toEqual(['login', 'logout'])

  const restored = responseFor(page, 'GET', '/auth/session')
  await page.reload()
  const session = await restored
  expect(session.status()).toBe(200)
  expect(await session.json()).toEqual({ user: null, expiresAt: null })
  await page.goto('/profile')
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Entre na sua conta',
      exact: true,
    }),
  ).toBeVisible()
  expect(new URL(page.url()).searchParams.get('returnTo')).toBe('/profile')
  await expect(
    page.getByRole('form', { name: 'Dados do perfil', exact: true }),
  ).toHaveCount(0)
  await expect(page.getByText('Maya Silva', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Theo Costa', { exact: true })).toHaveCount(0)
})
