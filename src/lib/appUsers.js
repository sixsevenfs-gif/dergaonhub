// The apps' own users for the owner (database update 069): downloads (each app install), logins, Android /
// iPhone, versions and phones, counted apart from the website. Test phones can be marked or deleted, and
// counting can start from a chosen moment. In demo mode (no keys) it shows sample phones kept in this tab.
import { supabase as sb } from './supabase.js'

const check = ({ data, error }) => {
  if (error) throw new Error(error.message || 'Something went wrong. Please try again.')
  return data
}
const missing = (e) => /does not exist|Could not find|schema cache|PGRST20[0-9]/i.test(String(e?.message ?? e))

// Apple's model codes for the iPhones people use, in case an older app sent the code itself.
const IPHONES = {
  'iPhone12,1': 'iPhone 11', 'iPhone12,3': 'iPhone 11 Pro', 'iPhone12,5': 'iPhone 11 Pro Max', 'iPhone12,8': 'iPhone SE (2nd gen)',
  'iPhone13,1': 'iPhone 12 mini', 'iPhone13,2': 'iPhone 12', 'iPhone13,3': 'iPhone 12 Pro', 'iPhone13,4': 'iPhone 12 Pro Max',
  'iPhone14,4': 'iPhone 13 mini', 'iPhone14,5': 'iPhone 13', 'iPhone14,2': 'iPhone 13 Pro', 'iPhone14,3': 'iPhone 13 Pro Max', 'iPhone14,6': 'iPhone SE (3rd gen)',
  'iPhone14,7': 'iPhone 14', 'iPhone14,8': 'iPhone 14 Plus', 'iPhone15,2': 'iPhone 14 Pro', 'iPhone15,3': 'iPhone 14 Pro Max',
  'iPhone15,4': 'iPhone 15', 'iPhone15,5': 'iPhone 15 Plus', 'iPhone16,1': 'iPhone 15 Pro', 'iPhone16,2': 'iPhone 15 Pro Max',
  'iPhone17,3': 'iPhone 16', 'iPhone17,4': 'iPhone 16 Plus', 'iPhone17,1': 'iPhone 16 Pro', 'iPhone17,2': 'iPhone 16 Pro Max', 'iPhone17,5': 'iPhone 16e',
}
export const deviceName = (model) => IPHONES[model] ?? (model || 'Unknown phone')

export const SHOWS = [
  ['counted', 'Counted'],
  ['logged_in', 'Logged in'],
  ['test', 'Marked test'],
  ['dev', 'Test builds'],
  ['before', 'Before counting'],
]

/* ---------- demo data (this tab only) ---------- */

const demo = (() => {
  const now = Date.now()
  const ago = (min) => new Date(now - min * 60_000).toISOString()
  const install = (n, extra) => ({
    id: `i${n}`, platform: 'android', env: 'prod', app_version: '1.1.0', build: '2', os_version: '14', device_model: 'Xiaomi Redmi Note 10',
    user_id: null, phone: '', name: '', logged_in: false, first_seen_at: ago(60 * 24 * n), last_seen_at: ago(n * 7), opens: 3 + n,
    first_login_at: null, last_login_at: null, logins: 0, is_test: false, ...extra,
  })
  const installs = [
    install(1, { phone: '9876543211', name: 'Asha Devi', logged_in: true, first_login_at: ago(60 * 24), last_login_at: ago(60 * 24), logins: 1 }),
    install(2, { platform: 'ios', app_version: '1.1', os_version: '18.2', device_model: 'iPhone 12', phone: '9876543212', name: 'Rahul Das', logged_in: true, first_login_at: ago(60 * 47), last_login_at: ago(60 * 47), logins: 2 }),
    install(3, { device_model: 'Samsung Galaxy M14', os_version: '13' }),
    install(4, { platform: 'ios', app_version: '1.1', os_version: '17.6', device_model: 'iPhone 13', phone: '9181061864', name: 'Owner', logged_in: true, logins: 4, is_test: true, first_login_at: ago(60 * 90), last_login_at: ago(30) }),
    install(5, { env: 'dev', platform: 'ios', app_version: '1.1', device_model: 'iPhone 17 Pro (Simulator)', os_version: '27.2' }),
  ]
  return { installs, settings: { app_count_from: null, tg_app_users: true }, ago }
})()

const counted = (i, from) => i.env === 'prod' && !i.is_test && (!from || i.first_seen_at >= from)

function demoSummary() {
  const from = demo.settings.app_count_from
  const list = demo.installs.filter((i) => counted(i, from))
  const today = new Date().toDateString()
  const days = Array.from({ length: 30 }, (_, k) => {
    const d = new Date(Date.now() - (29 - k) * 86_400_000)
    const key = d.toISOString().slice(0, 10)
    return { day: key, installs: list.filter((i) => i.first_seen_at.slice(0, 10) === key).length, customers: list.filter((i) => i.first_login_at?.slice(0, 10) === key).length }
  })
  return {
    count_from: from, tg_app_users: demo.settings.tg_app_users, installs: list.length,
    android: list.filter((i) => i.platform === 'android').length, ios: list.filter((i) => i.platform === 'ios').length,
    logged_in: list.filter((i) => i.logged_in).length, customers: new Set(list.filter((i) => i.phone).map((i) => i.phone)).size,
    today: list.filter((i) => new Date(i.first_seen_at).toDateString() === today).length,
    new_7d: list.filter((i) => Date.now() - new Date(i.first_seen_at) < 7 * 86_400_000).length,
    active_today: list.filter((i) => new Date(i.last_seen_at).toDateString() === today).length,
    active_7d: list.filter((i) => Date.now() - new Date(i.last_seen_at) < 7 * 86_400_000).length,
    logins_today: 1, test: demo.installs.filter((i) => i.is_test).length, dev: demo.installs.filter((i) => i.env === 'dev').length,
    before: from ? demo.installs.filter((i) => i.first_seen_at < from).length : 0, by_day: days,
    versions: [{ platform: 'android', version: '1.1.0', n: list.filter((i) => i.platform === 'android').length }, { platform: 'ios', version: '1.1', n: list.filter((i) => i.platform === 'ios').length }].filter((v) => v.n),
  }
}

/* ---------- reads ---------- */

/** The App users numbers. Null before update 069. */
export async function appUsers() {
  if (!sb) return demoSummary()
  const { data, error } = await sb.rpc('admin_app_users')
  if (error) {
    if (missing(error)) return null
    throw new Error(error.message)
  }
  return data
}

/** The phones, newest first, for one of SHOWS. */
export async function listInstalls({ show = 'counted', search = '', countFrom = null } = {}) {
  const s = search.trim().toLowerCase()
  const keep = (i) => ({
    counted: counted(i, countFrom), logged_in: counted(i, countFrom) && i.logged_in, test: i.is_test, dev: i.env === 'dev',
    before: Boolean(countFrom) && i.first_seen_at < countFrom,
  })[show]
  const match = (i) => !s || [i.phone, i.name, i.device_model, deviceName(i.device_model)].some((v) => String(v).toLowerCase().includes(s))
  if (!sb) return structuredClone(demo.installs.filter((i) => keep(i) && match(i)).sort((a, b) => b.first_seen_at.localeCompare(a.first_seen_at)))
  let q = sb.from('app_installs').select('*')
  if (show === 'counted' || show === 'logged_in') {
    q = q.eq('env', 'prod').eq('is_test', false)
    if (countFrom) q = q.gte('first_seen_at', countFrom)
    if (show === 'logged_in') q = q.eq('logged_in', true)
  } else if (show === 'test') q = q.eq('is_test', true)
  else if (show === 'dev') q = q.eq('env', 'dev')
  else if (show === 'before') q = countFrom ? q.lt('first_seen_at', countFrom) : q.eq('id', '00000000-0000-0000-0000-000000000000')
  const safe = s.replace(/[^a-z0-9 ]/g, '').trim()
  if (safe) q = q.or(['phone', 'name', 'device_model'].map((c) => `${c}.ilike.*${safe}*`).join(','))
  const { data, error } = await q.order('first_seen_at', { ascending: false }).limit(300)
  if (error) {
    if (missing(error)) return null
    throw new Error(error.message)
  }
  return data
}

/* ---------- the owner's actions ---------- */

export async function markInstalls(ids, test) {
  if (!sb) {
    for (const i of demo.installs) if (ids.includes(i.id)) i.is_test = test
    return
  }
  check(await sb.rpc('admin_app_installs_mark', { p_ids: ids, p_test: test }))
}

/** Delete chosen phones, or all of one kind: 'test', 'dev' or 'before' (counting started). Returns how many. */
export async function deleteInstalls({ ids = [], what = '' }) {
  if (!sb) {
    const from = demo.settings.app_count_from
    const gone = (i) => (what === 'test' ? i.is_test : what === 'dev' ? i.env === 'dev' : what === 'before' ? from && i.first_seen_at < from : ids.includes(i.id))
    const before = demo.installs.length
    demo.installs = demo.installs.filter((i) => !gone(i))
    return before - demo.installs.length
  }
  return check(await sb.rpc('admin_app_installs_delete', { p_ids: ids, p_what: what }))
}

/** Count from this moment (ISO), or everything (null). */
export async function setCountFrom(iso) {
  if (!sb) {
    demo.settings.app_count_from = iso
    return
  }
  check(await sb.from('store_settings').update({ app_count_from: iso }).eq('id', 1))
}

export async function setTelegramNewUsers(on) {
  if (!sb) {
    demo.settings.tg_app_users = on
    return
  }
  check(await sb.from('store_settings').update({ tg_app_users: on }).eq('id', 1))
}
