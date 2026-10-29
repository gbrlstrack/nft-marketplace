import axios from 'axios'

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 10_000,
  headers: { Accept: 'application/json' },
})

let lifecycle:
  { getScope: () => number; onUnauthorized: () => void } | undefined
const requestScopes = new WeakMap<object, number>()

export function configureSessionLifecycle(next: typeof lifecycle) {
  lifecycle = next
}

http.interceptors.request.use((config) => {
  requestScopes.set(config, lifecycle?.getScope() ?? 0)
  return config
})

http.interceptors.response.use(undefined, (error: unknown) => {
  if (
    axios.isAxiosError(error) &&
    error.response?.status === 401 &&
    error.config
  ) {
    const url = error.config.url || ''
    if (
      !['/auth/login', '/auth/register'].includes(url) &&
      requestScopes.get(error.config) === lifecycle?.getScope()
    ) {
      lifecycle?.onUnauthorized()
    }
  }
  return Promise.reject(error)
})
