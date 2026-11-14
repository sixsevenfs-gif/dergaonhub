// The Jholzo Partner Android app shows the rider page inside the app and adds window.JholzoPartner.
// In a normal browser nothing here does anything.
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase.js'

const app = () => (typeof window === 'undefined' ? null : window.JholzoPartner)

export const inPartnerApp = () => !!app()

// The app rings for new orders even when it is closed, so it needs a login of its own that it can keep
// fresh in the background (the page's login only refreshes while the page is open). Called right after
// the rider logs in; the password is not kept anywhere.
export async function linkPartnerApp(email, password) {
  if (!app()) return
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    if (!res.ok) return
    const s = await res.json()
    app().session(JSON.stringify({
      access_token: s.access_token,
      refresh_token: s.refresh_token,
      expires_at: s.expires_at ?? Math.floor(Date.now() / 1000) + (s.expires_in ?? 3600),
      user_id: s.user?.id ?? '',
    }))
  } catch {
    // No alerts login: the app shows "Order alerts are off, log in again".
  }
}

// Who is logged in on the page ('' = nobody). The app compares it with its own alerts login.
export function partnerAppUser(userId) {
  try {
    app()?.user(userId || '')
  } catch { /* an older app */ }
}

export function partnerAppSignedOut() {
  try {
    app()?.signedOut()
  } catch { /* an older app */ }
}

// Opens the phone's share sheet with a file (the bill PDF). true when the app took it.
export async function partnerAppShare(blob, name) {
  if (!app()?.shareFile) return false
  try {
    const base64 = await new Promise((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
      r.onerror = () => reject(r.error)
      r.readAsDataURL(blob)
    })
    return !!app().shareFile(name, blob.type || 'application/octet-stream', base64)
  } catch {
    return false
  }
}
