import { useEffect, useState } from 'react'
import { Share, SquarePlus, X } from 'lucide-react'
import { btnAccent } from './ui.js'

const DISMISS_KEY = 'dergaon-a2hs-dismissed'
let deferredPrompt = null
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  deferredPrompt = e
})

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone

// Shown only after the customer's first completed order (plan section 6).
export default function AddToHomeSheet({ show }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let dismissed = false
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === '1'
    } catch {
      // ignore
    }
    setOpen(show && !dismissed && !isStandalone())
  }, [show])

  const close = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // ignore
    }
    setOpen(false)
  }

  const install = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt()
      await deferredPrompt.userChoice
      deferredPrompt = null
    }
    close()
  }

  if (!open) return null
  return (
    <div className="fixed inset-0 z-20 flex items-end bg-black/60" onClick={close}>
      <div className="mx-auto w-full max-w-md rounded-t-3xl border border-line bg-card p-5 pb-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <h2 className="text-xl font-bold">Add Dergaon Hub to your home screen</h2>
          <button type="button" aria-label="Close" onClick={close} className="-mr-2 -mt-1 flex h-10 w-10 items-center justify-center text-muted"><X size={22} /></button>
        </div>
        {isIOS() ? (
          <ol className="mt-4 space-y-3 text-muted">
            <li className="flex items-center gap-3"><Share size={22} className="text-accent" /> 1. Tap the Share button below</li>
            <li className="flex items-center gap-3"><SquarePlus size={22} className="text-accent" /> 2. Choose "Add to Home Screen"</li>
          </ol>
        ) : deferredPrompt ? (
          <button type="button" onClick={install} className={`${btnAccent} mt-5`}>Add to Home Screen</button>
        ) : (
          <p className="mt-4 text-muted">Open the browser menu (⋮) and tap "Add to Home screen".</p>
        )}
        <button type="button" onClick={close} className="mt-4 w-full text-center text-muted">Maybe later</button>
      </div>
    </div>
  )
}
