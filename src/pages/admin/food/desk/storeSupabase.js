// Restaurants, menus, photos and papers in Jholzo's database (update 059), from Admin → Food → Restaurants.
// The same as the Food Desk: only the owner and executives can read or write any of it; the database refuses
// everyone else, whatever this page does. Uses the admin's own login.
import { supabase as sb } from '../../../../lib/supabase.js'
import { shrinkPhoto } from './image.js'

export const hasDatabase = !!sb

function friendly(error) {
  const msg = error?.message || String(error)
  if (/relation .* does not exist|could not find the table|schema cache/i.test(msg)) return new Error('Run database update 059 in Supabase first.')
  if (/row-level security|permission denied|not authorized/i.test(msg)) return new Error('This account is not allowed to change the desk.')
  if (/invalid login credentials/i.test(msg)) return new Error('Wrong email or password.')
  if (/failed to fetch|networkerror|network request failed|load failed/i.test(msg)) return new Error('No internet. Check the connection and try again.')
  return new Error(msg)
}
const check = ({ data, error }) => {
  if (error) throw friendly(error)
  return data
}

const ITEM_KEYS = ['restaurant_id', 'section', 'name', 'description', 'diet', 'price', 'variants', 'photo', 'available', 'bestseller', 'sort']
const pickItem = (it) => Object.fromEntries(ITEM_KEYS.filter((k) => k in it).map((k) => [k, it[k]]))

export const supabaseStore = {
  demo: false,

  async session() {
    const { data } = await sb.auth.getSession()
    const user = data.session?.user
    if (!user) return null
    const ok = check(await sb.rpc('is_desk'))
    return { email: user.email || '', canUse: ok === true }
  },
  async signIn(email, password) {
    check(await sb.auth.signInWithPassword({ email: email.trim(), password }))
    return this.session()
  },
  async signOut() {
    await sb.auth.signOut()
  },

  async listRestaurants() {
    const rows = check(await sb.from('food_restaurants')
      .select('*, food_menu_items(photo, available), food_restaurant_files(kind)')
      .order('updated_at', { ascending: false }))
    return rows.map(({ food_menu_items: items, food_restaurant_files: files, ...r }) => ({
      ...r,
      itemCount: items?.length ?? 0,
      photoCount: (items || []).filter((i) => i.photo).length,
      offCount: (items || []).filter((i) => !i.available).length,
      fileKinds: [...new Set((files || []).map((f) => f.kind))],
    }))
  },
  async getRestaurant(id) {
    return check(await sb.from('food_restaurants').select('*').eq('id', id).maybeSingle())
  },
  async createRestaurant(patch = {}) {
    return check(await sb.from('food_restaurants').insert(patch).select('*').single())
  },
  async updateRestaurant(id, patch) {
    return check(await sb.from('food_restaurants').update(patch).eq('id', id).select('*').single())
  },
  async deleteRestaurant(id) {
    // Its photos go too (best effort); menu and paper rows go with the restaurant row.
    const [r, items, files] = await Promise.all([this.getRestaurant(id), this.listItems(id), this.listFiles(id)])
    const photos = [...new Set([r?.cover_photo, ...(r?.cover_photos ?? []), ...items.map((i) => i.photo)].filter(Boolean))]
    if (photos.length) await sb.storage.from('food').remove(photos)
    if (files.length) await sb.storage.from('food-docs').remove(files.map((f) => f.path))
    check(await sb.from('food_restaurants').delete().eq('id', id))
  },

  async listItems(restaurantId) {
    return check(await sb.from('food_menu_items').select('*').eq('restaurant_id', restaurantId)
      .order('sort').order('created_at'))
  },
  async saveItem(item) {
    const row = pickItem(item)
    if (item.id) return check(await sb.from('food_menu_items').update(row).eq('id', item.id).select('*').single())
    return check(await sb.from('food_menu_items').insert(row).select('*').single())
  },
  async addItems(restaurantId, items) {
    if (!items.length) return []
    return check(await sb.from('food_menu_items').insert(items.map((it) => ({ ...pickItem(it), restaurant_id: restaurantId }))).select('*'))
  },
  // Every dish of one restaurant, with their photos (to paste a new menu). Returns how many went.
  async clearMenu(restaurantId) {
    const items = await this.listItems(restaurantId)
    const photos = [...new Set(items.map((i) => i.photo).filter(Boolean))]
    if (photos.length) await sb.storage.from('food').remove(photos)
    check(await sb.from('food_menu_items').delete().eq('restaurant_id', restaurantId))
    return items.length
  },
  async deleteItem(item) {
    if (item.photo) await sb.storage.from('food').remove([item.photo])
    check(await sb.from('food_menu_items').delete().eq('id', item.id))
  },

  async listFiles(restaurantId) {
    const rows = check(await sb.from('food_restaurant_files').select('*').eq('restaurant_id', restaurantId).order('created_at'))
    const paths = rows.map((r) => r.path)
    const { data: links } = paths.length ? await sb.storage.from('food-docs').createSignedUrls(paths, 6 * 3600) : { data: [] }
    return rows.map((r, i) => ({ ...r, url: links?.[i]?.signedUrl || '', pdf: r.path.endsWith('.pdf') }))
  },
  async addFile(restaurantId, kind, file) {
    const pdf = file.type === 'application/pdf'
    const body = pdf ? file : await shrinkPhoto(file, 2000, 650)
    const path = `${restaurantId}/${kind}-${Date.now()}.${pdf ? 'pdf' : 'jpg'}`
    check(await sb.storage.from('food-docs').upload(path, body, { contentType: pdf ? 'application/pdf' : 'image/jpeg' }))
    const row = check(await sb.from('food_restaurant_files').insert({ restaurant_id: restaurantId, kind, path }).select('*').single())
    const { data } = await sb.storage.from('food-docs').createSignedUrl(path, 6 * 3600)
    return { ...row, url: data?.signedUrl || '', pdf }
  },
  async deleteFile(file) {
    await sb.storage.from('food-docs').remove([file.path])
    check(await sb.from('food_restaurant_files').delete().eq('id', file.id))
  },

  // Cover and dish photos: the public "food" bucket, so the app can show them later.
  async uploadPhoto(restaurantId, file, prefix) {
    const blob = await shrinkPhoto(file, 1400, 320)
    const path = `${restaurantId}/${prefix}-${Date.now()}.jpg`
    check(await sb.storage.from('food').upload(path, blob, { contentType: 'image/jpeg' }))
    return path
  },
  async removePhoto(path) {
    if (path) await sb.storage.from('food').remove([path])
  },
  photoUrl(path) {
    return path ? sb.storage.from('food').getPublicUrl(path).data.publicUrl : ''
  },

  async exportAll() {
    const [restaurants, items, files] = await Promise.all([
      sb.from('food_restaurants').select('*').order('created_at').then(check),
      sb.from('food_menu_items').select('*').order('sort').then(check),
      sb.from('food_restaurant_files').select('*').order('created_at').then(check),
    ])
    return { restaurants, items, files }
  },
}
