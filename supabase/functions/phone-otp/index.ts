// Phone OTP with Message Central VerifyNow (no DLT needed). The site calls it with the customer's own
// login: { action: 'send', phone } sends a 4-digit SMS code, { action: 'verify', phone, code } checks it
// and marks the number verified for that phone browser (verified_phones).
//
// Credits (update 024): each SMS takes one off store_settings.otp_credits_left, and Telegram warns at
// otp_alert_at, 10 and 0. If sending fails 3 times within 15 minutes (balance over, service down), OTP
// switches itself off so customers can still order, and Telegram says so.
//
// Deploy:  npx supabase functions deploy phone-otp --project-ref <your project ref>
// Secrets: npx supabase secrets set MC_CUSTOMER_ID=C-XXXXXXXX MC_PASSWORD=<your Message Central password> --project-ref <ref>
import { createClient } from 'npm:@supabase/supabase-js@2.75.0'

const API = 'https://cpaas.messagecentral.com'
const MAX_PER_HOUR = 5 // OTPs per phone browser and per number, so nobody can run up the bill

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

// Message Central login token (cached while this function instance is warm).
let token = ''
let tokenAt = 0
async function authToken(): Promise<string> {
  if (token && Date.now() - tokenAt < 30 * 60_000) return token
  const q = new URLSearchParams({
    customerId: Deno.env.get('MC_CUSTOMER_ID') ?? '',
    key: btoa(Deno.env.get('MC_PASSWORD') ?? ''),
    scope: 'NEW',
    country: '91',
  })
  const res = await fetch(`${API}/auth/v1/authentication/token?${q}`, { headers: { accept: '*/*' } })
  const body = await res.json().catch(() => ({}))
  if (!body?.token) throw new Error('OTP service login failed. Check MC_CUSTOMER_ID and MC_PASSWORD.')
  token = body.token
  tokenAt = Date.now()
  return token
}

// A message to the founder's Telegram (same bot and chat as the order alerts). Never throws.
async function telegram(text: string) {
  const bot = Deno.env.get('TELEGRAM_BOT_TOKEN')
  const chats = (Deno.env.get('TELEGRAM_CHAT_ID') ?? '').split(',').map((c) => c.trim()).filter(Boolean)
  if (!bot) return
  await Promise.all(chats.map((chat_id) =>
    fetch(`https://api.telegram.org/bot${bot}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id, text }),
    }).catch(() => null)))
}

type Db = ReturnType<typeof createClient>
const settings = async (db: Db) =>
  (await db.from('store_settings').select('otp_credits_left, otp_alert_at, otp_failures, otp_failed_at').eq('id', 1).maybeSingle()).data

// One SMS sent: one credit less, a warning when it gets low. Before update 024 there is nothing to count.
async function creditUsed(db: Db) {
  const s = await settings(db)
  if (!s || s.otp_credits_left == null) return
  const left = Math.max(0, s.otp_credits_left - 1)
  await db.from('store_settings').update({ otp_credits_left: left, otp_failures: 0 }).eq('id', 1)
  if (left === s.otp_alert_at || left === 10 || left === 0) {
    await telegram(left === 0
      ? '🔴 Jholzo OTP: credits khatam (0 left). Message Central me abhi recharge karo, phir Admin → Settings me "OTP credits left" update karo.'
      : `⚠️ Jholzo OTP: sirf ${left} OTP bache hain. Message Central me recharge kar lo, phir Admin → Settings me naya number daalo.`)
  }
}

// Sending failed. 3 failures within 15 minutes: switch OTP off so orders don't stop, and tell the founder.
// Returns true when OTP is now off.
async function sendFailed(db: Db, reason: string) {
  const s = await settings(db)
  if (!s) return false
  const recent = s.otp_failed_at && Date.now() - new Date(s.otp_failed_at).getTime() < 15 * 60_000
  const failures = (recent ? s.otp_failures : 0) + 1
  const off = failures >= 3
  await db.from('store_settings').update({
    otp_failures: off ? 0 : failures, otp_failed_at: new Date().toISOString(),
    ...(off ? { otp_required: false, otp_auto_off: true } : {}),
  }).eq('id', 1)
  if (off) {
    await telegram(`🔴 Jholzo OTP band ho gaya (SMS nahi ja raha: ${reason}). Customers ab bina OTP order kar sakte hain.\nMessage Central balance check / recharge karo, phir Admin → Settings me "Phone OTP" wapas ON karo.`)
  }
  return off
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const { action, phone, code } = await req.json()
    if (!/^[6-9][0-9]{9}$/.test(String(phone ?? ''))) return json({ error: 'Enter a valid 10-digit mobile number.' }, 400)

    const url = Deno.env.get('SUPABASE_URL')!
    const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const { data: auth } = await caller.auth.getUser()
    if (!auth.user) return json({ error: 'Please reload the page and try again.' }, 401)
    const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const userId = auth.user.id

    if (action === 'send') {
      const since = new Date(Date.now() - 60 * 60_000).toISOString()
      const [{ count: byUser }, { count: byPhone }] = await Promise.all([
        db.from('otp_requests').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', since),
        db.from('otp_requests').select('id', { count: 'exact', head: true }).eq('phone', phone).gte('created_at', since),
      ])
      if ((byUser ?? 0) >= MAX_PER_HOUR || (byPhone ?? 0) >= MAX_PER_HOUR) {
        return json({ error: 'Too many OTPs. Please try again after some time, or call us.' }, 429)
      }
      // OTP switched itself off earlier (service down): let the customer through without an SMS.
      const { data: store } = await db.from('store_settings').select('otp_required').eq('id', 1).maybeSingle()
      if (store && !store.otp_required) return json({ skip: true })
      const q = new URLSearchParams({ countryCode: '91', flowType: 'SMS', mobileNumber: phone, otpLength: '4' })
      let body: Record<string, any> = {}
      try {
        const res = await fetch(`${API}/verification/v3/send?${q}`, { method: 'POST', headers: { authToken: await authToken() } })
        body = await res.json().catch(() => ({}))
      } catch (err) {
        body = { message: err instanceof Error ? err.message : String(err) }
      }
      const verificationId = body?.data?.verificationId
      if (!verificationId) {
        if (await sendFailed(db, String(body?.message ?? body?.responseCode ?? 'no reply'))) return json({ skip: true })
        return json({ error: 'Could not send the OTP. Please try again.' }, 502)
      }
      await db.from('otp_requests').insert({ user_id: userId, phone, verification_id: String(verificationId) })
      await creditUsed(db)
      return json({ sent: true, timeout: Number(body?.data?.timeout) || 60 })
    }

    if (action === 'verify') {
      if (!/^[0-9]{4,8}$/.test(String(code ?? ''))) return json({ error: 'Enter the OTP from the SMS.' }, 400)
      const { data: last } = await db.from('otp_requests').select('verification_id')
        .eq('user_id', userId).eq('phone', phone).gte('created_at', new Date(Date.now() - 15 * 60_000).toISOString())
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (!last) return json({ error: 'The OTP has expired. Please send a new one.' }, 400)
      const q = new URLSearchParams({ verificationId: last.verification_id, code: String(code) })
      const res = await fetch(`${API}/verification/v3/validateOtp?${q}`, { headers: { authToken: await authToken() } })
      const body = await res.json().catch(() => ({}))
      const status = body?.data?.verificationStatus
      const rc = Number(body?.responseCode ?? body?.data?.responseCode)
      if (status === 'VERIFICATION_COMPLETED' || rc === 703) {
        await db.from('verified_phones').upsert({ user_id: userId, phone })
        return json({ verified: true })
      }
      const error = rc === 702 ? 'Wrong OTP. Please check and try again.' : rc === 705 ? 'The OTP has expired. Please send a new one.' : 'Could not verify the OTP. Please try again.'
      return json({ verified: false, error }, 400)
    }

    return json({ error: 'Unknown action.' }, 400)
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
