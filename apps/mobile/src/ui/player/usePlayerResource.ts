import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { AppState } from 'react-native'
import { useIsFocused } from '@react-navigation/native'
import type { Parser } from '../../core/http'
import type { Services } from '../services'
export function usePlayerResource<T>(services: Services, path: string, parser: Parser<T>) {
  const runtime = useSyncExternalStore(services.runtime.subscribe, services.runtime.getSnapshot)
  const focused = useIsFocused(), ticket = useRef(0)
  const [state, setState] = useState<{ data: T | null; cached: boolean; loading: boolean; error: unknown }>({ data: null, cached: false, loading: true, error: null })
  const refresh = useCallback(() => {
    const own = ++ticket.current, owner = services.runtime.getSnapshot().identity?.id
    setState(previous => ({ ...previous, loading: true, error: null }))
    void services.runtime.resource(path, parser).then(value => {
      if (own === ticket.current && services.runtime.getSnapshot().identity?.id === owner) setState({ data: value.data, cached: value.cached, loading: false, error: null })
    }).catch(error => { if (own === ticket.current) setState(previous => ({ ...previous, error, loading: false })) })
  }, [services, path, parser])
  const invalidate = useCallback(() => { ticket.current++ }, [])
  useEffect(() => {
    if (!focused || runtime.phase !== 'ready') return
    refresh()
    const poll = setInterval(() => { if (AppState.currentState === 'active') refresh() }, 60_000)
    const sub = AppState.addEventListener('change', next => { if (next === 'active') refresh() })
    return () => { invalidate(); clearInterval(poll); sub.remove() }
  }, [focused, runtime.phase, runtime.online, runtime.ownerEpoch, refresh, invalidate])
  return { ...state, refresh }
}
