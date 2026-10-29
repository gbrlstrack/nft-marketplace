import type {
  AuthenticationResponse,
  Collector,
  LoginRequest,
  RegisterRequest,
  SessionResponse,
} from '@/contracts'
import { configureSessionLifecycle, http } from '@/lib/http'
import { queryClient } from '@/lib/query-client'

export interface SessionState extends SessionResponse {
  scope: number
  initialized: boolean
  reason: 'expired' | 'logout' | null
}

const sessionKey = ['auth', 'session'] as const
const anonymous: SessionResponse = { user: null, expiresAt: null }
let state: SessionState = {
  ...anonymous,
  scope: 0,
  initialized: false,
  reason: null,
}
let refreshVersion = 0
let authRevision = 0
let authQueue: Promise<unknown> = Promise.resolve()
let expiryTimer: ReturnType<typeof setTimeout> | undefined
const listeners = new Set<() => void>()

export function getSessionState() {
  return state
}
export function subscribeSession(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
export function isCurrentSession(scope: number, userId: string) {
  return state.scope === scope && state.user?.id === userId
}
export function privateQueryKey(resource: string) {
  return [
    'private',
    state.user?.id ?? 'anonymous',
    state.scope,
    resource,
  ] as const
}

function clearPrivateData() {
  void queryClient.cancelQueries({
    predicate: (query) => query.queryKey[0] === 'private',
  })
  queryClient.removeQueries({
    predicate: (query) => query.queryKey[0] === 'private',
  })
  for (const mutation of queryClient.getMutationCache().getAll()) {
    if (mutation.options.meta?.private)
      queryClient.getMutationCache().remove(mutation)
  }
}

export function acceptSession(
  session: SessionResponse,
  newCycle = false,
  reason: SessionState['reason'] = null,
) {
  const identityChanged = state.user?.id !== session.user?.id
  const scope = state.scope + (newCycle || identityChanged ? 1 : 0)
  refreshVersion += 1
  clearTimeout(expiryTimer)
  state = { ...session, scope, reason, initialized: true }
  if (newCycle || identityChanged) {
    void queryClient.cancelQueries({ queryKey: sessionKey })
    clearPrivateData()
  }
  queryClient.setQueryData(sessionKey, session)
  for (const listener of listeners) listener()
  if (session.user && session.expiresAt) {
    const remaining = Date.parse(session.expiresAt) - Date.now()
    if (!Number.isFinite(remaining) || remaining <= 0) expireSession()
    else
      expiryTimer = setTimeout(
        expireSession,
        Math.min(remaining, 2_147_483_647),
      )
  }
}

export function expireSession() {
  if (!state.user) return
  acceptSession(anonymous, true, 'expired')
}

export async function refreshSession() {
  await authQueue
  const version = refreshVersion
  const session = await queryClient.fetchQuery({
    queryKey: sessionKey,
    queryFn: async ({ signal }) =>
      (await http.get<SessionResponse>('/auth/session', { signal })).data,
    staleTime: 0,
    retry: false,
  })
  if (version === refreshVersion) {
    const expired = Boolean(state.user && !session.user)
    acceptSession(session, expired, expired ? 'expired' : null)
  }
  return state
}

export async function ensureSession() {
  if (!state.initialized) return refreshSession()
  return state
}

export function updateSessionUser(user: Collector) {
  if (state.user?.id === user.id)
    acceptSession({ user, expiresAt: state.expiresAt })
}

/** Serialize cookie-writing operations; only the latest user intent publishes state. */
function authOperation<T>(
  operation: () => Promise<T>,
  commit: (result: T) => void,
) {
  const revision = ++authRevision
  const result = authQueue.then(async () => {
    const data = await operation()
    const accepted = revision === authRevision
    if (accepted) commit(data)
    return { accepted }
  })
  authQueue = result.catch(() => undefined)
  return result
}

export function authenticate(
  mode: 'login' | 'register',
  values: LoginRequest | RegisterRequest,
) {
  return authOperation(
    async () =>
      (await http.post<AuthenticationResponse>(`/auth/${mode}`, values)).data,
    (data) => acceptSession(data, true),
  )
}

export function logoutSession() {
  return authOperation(
    async () => {
      await http.post('/auth/logout')
    },
    () => acceptSession(anonymous, true, 'logout'),
  )
}

configureSessionLifecycle({
  getScope: () => state.scope,
  onUnauthorized: expireSession,
})
