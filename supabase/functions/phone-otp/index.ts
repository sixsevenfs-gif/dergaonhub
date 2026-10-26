// Phone OTP with Message Central VerifyNow (no DLT needed). The site calls it with the customer's own
// login: { action: 'send', phone } sends a 4-digit SMS code, { action: 'verify', phone, code } checks it
// and marks the number verified for that phone browser (verified_phones).
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const { action, phone, code } = await req.json()
    if (!/^[0-9]{10}$/.test(String(phone ?? ''))) return json({ error: 'Enter a valid 10-digit phone number.' }, 400)

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
      const q = new URLSearchParams({ countryCode: '91', flowType: 'SMS', mobileNumber: phone, otpLength: '4' })
      const res = await fetch(`${API}/verification/v3/send?${q}`, { method: 'POST', headers: { authToken: await authToken() } })
      const body = await res.json().catch(() => ({}))
      const verificationId = body?.data?.verificationId
      if (!verificationId) return json({ error: 'Could not send the OTP. Please try again.' }, 502)
      await db.from('otp_requests').insert({ user_id: userId, phone, verification_id: String(verificationId) })
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
