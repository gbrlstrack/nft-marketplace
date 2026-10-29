export const mockScenarios = [
  'default',
  'empty',
  'slow',
  'catalog-error',
  'offline',
  'out-of-order',
] as const

export type MockScenario = (typeof mockScenarios)[number]

const storageKey = 'nft-marketplace:catalog-scenario'
let selectedScenario: MockScenario = 'default'

function isMockScenario(value: string | null): value is MockScenario {
  return mockScenarios.some((scenario) => scenario === value)
}

/** Called before requests begin. URL choice survives client navigation and reload. */
export function initializeMockScenario(): void {
  if (typeof window === 'undefined') return

  const fromUrl = new URL(window.location.href).searchParams.get('mockScenario')
  let stored: string | null = null

  try {
    stored = window.sessionStorage.getItem(storageKey)
  } catch {
    // Restricted storage still allows an in-memory scenario for this page.
  }

  setMockScenario(
    isMockScenario(fromUrl)
      ? fromUrl
      : isMockScenario(stored)
        ? stored
        : 'default',
  )
}

/** Also usable by isolated network tests without a browser or persistent storage. */
export function setMockScenario(scenario: MockScenario): void {
  selectedScenario = scenario

  if (typeof window === 'undefined') return

  try {
    window.sessionStorage.setItem(storageKey, scenario)
  } catch {
    // Storage is optional; never replace a network response with a UI fallback.
  }
}

export function getMockScenario(): MockScenario {
  return selectedScenario
}

/** Deterministic timings: short searches finish after longer searches. */
export function catalogDelayMs(scenario: MockScenario, url: URL): number {
  if (scenario === 'slow') return 2_000
  if (scenario === 'out-of-order') {
    const queryLength = (url.searchParams.get('q') ?? '').trim().length
    return queryLength < 2 ? 1_200 : queryLength < 5 ? 700 : 120
  }

  return 160
}
