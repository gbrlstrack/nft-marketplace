import { http, HttpResponse } from 'msw/http'
import { delay } from 'msw/utils/delay'
import type {
  ApiErrorResponse,
  AuthenticationResponse,
  Collector,
  Profile,
  SessionResponse,
  WalletConnection,
} from '../../contracts'
import { nftFixtures } from '../fixtures'
import { setMockScenario } from '../scenarios'
import {
  createPassword,
  readDatabase,
  resetDatabase,
  SESSION_TTL_MS,
  verifyPassword,
  writeDatabase,
  type AccountDatabase,
  type AccountRecord,
} from './database'
import {
  ApiFault,
  assertUnique,
  invalid,
  jsonBody,
  profileInput,
  text,
  validateAvatar,
  validEmail,
  validPassword,
  validUsername,
  walletInput,
} from './validation'

const accountScenarioKey = 'kurio:account-scenario'
const scenarios = [
  'default',
  'favorite-error',
  'wallet-refused',
  'profile-error',
  'slow-private',
  'slow-auth',
] as const
type Scenario = (typeof scenarios)[number]
interface Principal {
  token: string
  userId: string
}
type CookieMap = Record<string, string | undefined>

function scenario(): Scenario {
  if (typeof sessionStorage === 'undefined') return 'default'
  const stored = sessionStorage.getItem(accountScenarioKey)
  return scenarios.includes(stored as Scenario)
    ? (stored as Scenario)
    : 'default'
}

function collector(profile: Profile): Collector {
  return {
    id: profile.id,
    name: profile.name,
    email: profile.email,
    avatar: profile.avatar,
  }
}

function sessionCookie(token: string, maxAge = 3600): string {
  return `nft_session=${encodeURIComponent(token)}; Path=/; SameSite=Lax; Max-Age=${maxAge}`
}

function unauthorized(reason: 'missing' | 'expired' | 'invalid'): never {
  throw new ApiFault(401, {
    code: 'unauthorized',
    reason,
    message:
      reason === 'expired'
        ? 'Sua sessão expirou. Entre novamente.'
        : 'Entre na sua conta para continuar.',
  })
}

function ownedAccount(
  database: AccountDatabase,
  principal: Principal,
): AccountRecord {
  const session = database.sessions.find(
    (entry) =>
      entry.token === principal.token && entry.userId === principal.userId,
  )
  if (!session) unauthorized('invalid')
  if (Date.parse(session.expiresAt) <= Date.now()) unauthorized('expired')
  const account = database.users.find(
    ({ profile }) => profile.id === principal.userId,
  )
  if (!account) unauthorized('invalid')
  return account
}

async function principalFrom(cookies: CookieMap): Promise<Principal> {
  const token = cookies.nft_session
  if (!token) return unauthorized('missing')
  const database = await readDatabase()
  const session = database.sessions.find((entry) => entry.token === token)
  if (!session) return unauthorized('invalid')
  const principal = { token, userId: session.userId }
  ownedAccount(database, principal)
  return principal
}

async function respond(operation: () => Promise<Response>): Promise<Response> {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof ApiFault)
      return HttpResponse.json<ApiErrorResponse>(
        { error: error.detail },
        { status: error.status },
      )
    return HttpResponse.json<ApiErrorResponse>(
      {
        error: {
          code: 'transient',
          message:
            'Não foi possível salvar ou recuperar os dados. Tente novamente.',
        },
      },
      { status: 503 },
    )
  }
}

function privateRequest(
  cookies: CookieMap,
  operation: (
    principal: Principal,
    currentScenario: Scenario,
  ) => Promise<Response>,
): Promise<Response> {
  return respond(async () => {
    // Capture the token/owner before latency; never resolve a later browser's cookie.
    const principal = await principalFrom(cookies)
    const currentScenario = scenario()
    await delay(
      currentScenario === 'slow-private'
        ? 1500
        : currentScenario === 'favorite-error'
          ? 700
          : 160,
    )
    return operation(principal, currentScenario)
  })
}

function transient(): never {
  throw new ApiFault(503, {
    code: 'transient',
    message: 'A alteração não pôde ser salva. Tente novamente.',
  })
}

function createSession(
  database: AccountDatabase,
  userId: string,
  priorToken?: string,
) {
  if (priorToken) {
    database.sessions = database.sessions.filter(
      (entry) => entry.token !== priorToken,
    )
    database.connections = database.connections.filter(
      (entry) => entry.sessionToken !== priorToken,
    )
  }
  const record = {
    token: crypto.randomUUID(),
    userId,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
  }
  database.sessions.push(record)
  return record
}

function revokeSession(database: AccountDatabase, token: string): void {
  database.sessions = database.sessions.filter((entry) => entry.token !== token)
  database.connections = database.connections.filter(
    (entry) => entry.sessionToken !== token,
  )
}

function connectionDto(connection: WalletConnection): WalletConnection {
  return {
    id: connection.id,
    walletId: connection.walletId,
    network: connection.network,
    status: connection.status,
    expiresAt: connection.expiresAt,
  }
}

export const accountHandlers = [
  http.get('/api/auth/session', ({ cookies }) =>
    respond(async () => {
      const database = await readDatabase()
      const session = database.sessions.find(
        (entry) =>
          entry.token === cookies.nft_session &&
          Date.parse(entry.expiresAt) > Date.now(),
      )
      const account =
        session &&
        database.users.find(({ profile }) => profile.id === session.userId)
      return HttpResponse.json<SessionResponse>(
        account && session
          ? { user: collector(account.profile), expiresAt: session.expiresAt }
          : { user: null, expiresAt: null },
      )
    }),
  ),

  http.post('/api/auth/register', ({ request, cookies }) =>
    respond(async () => {
      if (scenario() === 'slow-auth') await delay(1500)
      const body = await jsonBody(request)
      const username = text(body, 'name')
      const email = text(body, 'email').toLowerCase()
      const fields: Record<string, string> = {}
      if (!validUsername(username))
        fields.name = 'Use de 3 a 24 letras, números ou sublinhado.'
      if (!validEmail(email)) fields.email = 'Informe um e-mail válido.'
      if (!validPassword(body.password))
        fields.password = 'Use de 8 a 128 caracteres com letras e números.'
      if (Object.keys(fields).length) invalid(fields)
      const password = await createPassword(body.password as string)
      const result = await writeDatabase((database) => {
        if (
          database.users.some(
            ({ profile }) =>
              profile.username.toLowerCase() === username.toLowerCase(),
          )
        ) {
          invalid({ name: 'Este nome de usuário já está em uso.' })
        }
        assertUnique(database, email, username)
        const profile: Profile = {
          id: crypto.randomUUID(),
          name: username,
          username,
          email,
          avatar: null,
          ensName: `${username}.eth`,
          walletAlias: `Carteira de ${username}`,
          bio: '',
          version: 1,
        }
        database.users.push({
          profile,
          password,
          favorites: { nftIds: [], version: 1 },
          wallets: [],
        })
        const session = createSession(database, profile.id, cookies.nft_session)
        return { user: collector(profile), session }
      })
      return HttpResponse.json<AuthenticationResponse>(
        { user: result.user, expiresAt: result.session.expiresAt },
        {
          status: 201,
          headers: { 'Set-Cookie': sessionCookie(result.session.token) },
        },
      )
    }),
  ),

  http.post('/api/auth/login', ({ request, cookies }) =>
    respond(async () => {
      if (scenario() === 'slow-auth') await delay(1500)
      const body = await jsonBody(request)
      const email = text(body, 'email').toLowerCase()
      const password = typeof body.password === 'string' ? body.password : ''
      const fields: Record<string, string> = {}
      if (!validEmail(email)) fields.email = 'Informe um e-mail válido.'
      if (!password || password.length > 128)
        fields.password = 'Informe a senha.'
      if (Object.keys(fields).length) invalid(fields)
      const result = await writeDatabase(async (database) => {
        const account = database.users.find(
          ({ profile }) => profile.email.toLowerCase() === email,
        )
        if (!account || !(await verifyPassword(password, account.password)))
          throw new ApiFault(401, {
            code: 'unauthorized',
            reason: 'invalid',
            message: 'E-mail ou senha incorretos.',
          })
        const session = createSession(
          database,
          account.profile.id,
          cookies.nft_session,
        )
        return { user: collector(account.profile), session }
      })
      return HttpResponse.json<AuthenticationResponse>(
        { user: result.user, expiresAt: result.session.expiresAt },
        { headers: { 'Set-Cookie': sessionCookie(result.session.token) } },
      )
    }),
  ),

  http.post('/api/auth/logout', ({ cookies }) =>
    respond(async () => {
      if (cookies.nft_session)
        await writeDatabase((database) =>
          revokeSession(database, cookies.nft_session),
        )
      return new HttpResponse(null, {
        status: 204,
        headers: { 'Set-Cookie': sessionCookie('', 0) },
      })
    }),
  ),

  http.post('/api/__mock/session/expire', ({ cookies }) =>
    respond(async () => {
      if (cookies.nft_session)
        await writeDatabase((database) => {
          const session = database.sessions.find(
            (entry) => entry.token === cookies.nft_session,
          )
          if (session)
            session.expiresAt = new Date(Date.now() - 1000).toISOString()
          database.connections = database.connections.filter(
            (entry) => entry.sessionToken !== cookies.nft_session,
          )
        })
      return new HttpResponse(null, { status: 204 })
    }),
  ),

  http.post('/api/__mock/scenario', ({ request }) =>
    respond(async () => {
      const body = await jsonBody(request)
      const name = text(body, 'name')
      if (!scenarios.includes(name as Scenario))
        invalid({ name: 'Selecione um cenário de conta disponível.' })
      if (typeof sessionStorage !== 'undefined')
        sessionStorage.setItem(accountScenarioKey, name)
      return HttpResponse.json({ name })
    }),
  ),

  http.post('/api/__mock/reset', () =>
    respond(async () => {
      await resetDatabase()
      if (typeof sessionStorage !== 'undefined')
        sessionStorage.removeItem(accountScenarioKey)
      setMockScenario('default')
      const headers = new Headers()
      headers.append('Set-Cookie', sessionCookie('', 0))
      headers.append('Set-Cookie', 'nft_cart=; Path=/; SameSite=Lax; Max-Age=0')
      return new HttpResponse(null, { status: 204, headers })
    }),
  ),

  http.get('/api/profile', ({ cookies }) =>
    privateRequest(cookies, async (principal) => {
      const database = await readDatabase()
      return HttpResponse.json(ownedAccount(database, principal).profile)
    }),
  ),

  http.patch('/api/profile', ({ cookies, request }) =>
    privateRequest(cookies, async (principal, currentScenario) => {
      const body = await jsonBody(request)
      const profile = await writeDatabase((database) => {
        const account = ownedAccount(database, principal)
        const input = profileInput(body, database, account.profile)
        if (currentScenario === 'profile-error') transient()
        account.profile = {
          ...account.profile,
          ...input,
          version: account.profile.version + 1,
        }
        return account.profile
      })
      return HttpResponse.json(profile)
    }),
  ),

  http.put('/api/profile/avatar', ({ cookies, request }) =>
    privateRequest(cookies, async (principal, currentScenario) => {
      const body = await jsonBody(request)
      const dataUrl = await validateAvatar(body.dataUrl)
      const alt = text(body, 'alt')
      if (!alt || alt.length > 160)
        invalid({
          alt: 'Informe uma descrição de até 160 caracteres para o avatar.',
        })
      const profile = await writeDatabase((database) => {
        const account = ownedAccount(database, principal)
        if (currentScenario === 'profile-error') transient()
        account.profile.avatar = { src: dataUrl, alt }
        account.profile.version += 1
        return account.profile
      })
      return HttpResponse.json(profile)
    }),
  ),

  http.delete('/api/profile/avatar', ({ cookies }) =>
    privateRequest(cookies, async (principal, currentScenario) => {
      const profile = await writeDatabase((database) => {
        const account = ownedAccount(database, principal)
        if (currentScenario === 'profile-error') transient()
        account.profile.avatar = null
        account.profile.version += 1
        return account.profile
      })
      return HttpResponse.json(profile)
    }),
  ),

  http.put('/api/profile/password', ({ cookies, request }) =>
    privateRequest(cookies, async (principal, currentScenario) => {
      const body = await jsonBody(request)
      const currentPassword =
        typeof body.currentPassword === 'string' ? body.currentPassword : ''
      if (!currentPassword || currentPassword.length > 128)
        invalid({ currentPassword: 'Informe a senha atual.' })
      if (!validPassword(body.newPassword))
        invalid({
          newPassword: 'Use de 8 a 128 caracteres com letras e números.',
        })
      await writeDatabase(async (database) => {
        const account = ownedAccount(database, principal)
        if (!(await verifyPassword(currentPassword, account.password)))
          invalid({ currentPassword: 'A senha atual está incorreta.' })
        if (body.newPassword === currentPassword)
          invalid({ newPassword: 'Escolha uma senha diferente da atual.' })
        if (currentScenario === 'profile-error') transient()
        account.password = await createPassword(body.newPassword as string)
        database.sessions = database.sessions.filter(
          (entry) =>
            entry.userId !== principal.userId ||
            entry.token === principal.token,
        )
        database.connections = database.connections.filter(
          (entry) => entry.userId !== principal.userId,
        )
      })
      return new HttpResponse(null, { status: 204 })
    }),
  ),

  http.get('/api/wallets', ({ cookies }) =>
    privateRequest(cookies, async (principal) => {
      const database = await readDatabase()
      return HttpResponse.json({
        items: ownedAccount(database, principal).wallets,
      })
    }),
  ),

  http.post('/api/wallets', ({ cookies, request }) =>
    privateRequest(cookies, async (principal) => {
      const input = walletInput(await jsonBody(request))
      const wallet = await writeDatabase((database) => {
        const account = ownedAccount(database, principal)
        if (account.wallets.some((entry) => entry.role === input.role))
          invalid({ role: 'Você já possui uma carteira com esta função.' })
        if (
          account.wallets.some(
            (entry) =>
              entry.address.toLowerCase() === input.address.toLowerCase(),
          )
        )
          invalid({ address: 'Este endereço já está cadastrado nesta conta.' })
        const wallet = { id: crypto.randomUUID(), ...input, version: 1 }
        account.wallets.push(wallet)
        return wallet
      })
      return HttpResponse.json(wallet, { status: 201 })
    }),
  ),

  http.put('/api/wallets/:walletId', ({ cookies, request, params }) =>
    privateRequest(cookies, async (principal) => {
      const input = walletInput(await jsonBody(request))
      const wallet = await writeDatabase((database) => {
        const account = ownedAccount(database, principal)
        const index = account.wallets.findIndex(
          (entry) => entry.id === params.walletId,
        )
        if (index === -1)
          throw new ApiFault(404, {
            code: 'not-found',
            resource: 'wallet',
            message: 'Carteira não encontrada.',
          })
        if (
          account.wallets.some(
            (entry) =>
              entry.id !== params.walletId && entry.role === input.role,
          )
        )
          invalid({ role: 'Você já possui uma carteira com esta função.' })
        if (
          account.wallets.some(
            (entry) =>
              entry.id !== params.walletId &&
              entry.address.toLowerCase() === input.address.toLowerCase(),
          )
        )
          invalid({ address: 'Este endereço já está cadastrado nesta conta.' })
        const wallet = {
          ...account.wallets[index],
          ...input,
          version: account.wallets[index].version + 1,
        }
        account.wallets[index] = wallet
        database.connections = database.connections.filter(
          (entry) =>
            entry.walletId !== wallet.id || entry.userId !== principal.userId,
        )
        return wallet
      })
      return HttpResponse.json(wallet)
    }),
  ),

  http.post(
    '/api/wallets/:walletId/connections',
    ({ cookies, request, params }) =>
      privateRequest(cookies, async (principal, currentScenario) => {
        const body = await jsonBody(request)
        const connection = await writeDatabase((database) => {
          const account = ownedAccount(database, principal)
          const wallet = account.wallets.find(
            (entry) => entry.id === params.walletId,
          )
          if (!wallet)
            throw new ApiFault(404, {
              code: 'not-found',
              resource: 'wallet',
              message: 'Carteira não encontrada.',
            })
          if (body.network !== wallet.network)
            throw new ApiFault(422, {
              code: 'network-mismatch',
              message: 'A rede selecionada não corresponde à carteira.',
            })
          if (currentScenario === 'wallet-refused')
            throw new ApiFault(400, {
              code: 'wallet-refused',
              message: 'A conexão simulada foi recusada pela carteira.',
            })
          database.connections = database.connections.filter(
            (entry) =>
              entry.sessionToken !== principal.token ||
              entry.walletId !== wallet.id,
          )
          const record = {
            id: crypto.randomUUID(),
            userId: principal.userId,
            sessionToken: principal.token,
            walletId: wallet.id,
            network: wallet.network,
            status: 'connected' as const,
            expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
          }
          database.connections.push(record)
          return connectionDto(record)
        })
        return HttpResponse.json(connection, { status: 201 })
      }),
  ),

  http.delete('/api/wallet-connections/:connectionId', ({ cookies, params }) =>
    privateRequest(cookies, async (principal) => {
      await writeDatabase((database) => {
        ownedAccount(database, principal)
        const connection = database.connections.find(
          (entry) => entry.id === params.connectionId,
        )
        if (
          connection &&
          (connection.userId !== principal.userId ||
            connection.sessionToken !== principal.token)
        )
          throw new ApiFault(404, {
            code: 'not-found',
            resource: 'wallet-connection',
            message: 'Conexão não encontrada.',
          })
        database.connections = database.connections.filter(
          (entry) => entry.id !== params.connectionId,
        )
      })
      return new HttpResponse(null, { status: 204 })
    }),
  ),

  http.get('/api/favorites', ({ cookies }) =>
    privateRequest(cookies, async (principal) => {
      const database = await readDatabase()
      return HttpResponse.json(ownedAccount(database, principal).favorites)
    }),
  ),

  ...(['put', 'delete'] as const).map((method) =>
    http[method]('/api/favorites/:nftId', ({ cookies, params }) =>
      privateRequest(cookies, async (principal, currentScenario) => {
        const favorites = await writeDatabase((database) => {
          const account = ownedAccount(database, principal)
          const nftId = String(params.nftId)
          if (!nftFixtures.some((entry) => entry.id === nftId))
            throw new ApiFault(404, {
              code: 'not-found',
              resource: 'nft',
              message: 'NFT não encontrado.',
            })
          if (currentScenario === 'favorite-error') transient()
          const exists = account.favorites.nftIds.includes(nftId)
          if (method === 'put' && !exists) {
            account.favorites.nftIds.push(nftId)
            account.favorites.version += 1
          } else if (method === 'delete' && exists) {
            account.favorites.nftIds = account.favorites.nftIds.filter(
              (entry) => entry !== nftId,
            )
            account.favorites.version += 1
          }
          return account.favorites
        })
        return HttpResponse.json(favorites)
      }),
    ),
  ),
]
