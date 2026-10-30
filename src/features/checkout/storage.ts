import type {
  CheckoutCollector,
  CreateOrderRequest,
  WalletNetwork,
} from '@/contracts'

export interface CheckoutDraft {
  collector: CheckoutCollector
  walletId: string
  network: WalletNetwork
}

export interface PurchaseAttempt {
  userId: string
  key: string
  body: CreateOrderRequest
}

function key(kind: 'draft' | 'attempt', userId: string) {
  return `kurio:checkout:${kind}:${encodeURIComponent(userId)}`
}

function read(kind: 'draft' | 'attempt', userId: string): unknown {
  try {
    const value = sessionStorage.getItem(key(kind, userId))
    return value ? JSON.parse(value) : null
  } catch {
    return null
  }
}

function isCollector(value: unknown): value is CheckoutCollector {
  if (!value || typeof value !== 'object') return false
  return [
    'name',
    'email',
    'username',
    'profileName',
    'ensName',
    'referralCode',
    'secondaryAddress',
    'notes',
  ].every(
    (field) => typeof (value as Record<string, unknown>)[field] === 'string',
  )
}

export function readDraft(userId: string): CheckoutDraft | null {
  const draft = read('draft', userId) as Partial<CheckoutDraft> | null
  return draft &&
    isCollector(draft.collector) &&
    typeof draft.walletId === 'string' &&
    ['ethereum', 'sepolia'].includes(draft.network || '')
    ? (draft as CheckoutDraft)
    : null
}

export function writeDraft(userId: string, draft: CheckoutDraft): boolean {
  try {
    sessionStorage.setItem(key('draft', userId), JSON.stringify(draft))
    return true
  } catch {
    return false
  }
}

export function readAttempt(userId: string): PurchaseAttempt | null {
  const attempt = read('attempt', userId) as Partial<PurchaseAttempt> | null
  const body = attempt?.body
  return attempt &&
    attempt.userId === userId &&
    typeof attempt.key === 'string' &&
    attempt.key.length > 0 &&
    body &&
    typeof body.quoteId === 'string' &&
    Number.isSafeInteger(body.quoteVersion) &&
    typeof body.walletId === 'string' &&
    typeof body.walletConnectionId === 'string' &&
    ['ethereum', 'sepolia'].includes(body.network) &&
    isCollector(body.collector)
    ? (attempt as PurchaseAttempt)
    : null
}

export function writeAttempt(attempt: PurchaseAttempt): void {
  try {
    sessionStorage.setItem(
      key('attempt', attempt.userId),
      JSON.stringify(attempt),
    )
  } catch {
    throw new Error(
      'Não foi possível guardar a tentativa neste navegador. Libere o armazenamento antes de confirmar a compra.',
    )
  }
}

export function clearAttempt(userId: string, attemptKey: string): void {
  try {
    if (readAttempt(userId)?.key === attemptKey)
      sessionStorage.removeItem(key('attempt', userId))
  } catch {
    /* An inaccessible store must not mutate another user's attempt. */
  }
}

export function clearDraft(userId: string): void {
  try {
    sessionStorage.removeItem(key('draft', userId))
  } catch {
    /* The confirmed order is still recoverable from its URL. */
  }
}
