import { useEffect, useRef } from 'react'
import { useLocation, useRouter } from '@tanstack/react-router'
import { refreshSession } from './session'
import { useSession } from './use-session'
import { isPrivatePath, safeReturnTo } from './return-to'

export function SessionLifecycle() {
  const session = useSession()
  const router = useRouter()
  const href = useLocation({ select: (location) => location.href })
  const path = useLocation({ select: (location) => location.pathname })
  const handledExpiry = useRef(session.scope)

  useEffect(() => {
    if (
      !session.initialized ||
      session.user ||
      ['/login', '/register'].includes(path)
    )
      return
    const justExpired =
      session.reason === 'expired' && handledExpiry.current !== session.scope
    if (isPrivatePath(path) || justExpired) {
      handledExpiry.current = session.scope
      void router.navigate({
        to: '/login',
        search: { returnTo: safeReturnTo(href) },
        replace: true,
      })
    }
  }, [
    session.initialized,
    session.user,
    session.reason,
    session.scope,
    path,
    href,
    router,
  ])

  useEffect(() => {
    const reconcile = () => {
      if (document.visibilityState === 'visible')
        void refreshSession().catch(() => undefined)
    }
    const storage = (event: StorageEvent) => {
      if (event.key?.startsWith('kurio:')) reconcile()
    }
    document.addEventListener('visibilitychange', reconcile)
    window.addEventListener('online', reconcile)
    window.addEventListener('storage', storage)
    return () => {
      document.removeEventListener('visibilitychange', reconcile)
      window.removeEventListener('online', reconcile)
      window.removeEventListener('storage', storage)
    }
  }, [])
  return null
}
