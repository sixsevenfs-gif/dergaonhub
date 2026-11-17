import { useEffect, useRef } from 'react'

// Keeps a page up to date without downloading it again and again (Supabase egress).
// While the page is on screen it calls `check` every `every` ms: a tiny "fingerprint" of what the page shows
// (a few fields of the newest orders, say). Only when that changes does it call `onChange`, the full reload.
// It stops while the tab or app is in the background and checks once when it comes back. Every `fullEvery`
// ms it reloads anyway, for changes the fingerprint does not cover.
export function useLiveCheck(check, onChange, { every = 15000, fullEvery = 10 * 60000, key = '' } = {}) {
  const checkRef = useRef(check)
  const changeRef = useRef(onChange)
  checkRef.current = check
  changeRef.current = onChange

  useEffect(() => {
    let last = null
    let lastFull = Date.now()
    let busy = false
    const tick = async () => {
      if (busy || document.visibilityState !== 'visible') return
      busy = true
      try {
        const now = await checkRef.current()
        const full = Date.now() - lastFull >= fullEvery
        if (full || (last !== null && now !== last)) {
          lastFull = Date.now()
          changeRef.current()
        }
        last = now
      } catch {
        // offline or a short network error: the next tick tries again
      } finally {
        busy = false
      }
    }
    tick()
    const timer = setInterval(tick, every)
    const back = () => document.visibilityState === 'visible' && tick()
    document.addEventListener('visibilitychange', back)
    window.addEventListener('focus', back)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', back)
      window.removeEventListener('focus', back)
    }
  }, [every, fullEvery, key])
}
