import { useEffect, useRef } from 'react'

// Reloads a page's data every `every` ms while it is on screen, and once when the tab or app comes back.
// For pages whose numbers change on their own (dashboards, order and food lists). Pages with forms don't use it,
// so nothing being typed is lost. For order lists, useLiveCheck (a tiny fingerprint first) is cheaper.
export function useAutoRefresh(reload, every = 15000) {
  const ref = useRef(reload)
  ref.current = reload
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') ref.current()
    }
    const timer = setInterval(tick, every)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [every])
}
