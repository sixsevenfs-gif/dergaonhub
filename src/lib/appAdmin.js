// The App part of the admin: notifications (update 065), and the pictures they use.
// With the database it uses the owner's login (the database and push-notify check it again);
// in demo mode (no keys) nothing is sent and the history lives in this tab only.
import { supabase as sb } from './supabase.js'
import { compressImage } from './image.js'

const check = ({ data, error }) => {
  if (error) throw new Error(error.message || 'Something went wrong. Please try again.')
  return data
}
const missing = (e) => /does not exist|Could not find|schema cache|PGRST20[0-9]/i.test(String(e?.message ?? e))

const demo = { campaigns: [] }

/** A data URL (from compressImage) as a Blob, without fetch() (the site's CSP blocks data: fetches). */
function dataUrlBlob(dataUrl) {
  const [head, b64] = dataUrl.split(',')
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: head.match(/data:([^;]+)/)?.[1] ?? 'image/jpeg' })
}

/** Shrinks a photo and puts it in the public app-media bucket; returns its web address. */
export async function uploadAppMedia(file, folder, maxSize = 1200, maxKB = 220) {
  const dataUrl = await compressImage(file, maxSize, maxKB)
  if (!sb) return dataUrl
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
  check(await sb.storage.from('app-media').upload(path, dataUrlBlob(dataUrl), { contentType: 'image/jpeg', cacheControl: '31536000' }))
  return sb.storage.from('app-media').getPublicUrl(path).data.publicUrl
}

/* ---------- notifications ---------- */

export const AUDIENCES = [
  ['all', 'Everyone with the app'],
  ['grocery', 'Grocery customers'],
  ['food', 'Food customers'],
  ['android', 'Android phones only'],
  ['ios', 'iPhones only'],
  ['phones', 'Only these numbers'],
]

/** Phones with the app, and how many a choice reaches. Null before update 065. */
export async function pushAudience(audience, phones = []) {
  if (!sb) return { audience: audience === 'phones' ? phones.length : 12, android: 9, ios: 3, logged_in: 7 }
  const { data, error } = await sb.rpc('push_audience_size', { p_audience: audience, p_phones: phones })
  if (error) {
    if (missing(error)) return null
    throw new Error(error.message)
  }
  return data
}

export async function pushCampaigns() {
  if (!sb) return demo.campaigns.slice().reverse()
  const { data, error } = await sb.from('push_campaigns').select('*').order('created_at', { ascending: false }).limit(30)
  if (error) {
    if (missing(error)) return null
    throw new Error(error.message)
  }
  return data
}

/** Saves the notification and asks push-notify to send it now. Returns { targeted, sent, failed }. */
export async function sendPush({ title, body, image = '', link = '', audience = 'all', phones = [] }) {
  const row = { title: title.trim(), body: body.trim(), image: image.trim(), link: link.trim(), audience, phones }
  if (!row.title || !row.body) throw new Error('Write a title and a message.')
  if (audience === 'phones' && !phones.length) throw new Error('Add at least one 10-digit number.')
  if (!sb) {
    const sent = { ...row, id: `c${demo.campaigns.length + 1}`, created_at: new Date().toISOString(), status: 'sent', targeted: 12, sent: 11, failed: 1 }
    demo.campaigns.push(sent)
    return sent
  }
  const saved = check(await sb.from('push_campaigns').insert(row).select('id').single())
  const { data, error } = await sb.functions.invoke('push-notify', { body: { campaign: saved.id } })
  if (error) {
    // The function's own message, when it gave one.
    let msg = error.message
    try {
      msg = (await error.context?.json())?.error || msg
    } catch {
      // keep the general message
    }
    throw new Error(msg === 'Failed to send a request to the Edge Function' ? 'The push-notify function is not deployed yet.' : msg)
  }
  return data
}

/** Where a notification or banner opens in the apps (the apps understand these website links). */
export const LINKS = {
  grocery: () => 'https://jholzo.com/',
  food: () => 'https://jholzo.com/?mode=food',
  product: (id) => `https://jholzo.com/?p=${id}`,
  restaurant: (id) => `https://jholzo.com/food/r/${id}`,
}
