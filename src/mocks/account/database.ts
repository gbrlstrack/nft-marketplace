import type {
  FavoritesResponse,
  Profile,
  Wallet,
  WalletConnection,
} from '../../contracts'

export const ACCOUNT_STORAGE_KEY = 'kurio:mock-account-db:v1'
export const SESSION_TTL_MS = 60 * 60 * 1000

interface PasswordRecord {
  salt: string
  hash: string
}

export interface AccountRecord {
  profile: Profile
  password: PasswordRecord
  favorites: FavoritesResponse
  wallets: Wallet[]
}

export interface SessionRecord {
  token: string
  userId: string
  expiresAt: string
}

export interface ConnectionRecord extends WalletConnection {
  userId: string
  sessionToken: string
}

export interface AccountDatabase {
  version: 1
  users: AccountRecord[]
  sessions: SessionRecord[]
  connections: ConnectionRecord[]
}

let memoryDatabase: AccountDatabase | undefined
let operations: Promise<unknown> = Promise.resolve()
const databaseLockName = 'kurio:mock-account-db'

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  )
}

function fromHex(value: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(value.length / 2)
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16)
  }
  return bytes
}

async function derivePassword(password: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: fromHex(salt),
      iterations: 100_000,
      hash: 'SHA-256',
    },
    key,
    256,
  )
  return toHex(new Uint8Array(bits))
}

export async function createPassword(
  password: string,
): Promise<PasswordRecord> {
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)))
  return { salt, hash: await derivePassword(password, salt) }
}

export async function verifyPassword(
  password: string,
  record: PasswordRecord,
): Promise<boolean> {
  const actual = await derivePassword(password, record.salt)
  let difference = actual.length ^ record.hash.length
  for (let index = 0; index < actual.length; index += 1) {
    difference |= actual.charCodeAt(index) ^ record.hash.charCodeAt(index)
  }
  return difference === 0
}

function fixtureWallet(user: Profile, addressDigit: string): Wallet {
  return {
    id: `wallet-${user.id}-primary`,
    label: user.walletAlias,
    displayName: user.name,
    profileName: user.username,
    provider: 'metamask',
    email: user.email,
    ensName: user.ensName,
    referralCode: 'KURIO',
    secondaryAddress: '',
    address: `0x${addressDigit.repeat(40)}`,
    network: 'ethereum',
    role: 'primary',
    version: 1,
  }
}

async function seedDatabase(): Promise<AccountDatabase> {
  const profiles: Profile[] = [
    {
      id: 'maya',
      name: 'Maya Silva',
      username: 'maya',
      email: 'maya@kurio.test',
      ensName: 'maya.eth',
      walletAlias: 'Carteira da Maya',
      bio: 'Colecionadora de arte digital.',
      avatar: null,
      version: 1,
    },
    {
      id: 'theo',
      name: 'Theo Costa',
      username: 'theo',
      email: 'theo@kurio.test',
      ensName: 'theo.eth',
      walletAlias: 'Carteira do Theo',
      bio: 'Fotografia e cultura digital.',
      avatar: null,
      version: 1,
    },
  ]
  const users = await Promise.all(
    profiles.map(async (profile, index) => ({
      profile,
      password: await createPassword('Demo123!'),
      favorites: { nftIds: [], version: 1 },
      wallets: [fixtureWallet(profile, String(index + 1))],
    })),
  )
  return { version: 1, users, sessions: [], connections: [] }
}

function persist(database: AccountDatabase): void {
  if (typeof localStorage !== 'undefined')
    localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(database))
}

async function loadDatabase(): Promise<AccountDatabase> {
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem(ACCOUNT_STORAGE_KEY)
    if (stored) {
      try {
        const parsed: unknown = JSON.parse(stored)
        if (
          typeof parsed === 'object' &&
          parsed !== null &&
          'version' in parsed &&
          parsed.version === 1 &&
          'users' in parsed &&
          Array.isArray(parsed.users) &&
          'sessions' in parsed &&
          Array.isArray(parsed.sessions) &&
          'connections' in parsed &&
          Array.isArray(parsed.connections)
        )
          return parsed as AccountDatabase
      } catch {
        // A corrupt demonstration database is restored to its documented fixtures.
      }
    }
  } else if (memoryDatabase) return memoryDatabase
  const database = await seedDatabase()
  persist(database)
  memoryDatabase = database
  return database
}

/**
 * Every operation reloads storage inside the shared browser lock. Without
 * Web Locks the queue still serializes this tab, but concurrent writes from
 * different tabs are not guaranteed to be atomic. Never nest public database
 * operations inside a transaction: the lock is intentionally non-reentrant.
 */
function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const next = operations.then(async (): Promise<T> => {
    if (typeof navigator !== 'undefined' && navigator.locks) {
      return await navigator.locks.request(databaseLockName, operation)
    }
    return operation()
  })
  operations = next.catch(() => undefined)
  return next
}

export function readDatabase(): Promise<AccountDatabase> {
  return enqueue(async () => structuredClone(await loadDatabase()))
}

/** Serialize writes and publish only a persisted, successful draft. */
export function writeDatabase<T>(
  operation: (database: AccountDatabase) => T | Promise<T>,
): Promise<T> {
  return enqueue(async () => {
    const draft = structuredClone(await loadDatabase())
    const result = await operation(draft)
    persist(draft)
    memoryDatabase = draft
    return structuredClone(result)
  })
}

export function resetDatabase(): Promise<void> {
  return enqueue(async () => {
    const database = await seedDatabase()
    persist(database)
    memoryDatabase = database
  })
}
