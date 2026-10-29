import assert from 'node:assert/strict'
import test from 'node:test'

type DatabaseModule = typeof import('../../src/mocks/account/database.ts')

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
    removeItem: (key: string) => {
      values.delete(key)
    },
  }
}

async function tabDatabase(name: string): Promise<DatabaseModule> {
  const url = new URL('../../src/mocks/account/database.ts', import.meta.url)
  url.searchParams.set('testTab', name)
  return import(url.href) as Promise<DatabaseModule>
}

test('banco recarrega alterações de outra aba e serializa suas gravações pelo Web Lock', async (context) => {
  const storage = memoryStorage()
  const storageDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    'localStorage',
  )
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    'navigator',
  )
  let lockQueue: Promise<unknown> = Promise.resolve()
  const lockNames: string[] = []
  const locks = {
    request<T>(name: string, callback: () => Promise<T>): Promise<T> {
      lockNames.push(name)
      const next = lockQueue.then(callback)
      lockQueue = next.catch(() => undefined)
      return next
    },
  }
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: storage,
  })
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { locks },
  })
  context.after(() => {
    if (storageDescriptor)
      Object.defineProperty(globalThis, 'localStorage', storageDescriptor)
    else Reflect.deleteProperty(globalThis, 'localStorage')
    if (navigatorDescriptor)
      Object.defineProperty(globalThis, 'navigator', navigatorDescriptor)
    else Reflect.deleteProperty(globalThis, 'navigator')
  })

  const firstTab = await tabDatabase('first')
  const secondTab = await tabDatabase('second')
  await firstTab.readDatabase()
  await secondTab.writeDatabase((database) => {
    database.users[0].profile.bio = 'Alterado na segunda aba'
  })
  assert.equal(
    (await firstTab.readDatabase()).users[0].profile.bio,
    'Alterado na segunda aba',
  )

  const entered = deferred()
  const release = deferred()
  const firstWrite = firstTab.writeDatabase(async (database) => {
    entered.resolve()
    await release.promise
    database.users[0].profile.bio += ' A'
  })
  await entered.promise
  const secondWrite = secondTab.writeDatabase((database) => {
    database.users[0].profile.bio += ' B'
  })
  release.resolve()
  await Promise.all([firstWrite, secondWrite])
  assert.equal(
    (await firstTab.readDatabase()).users[0].profile.bio,
    'Alterado na segunda aba A B',
  )
  assert.ok(lockNames.length >= 6)
  assert.ok(lockNames.every((name) => name === 'kurio:mock-account-db'))

  const beforeFailure = storage.getItem(firstTab.ACCOUNT_STORAGE_KEY)
  await assert.rejects(
    firstTab.writeDatabase((database) => {
      database.users[0].profile.name = 'Não persistir'
      throw new Error('Falha simulada antes do commit')
    }),
    /Falha simulada/,
  )
  assert.equal(storage.getItem(firstTab.ACCOUNT_STORAGE_KEY), beforeFailure)
  await secondTab.writeDatabase((database) => {
    database.users[0].profile.walletAlias = 'Após falha'
  })
  assert.equal(
    (await firstTab.readDatabase()).users[0].profile.walletAlias,
    'Após falha',
  )
  assert.ok(
    !storage.getItem(firstTab.ACCOUNT_STORAGE_KEY)?.includes('Demo123!'),
  )

  await secondTab.resetDatabase()
  const restored = await firstTab.readDatabase()
  assert.equal(restored.users[0].profile.bio, 'Colecionadora de arte digital.')
  assert.equal(restored.users[0].profile.walletAlias, 'Carteira da Maya')
})

test('sem Web Locks a fila local preserva operações concorrentes na mesma aba', async (context) => {
  const storageDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    'localStorage',
  )
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    'navigator',
  )
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: memoryStorage(),
  })
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {},
  })
  context.after(() => {
    if (storageDescriptor)
      Object.defineProperty(globalThis, 'localStorage', storageDescriptor)
    else Reflect.deleteProperty(globalThis, 'localStorage')
    if (navigatorDescriptor)
      Object.defineProperty(globalThis, 'navigator', navigatorDescriptor)
    else Reflect.deleteProperty(globalThis, 'navigator')
  })
  const database = await tabDatabase('fallback')
  await Promise.all(
    Array.from({ length: 6 }, () =>
      database.writeDatabase((draft) => {
        draft.users[0].profile.version += 1
      }),
    ),
  )
  assert.equal((await database.readDatabase()).users[0].profile.version, 7)
})
