import { useSyncExternalStore } from 'react'
import { getSessionState, subscribeSession } from './session'

export function useSession() {
  return useSyncExternalStore(
    subscribeSession,
    getSessionState,
    getSessionState,
  )
}
