import { useSyncExternalStore } from 'react'

export interface RealtimeState {
  status: 'connecting' | 'connected' | 'offline'
  revision: number
  nftRevisions: Readonly<Record<string, number>>
  notice: string
}

let state: RealtimeState = {
  status: 'connecting',
  revision: 0,
  nftRevisions: {},
  notice: '',
}
const listeners = new Set<() => void>()

export function getRealtimeState() {
  return state
}

export function publishRealtime(change: Partial<RealtimeState>) {
  state = { ...state, ...change }
  for (const listener of listeners) listener()
}

export function useRealtime() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getRealtimeState,
    getRealtimeState,
  )
}
