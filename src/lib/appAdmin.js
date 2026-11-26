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
  return invokeCampaign(saved.id)
}

/** Asks push-notify to send a saved notification now. */
async function invokeCampaign(id) {
  const { data, error } = await sb.functions.invoke('push-notify', { body: { campaign: id } })
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
  categories: () => 'https://jholzo.com/?open=categories',
  wallet: () => 'https://jholzo.com/wallet',
  product: (id) => `https://jholzo.com/?p=${id}`,
  restaurant: (id) => `https://jholzo.com/food/r/${id}`,
}

/** What an app link points at, for showing a saved link again. */
export function linkKind(link) {
  if (!link) return ['none', '']
  if (link === LINKS.grocery()) return ['grocery', '']
  if (link === LINKS.food()) return ['food', '']
  if (link === LINKS.categories()) return ['categories', '']
  if (link === LINKS.wallet()) return ['wallet', '']
  const p = link.match(/[?&]p=([^&]+)/)
  if (p) return ['product', p[1]]
  const r = link.match(/\/food\/r\/([^/?#]+)/)
  if (r) return ['restaurant', r[1]]
  return ['url', link]
}

/* ---------- banners (update 066) ---------- */

// Where a banner shows in the apps.
export const PLACES = [
  ['grocery', 'Grocery home'],
  ['food', 'Food home'],
  ['both', 'Both homes'],
]

demo.banners = [
  { id: 'b1', created_at: new Date().toISOString(), place: 'grocery', image: '/app-banners/fresh-groceries.jpg', title: 'Fresh groceries, delivered to your door', link: 'https://jholzo.com/?open=categories', active: true, sort: 0, starts_at: null, ends_at: null },
  { id: 'b2', created_at: new Date().toISOString(), place: 'grocery', image: '/app-banners/share-and-earn.jpg', title: 'Share Jholzo, earn rewards', link: 'https://jholzo.com/wallet', active: true, sort: 1, starts_at: null, ends_at: null },
]
demo.control = {
  update_mode: 'off', update_version: '', update_platforms: 'both', update_title: '', update_message: '',
  ios_store_url: 'https://apps.apple.com/app/id6836980141', android_store_url: 'https://play.google.com/store/apps/details?id=com.jholzo.app',
  app_status: 'live', app_status_title: '', app_status_message: '',
}

/** Every banner (running or not), in the order the apps slide them. Null before update 066. */
export async function listBanners() {
  if (!sb) return demo.banners.slice().sort((a, b) => a.sort - b.sort)
  const { data, error } = await sb.from('app_banners').select('*').order('sort').order('created_at')
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
    place: PLACES.some(([k]) => k === b.place) ? b.place : 'grocery', image: (b.image ?? '').trim(), title: (b.title ?? '').trim().slice(0, 80),
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

/** Saves a new order for the banners (their position in the list). */
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

/** Running banners on one home ("grocery" or "food"), in order. */
export const bannersOn = (banners, place) => (banners ?? []).filter((b) => (b.place === place || b.place === 'both') && bannerLive(b))

/* ---------- app update and app status (update 066), one setting for both apps ---------- */

// What the apps show when the owner writes nothing (the same words are in the apps).
export const DEFAULT_UPDATE = 'A new version of Jholzo is here with new features and fixes. Please update to keep using the app.'
export const DEFAULT_PAUSE_TITLE = 'Currently under maintenance'
export const DEFAULT_PAUSE = "We're making Jholzo better. We will inform you as soon as it's back."

const CONTROL_FIELDS = Object.keys(demo.control)

export async function appControl() {
  if (!sb) return { ...demo.control }
  const { data, error } = await sb.from('store_settings').select(CONTROL_FIELDS.join(',')).eq('id', 1).maybeSingle()
  if (error) {
    if (missing(error)) return null
    throw new Error(error.message)
  }
  return data
}

const VERSION = /^[0-9]+(\.[0-9]+){0,3}$/
/** Compares "1.2" and "1.10.1" part by part (missing parts are 0). */
export function compareVersions(a, b) {
  const x = String(a || '0').split('.').map(Number)
  const y = String(b || '0').split('.').map(Number)
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0)
  return 0
}

/** Saves part of the update / status settings. */
export async function saveAppControl(patch) {
  const row = {}
  for (const k of CONTROL_FIELDS) if (k in patch) row[k] = typeof patch[k] === 'string' ? patch[k].trim() : patch[k]
  if ('update_version' in row) row.update_version = row.update_version.replace(/^v/i, '')
  if (row.update_version && !VERSION.test(row.update_version)) throw new Error('A version looks like 1.2 or 1.2.1.')
  for (const k of ['ios_store_url', 'android_store_url']) if (row[k] && !/^https:\/\//.test(row[k])) throw new Error('Store links start with https://')
  for (const [k, max] of [['update_title', 60], ['update_message', 200], ['app_status_title', 60], ['app_status_message', 200]]) {
    if (row[k]) row[k] = row[k].slice(0, max)
  }
  if (!sb) {
    Object.assign(demo.control, row)
    return
  }
  check(await sb.from('store_settings').update(row).eq('id', 1))
}

/** The newest version seen on phones, per app ("android" / "ios"): the store's, once phones have updated. */
export function newestSeen(versions) {
  const best = {}
  for (const v of versions ?? []) {
    if (v.version === '?') continue
    if (!best[v.platform] || compareVersions(v.version, best[v.platform]) > 0) best[v.platform] = v.version
  }
  return best
}

/** Does the update setting reach this app ("android" / "ios")? */
export const updateFor = (control, platform) => control?.update_mode !== 'off' && ['both', platform].includes(control?.update_platforms)

/* ---------- the App home in numbers (update 066) ---------- */

export async function appOverview() {
  if (!sb) {
    const live = demo.banners.filter((b) => bannerLive(b))
    return {
      devices: { total: 148, android: 117, ios: 31, logged_in: 96, new_7d: 23 },
      versions: [
        { platform: 'android', version: '1.1.0', phones: 92 }, { platform: 'android', version: '1.0.0', phones: 25 },
        { platform: 'ios', version: '1.1', phones: 24 }, { platform: 'ios', version: '1.0', phones: 7 },
      ],
      campaigns: { count_30d: demo.campaigns.length, sent_30d: demo.campaigns.reduce((t, c) => t + (c.sent || 0), 0), failed_30d: 0 },
      last_campaign: demo.campaigns.at(-1) ?? null,
      banners: { total: demo.banners.length, live: live.length, grocery: bannersOn(demo.banners, 'grocery').length, food: bannersOn(demo.banners, 'food').length },
    }
  }
  const { data, error } = await sb.rpc('admin_app_overview')
  if (error) {
    if (missing(error)) return null
    throw new Error(error.message)
  }
  return data
}

/* ---------- heavy rain notice and maintenance visitors (update 071) ---------- */

// What the apps show when the owner writes nothing (the same words are in the apps).
export const DEFAULT_RAIN = "It's raining heavily in Dergaon, so orders may take a little longer today. Thank you for your patience."
// Where the rain notice shows.
export const RAIN_PLACES = [
  ['both', 'Food and Grocery'],
  ['food', 'Food only'],
  ['grocery', 'Grocery only'],
]

demo.rain = { rain_on: false, rain_message: '', rain_place: 'both' }
demo.visits = [
  { install_id: 'i1', platform: 'android', env: 'prod', phone: '9000000011', name: 'Asha Devi', device_model: 'Xiaomi Redmi Note 10', app_version: '1.1.0',
    first_at: new Date(Date.now() - 50 * 60000).toISOString(), last_at: new Date(Date.now() - 20 * 60000).toISOString(), opens: 2, is_test: false, reachable: true },
  { install_id: 'i2', platform: 'ios', env: 'prod', phone: '', name: '', device_model: 'iPhone 13', app_version: '1.1',
    first_at: new Date(Date.now() - 35 * 60000).toISOString(), last_at: new Date(Date.now() - 35 * 60000).toISOString(), opens: 1, is_test: false, reachable: true },
  { install_id: 'i3', platform: 'android', env: 'prod', phone: '9000000022', name: 'Bikash', device_model: 'Samsung Galaxy M31', app_version: '1.1.0',
    first_at: new Date(Date.now() - 10 * 60000).toISOString(), last_at: new Date(Date.now() - 10 * 60000).toISOString(), opens: 1, is_test: false, reachable: false },
]
demo.windows = [{ id: 1, started_at: new Date(Date.now() - 60 * 60000).toISOString(), ended_at: null, notified_at: null, visitors: 3 }]

/** The heavy rain notice. Null before update 071. */
export async function rainNotice() {
  if (!sb) return { ...demo.rain }
  const { data, error } = await sb.from('store_settings').select('rain_on,rain_message,rain_place').eq('id', 1).maybeSingle()
  if (error) {
    if (missing(error)) return null
    throw new Error(error.message)
  }
  return data
}

export async function saveRain({ rain_on, rain_message, rain_place }) {
  const row = {
    rain_on: !!rain_on,
    rain_message: String(rain_message ?? '').trim().slice(0, 200),
    rain_place: RAIN_PLACES.some(([k]) => k === rain_place) ? rain_place : 'both',
  }
  if (!sb) {
    Object.assign(demo.rain, row)
    return
  }
  check(await sb.from('store_settings').update(row).eq('id', 1))
}

/** The maintenances so far and who opened the app during one (the newest, unless `window` is given).
 *  Null before update 071. */
export async function maintenanceVisits(window = null) {
  if (!sb) return { status: demo.control.app_status, window: 1, windows: demo.windows, visitors: demo.visits }
  const { data, error } = await sb.rpc('admin_maintenance_visits', { p_window: window })
  if (error) {
    if (missing(error)) return null
    throw new Error(error.message)
  }
  return data
}

/** A notification to just the people who opened the app during that maintenance. Returns { targeted, sent, failed }. */
export async function notifyMaintenanceVisitors(window, { title, body, link = '', image = '' }) {
  if (!title.trim() || !body.trim()) throw new Error('Write a title and a message.')
  if (!sb) {
    const w = demo.windows.find((x) => x.id === window)
    if (w) w.notified_at = new Date().toISOString()
    demo.campaigns.push({ id: `c${demo.campaigns.length + 1}`, created_at: new Date().toISOString(), title, body, image, link,
      audience: 'maintenance', phones: [], status: 'sent', targeted: 2, sent: 2, failed: 0 })
    return { targeted: 2, sent: 2, failed: 0 }
  }
  const { data: id, error } = await sb.rpc('admin_maintenance_notify', { p_window: window, p_title: title.trim(), p_body: body.trim(), p_link: link, p_image: image })
  if (error) throw new Error(error.message)
  return invokeCampaign(id)
}
