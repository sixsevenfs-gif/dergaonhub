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

/** What an app link points at, for showing a saved link again. */
export function linkKind(link) {
  if (!link) return ['none', '']
  if (link === LINKS.grocery()) return ['grocery', '']
  if (link === LINKS.food()) return ['food', '']
  const p = link.match(/[?&]p=([^&]+)/)
  if (p) return ['product', p[1]]
  const r = link.match(/\/food\/r\/([^/?#]+)/)
  if (r) return ['restaurant', r[1]]
  return ['url', link]
}

/* ---------- banners (update 066) ---------- */

demo.banners = []
demo.updates = {
  ios_min_version: '', ios_latest_version: '', android_min_version_code: 0, android_latest_version_code: 0, update_message: '',
  ios_store_url: 'https://apps.apple.com/app/id6836980141', android_store_url: 'https://play.google.com/store/apps/details?id=com.jholzo.app',
}

/** Every banner (running or not), by place and order. Null before update 066. */
export async function listBanners() {
  if (!sb) return demo.banners.slice().sort((a, b) => a.place.localeCompare(b.place) || a.sort - b.sort)
  const { data, error } = await sb.from('app_banners').select('*').order('place').order('sort').order('created_at')
  if (error) {
    if (missing(error)) return null
    throw new Error(error.message)
  }
  return data
}

/** Adds a banner (no id) or changes one. */
export async function saveBanner(b) {
  // Times from the page's date boxes are the owner's local time; the database keeps them with the time zone.
  const at = (v) => {
    if (!v) return null
    const d = new Date(v)
    if (Number.isNaN(d.getTime())) throw new Error('Check the start and end times.')
    return d.toISOString()
  }
  const row = {
    place: b.place === 'food' ? 'food' : 'grocery', image: (b.image ?? '').trim(), title: (b.title ?? '').trim().slice(0, 80),
    link: (b.link ?? '').trim(), active: b.active !== false, sort: Number(b.sort) || 0, starts_at: at(b.starts_at), ends_at: at(b.ends_at),
  }
  if (!row.image) throw new Error('Add the picture first.')
  if (sb && !/^https:\/\//.test(row.image)) throw new Error('Upload the picture again.')
  if (row.starts_at && row.ends_at && row.ends_at <= row.starts_at) throw new Error('The end must be after the start.')
  if (!sb) {
    if (b.id) Object.assign(demo.banners.find((x) => x.id === b.id) ?? {}, row)
    else demo.banners.push({ ...row, id: `b${Date.now()}`, created_at: new Date().toISOString() })
    return
  }
  if (b.id) check(await sb.from('app_banners').update(row).eq('id', b.id))
  else check(await sb.from('app_banners').insert(row))
}

export async function deleteBanner(id) {
  if (!sb) {
    demo.banners = demo.banners.filter((b) => b.id !== id)
    return
  }
  check(await sb.from('app_banners').delete().eq('id', id))
}

/** Saves a new order for one place's banners (their position in the list). */
export async function reorderBanners(ids) {
  for (const [i, id] of ids.entries()) {
    if (!sb) {
      const b = demo.banners.find((x) => x.id === id)
      if (b) b.sort = i
    } else {
      check(await sb.from('app_banners').update({ sort: i }).eq('id', id))
    }
  }
}

/** Is it showing in the apps right now? */
export const bannerLive = (b, now = Date.now()) =>
  b.active && (!b.starts_at || new Date(b.starts_at).getTime() <= now) && (!b.ends_at || new Date(b.ends_at).getTime() > now)

/* ---------- app updates (update 066) ---------- */

const UPDATE_FIELDS = ['ios_min_version', 'ios_latest_version', 'android_min_version_code', 'android_latest_version_code', 'update_message', 'ios_store_url', 'android_store_url']

export async function appUpdateSettings() {
  if (!sb) return { ...demo.updates }
  const { data, error } = await sb.from('store_settings').select(UPDATE_FIELDS.join(',')).eq('id', 1).maybeSingle()
  if (error) {
    if (missing(error)) return null
    throw new Error(error.message)
  }
  return data
}

const VERSION = /^([0-9]+(\.[0-9]+){0,2})?$/
/** Compares "1.2" and "1.10.1" part by part (missing parts are 0). */
export function compareVersions(a, b) {
  const x = String(a || '0').split('.').map(Number)
  const y = String(b || '0').split('.').map(Number)
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0)
  return 0
}

export async function saveAppUpdateSettings(v) {
  const row = {
    ios_min_version: String(v.ios_min_version ?? '').trim(), ios_latest_version: String(v.ios_latest_version ?? '').trim(),
    android_min_version_code: Math.max(0, Math.round(Number(v.android_min_version_code) || 0)),
    android_latest_version_code: Math.max(0, Math.round(Number(v.android_latest_version_code) || 0)),
    update_message: String(v.update_message ?? '').trim().slice(0, 200),
    ios_store_url: String(v.ios_store_url ?? '').trim(), android_store_url: String(v.android_store_url ?? '').trim(),
  }
  if (!VERSION.test(row.ios_min_version) || !VERSION.test(row.ios_latest_version)) throw new Error('iPhone versions look like 1.1 or 1.2.3.')
  if (row.ios_min_version && row.ios_latest_version && compareVersions(row.ios_min_version, row.ios_latest_version) > 0) throw new Error('iPhone: "Must update below" can\'t be higher than "Newest version".')
  if (row.android_latest_version_code && row.android_min_version_code > row.android_latest_version_code) throw new Error('Android: "Must update below" can\'t be higher than "Newest version code".')
  for (const k of ['ios_store_url', 'android_store_url']) if (row[k] && !/^https:\/\//.test(row[k])) throw new Error('Store links start with https://')
  if (!sb) {
    Object.assign(demo.updates, row)
    return
  }
  check(await sb.from('store_settings').update(row).eq('id', 1))
}
