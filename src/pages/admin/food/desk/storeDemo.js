// Demo desk: everything stays in this browser only (localStorage). Used when the page has no database
// settings, or with ?demo in the address, to try the desk without touching real data.
import { shrinkPhoto, blobToDataUrl } from './image.js'

const KEY = 'jholzo-food-desk-demo-v1'
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`)
const now = () => new Date().toISOString()
const wait = (ms = 120) => new Promise((r) => setTimeout(r, ms))

const EMPTY = {
  status: 'talking', name: '', owner_name: '', phone: '', whatsapp: '', address: '', area: '', maps_link: '',
  lat: null, lng: null, cuisines: [], food_type: '', opens_at: '', closes_at: '', closed_on: '',
  prep_minutes: null, delivery_minutes: null, cost_for_two: null, min_order: null, packing_fee: null, offer: '',
  deal_type: '', deal_value: null, pay_when: '', upi_id: '', fssai_number: '', fssai_expiry: null, gst_number: '',
  agreement_signed: false, sticker_given: false, cover_photo: '', cover_photos: [], notes: '', drop_reason: '',
}

function seed() {
  const a = uid()
  const b = uid()
  const t = now()
  const item = (restaurant_id, sort, section, name, diet, price, variants = [], extra = {}) => ({
    id: uid(), created_at: t, updated_at: t, restaurant_id, sort, section, name, description: '', diet,
    price, variants, photo: '', available: true, bestseller: false, ...extra,
  })
  return {
    restaurants: [
      {
        ...EMPTY, id: a, created_at: t, updated_at: t, status: 'agreed', name: 'Momo Point (sample)', owner_name: 'Rahul',
        phone: '9800000001', whatsapp: '9800000001', area: 'Dergaon Bazaar', address: 'Near the bus stand',
        cuisines: ['Momos', 'Chinese'], food_type: 'both', opens_at: '11:00', closes_at: '21:00', closed_on: 'Tuesday',
        prep_minutes: 15, delivery_minutes: 30, cost_for_two: 200, deal_type: 'markup', deal_value: 10, pay_when: 'pickup',
      },
      {
        ...EMPTY, id: b, created_at: t, updated_at: t, name: 'Biryani House (sample)', phone: '9800000002',
        cuisines: ['Biryani'], food_type: 'both', notes: 'Owner asked to come back on Monday with the agreement.',
      },
    ],
    items: [
      item(a, 1, 'Momos', 'Veg Momos', 'veg', 60, [{ label: 'Half', price: 60 }, { label: 'Full', price: 100 }], { bestseller: true }),
      item(a, 2, 'Momos', 'Chicken Momos', 'nonveg', 70, [{ label: 'Half', price: 70 }, { label: 'Full', price: 120 }], { bestseller: true }),
      item(a, 3, 'Momos', 'Paneer Momos', 'veg', 80, [{ label: 'Half', price: 80 }, { label: 'Full', price: 140 }]),
      item(a, 4, 'Chowmein', 'Veg Chowmein', 'veg', 80),
      item(a, 5, 'Chowmein', 'Egg Chowmein', 'egg', 90),
      item(a, 6, 'Chowmein', 'Chicken Chowmein', 'nonveg', 110, [], { available: false }),
    ],
    files: [],
    photos: {},
  }
}

let db = null
function load() {
  if (db) return db
  try {
    db = JSON.parse(localStorage.getItem(KEY) || 'null')
  } catch {
    db = null
  }
  if (!db) {
    db = seed()
    try {
      localStorage.setItem(KEY, JSON.stringify(db)) // the same samples after a reload
    } catch {
      // private window: samples for this visit only
    }
  }
  return db
}
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(db))
  } catch {
    throw new Error('Demo storage is full on this phone. Delete some demo photos.')
  }
}
const clone = (x) => JSON.parse(JSON.stringify(x))

export const demoStore = {
  demo: true,

  async session() {
    return { email: 'demo', canUse: true }
  },
  async signIn() {
    return this.session()
  },
  async signOut() {},

  async listRestaurants() {
    await wait()
    const d = load()
    return clone(d.restaurants)
      .sort((x, y) => y.updated_at.localeCompare(x.updated_at))
      .map((r) => ({
        ...r,
        itemCount: d.items.filter((i) => i.restaurant_id === r.id).length,
        photoCount: d.items.filter((i) => i.restaurant_id === r.id && i.photo).length,
        offCount: d.items.filter((i) => i.restaurant_id === r.id && !i.available).length,
        fileKinds: [...new Set(d.files.filter((f) => f.restaurant_id === r.id).map((f) => f.kind))],
      }))
  },
  async getRestaurant(id) {
    await wait(60)
    const r = load().restaurants.find((x) => x.id === id)
    // Demo restaurants saved before cover_photos (update 075) start their list with the one cover.
    return r ? clone({ ...r, cover_photos: r.cover_photos ?? (r.cover_photo ? [r.cover_photo] : []) }) : null
  },
  async createRestaurant(patch = {}) {
    const d = load()
    const r = { ...EMPTY, ...patch, id: uid(), created_at: now(), updated_at: now() }
    d.restaurants.push(r)
    save()
    return clone(r)
  },
  async updateRestaurant(id, patch) {
    await wait(200)
    const d = load()
    const r = d.restaurants.find((x) => x.id === id)
    if (!r) throw new Error('This restaurant was deleted.')
    Object.assign(r, patch, { updated_at: now() })
    save()
    return clone(r)
  },
  async deleteRestaurant(id) {
    const d = load()
    for (const i of d.items.filter((x) => x.restaurant_id === id)) delete d.photos[i.photo]
    for (const f of d.files.filter((x) => x.restaurant_id === id)) delete d.photos[f.path]
    const r = d.restaurants.find((x) => x.id === id)
    for (const p of [r?.cover_photo, ...(r?.cover_photos ?? [])]) if (p) delete d.photos[p]
    d.restaurants = d.restaurants.filter((x) => x.id !== id)
    d.items = d.items.filter((x) => x.restaurant_id !== id)
    d.files = d.files.filter((x) => x.restaurant_id !== id)
    save()
  },

  async listItems(restaurantId) {
    await wait(60)
    return clone(load().items.filter((i) => i.restaurant_id === restaurantId))
      .sort((x, y) => x.sort - y.sort || x.created_at.localeCompare(y.created_at))
  },
  async saveItem(item) {
    await wait(150)
    const d = load()
    if (item.id) {
      const it = d.items.find((x) => x.id === item.id)
      if (!it) throw new Error('This item was deleted.')
      Object.assign(it, item, { updated_at: now() })
      save()
      return clone(it)
    }
    const it = { description: '', diet: '', variants: [], photo: '', available: true, bestseller: false, section: '', name: '',
      price: null, sort: 0, ...item, id: uid(), created_at: now(), updated_at: now() }
    d.items.push(it)
    save()
    return clone(it)
  },
  async addItems(restaurantId, items) {
    const out = []
    for (const it of items) out.push(await this.saveItem({ ...it, restaurant_id: restaurantId }))
    return out
  },
  async clearMenu(restaurantId) {
    const d = load()
    const gone = d.items.filter((x) => x.restaurant_id === restaurantId)
    for (const it of gone) if (it.photo) delete d.photos[it.photo]
    d.items = d.items.filter((x) => x.restaurant_id !== restaurantId)
    save()
    return gone.length
  },

  async deleteItem(item) {
    const d = load()
    if (item.photo) delete d.photos[item.photo]
    d.items = d.items.filter((x) => x.id !== item.id)
    save()
  },

  async listFiles(restaurantId) {
    await wait(60)
    const d = load()
    return clone(d.files.filter((f) => f.restaurant_id === restaurantId)).map((f) => ({ ...f, url: d.photos[f.path] || '' }))
  },
  async addFile(restaurantId, kind, file) {
    const d = load()
    const pdf = file.type === 'application/pdf'
    if (pdf) throw new Error('The demo keeps photos only. PDFs work on the real desk.')
    const path = `${restaurantId}/${kind}-${Date.now()}.jpg`
    d.photos[path] = await blobToDataUrl(await shrinkPhoto(file, 700, 70))
    const row = { id: uid(), created_at: now(), restaurant_id: restaurantId, kind, path, note: '' }
    d.files.push(row)
    save()
    return { ...row, url: d.photos[path], pdf: false }
  },
  async deleteFile(file) {
    const d = load()
    delete d.photos[file.path]
    d.files = d.files.filter((x) => x.id !== file.id)
    save()
  },

  async uploadPhoto(restaurantId, file, prefix) {
    const d = load()
    const path = `${restaurantId}/${prefix}-${Date.now()}.jpg`
    d.photos[path] = await blobToDataUrl(await shrinkPhoto(file, 700, 70))
    save()
    return path
  },
  async removePhoto(path) {
    const d = load()
    delete d.photos[path]
    save()
  },
  photoUrl(path) {
    return path ? load().photos[path] || '' : ''
  },

  async exportAll() {
    const d = load()
    return clone({ restaurants: d.restaurants, items: d.items, files: d.files })
  },
}
