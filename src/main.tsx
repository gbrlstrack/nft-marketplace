import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { queryClient } from '@/lib/query-client'
import '@/styles/globals.css'

const container = document.getElementById('root')
if (!container) throw new Error('Elemento raiz não encontrado.')

async function bootstrap() {
  if (import.meta.env.VITE_ENABLE_MOCKS === 'true') {
    const { startMocking } = await import('@/mocks/browser')
    await startMocking()
  }
  // Socket.IO captures the WebSocket constructor while its module evaluates.
  // Load the application graph after MSW installs the network interceptors.
  const { router } = await import('@/app/router')
  createRoot(container!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </StrictMode>,
  )
}

void bootstrap().catch(() => {
  const message = document.createElement('p')
  message.setAttribute('role', 'alert')
  message.textContent =
    'Não foi possível iniciar a aplicação. Recarregue a página para tentar novamente.'
  container.replaceChildren(message)
})
