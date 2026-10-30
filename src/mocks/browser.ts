import { setupWorker } from 'msw/browser'
import { HttpNetworkFrame } from 'msw/experimental'

import { handlers } from './handlers'
import { initializeMockScenario } from './scenarios'
import { accountHandlers } from './account/handlers'
import { commerceHandlers } from './commerce/handlers'
import { realtimeHandlers } from './realtime/server'

export const worker = setupWorker(
  ...realtimeHandlers,
  ...commerceHandlers,
  ...accountHandlers,
  ...handlers,
)

export async function startMocking(): Promise<void> {
  if (import.meta.env.VITE_ENABLE_MOCKS !== 'true') return

  initializeMockScenario()
  await worker.start({
    quiet: true,
    serviceWorker: { url: '/mockServiceWorker.js' },
    onUnhandledFrame({ frame, defaults }) {
      if (!(frame instanceof HttpNetworkFrame)) return

      const pathname = new URL(frame.data.request.url).pathname
      if (pathname === '/api' || pathname.startsWith('/api/')) {
        defaults.error()
      }
    },
  })
}
