import { addDays, dateStr } from './format.js'
import { deliveryQuote, packagingFee } from './delivery.js'

// Demo data for Jholzo Dergaon. Phone/WhatsApp numbers are fake placeholders.

export const CATEGORIES = [
  { id: 'atta', name: 'Atta & Flour', short: 'Atta & Flour' },
  { id: 'rice', name: 'Rice & Poha', short: 'Rice' },
  { id: 'daal', name: 'Daal', short: 'Daal' },
  { id: 'oil', name: 'Oil & Ghee', short: 'Oil & Ghee' },
  { id: 'masala', name: 'Salt, Sugar & Masala', short: 'Masala' },
  { id: 'dairy', name: 'Dairy & Eggs', short: 'Dairy' },
  { id: 'snacks', name: 'Snacks & Biscuits', short: 'Snacks' },
  { id: 'beverages', name: 'Tea & Beverages', short: 'Beverages' },
  { id: 'colddrinks', name: 'Cold Drinks & Water', short: 'Cold drinks' },
  { id: 'personal', name: 'Personal Care', short: 'Personal care' },
  { id: 'cleaning', name: 'Cleaning', short: 'Cleaning' },
  { id: 'vegetables', name: 'Fruits & Vegetables', short: 'Fruits & Veg' },
  { id: 'dryfruits', name: 'Dry Fruits & Seeds', short: 'Dry fruits' },
  { id: 'pooja', name: 'Pooja Needs', short: 'Pooja' },
]

// [name, size, category, keywords, demo price]
const LIB = [
  ['Aashirvaad Atta', '5 kg', 'atta', 'atta aata flour wheat gehu', 285],
  ['Aashirvaad Atta', '10 kg', 'atta', 'atta aata flour wheat gehu', 545],
  ['Fortune Chakki Fresh Atta', '5 kg', 'atta', 'atta aata flour wheat gehu', 265],
  ['Maida', '500 g', 'atta', 'maida refined flour', 30],
  ['Besan', '500 g', 'atta', 'besan gram flour chana', 60],
  ['Sooji (Rava)', '500 g', 'atta', 'suji sooji rava semolina', 32],
  ['India Gate Basmati Rice', '1 kg', 'rice', 'rice chawal basmati', 140],
  ['India Gate Basmati Rice', '5 kg', 'rice', 'rice chawal basmati', 650],
  ['Joha Rice', '1 kg', 'rice', 'joha rice chawal aromatic', 120],
  ['Boiled Rice (Usna)', '5 kg', 'rice', 'rice chawal usna sela boiled', 260],
  ['Poha (Chira)', '500 g', 'rice', 'poha chira chura flattened rice', 35],
  ['Toor Daal', '1 kg', 'daal', 'toor tur arhar dal daal', 160],
  ['Masoor Daal', '1 kg', 'daal', 'masoor mosur red lentil dal daal', 110],
  ['Moong Daal', '1 kg', 'daal', 'moong mung dal daal', 130],
  ['Chana Daal', '1 kg', 'daal', 'chana dal daal', 100],
  ['Rajma', '500 g', 'daal', 'rajma kidney beans', 85],
  ['Kabuli Chana', '500 g', 'daal', 'kabuli chana chole chickpea', 80],
  ['Fortune Soyabean Oil', '1 L', 'oil', 'oil tel soyabean refined', 150],
  ['Fortune Sunflower Oil', '1 L', 'oil', 'oil tel sunflower refined', 165],
  ['Engine Mustard Oil', '1 L', 'oil', 'mustard sarso sarson tel oil kachi ghani', 175],
  ['Dhara Mustard Oil', '1 L', 'oil', 'mustard sarso sarson tel oil kachi ghani', 180],
  ['Amul Ghee', '500 ml', 'oil', 'ghee ghi', 330],
  ['Patanjali Cow Ghee', '500 ml', 'oil', 'ghee ghi cow', 340],
  ['Tata Salt', '1 kg', 'masala', 'salt namak nimakh', 28],
  ['Sugar', '1 kg', 'masala', 'sugar chini cheeni', 48],
  ['Everest Turmeric Powder', '100 g', 'masala', 'haldi turmeric masala', 35],
  ['Everest Chilli Powder', '100 g', 'masala', 'mirchi chilli lal mirch masala', 45],
  ['Everest Garam Masala', '50 g', 'masala', 'garam masala', 40],
  ['Jeera', '100 g', 'masala', 'jeera cumin zeera', 45],
  ['Amul Taaza Milk', '500 ml', 'dairy', 'milk doodh dudh', 28],
  ['Purabi Milk', '500 ml', 'dairy', 'milk doodh dudh purabi', 27],
  ['Purabi Dahi', '400 g', 'dairy', 'dahi curd yogurt doi purabi', 45],
  ['Amul Butter', '100 g', 'dairy', 'butter makhan', 58],
  ['Amul Cheese Slices', '200 g', 'dairy', 'cheese slice', 145],
  ['Paneer', '200 g', 'dairy', 'paneer cottage cheese', 90],
  ['Eggs', '6 pcs', 'dairy', 'egg eggs anda koni', 48],
  ["Lay's Classic Salted", '52 g', 'snacks', 'lays chips', 20],
  ['Kurkure Masala Munch', '90 g', 'snacks', 'kurkure', 20],
  ['Maggi 2-Minute Noodles', '70 g', 'snacks', 'maggi noodles', 15],
  ['Maggi 2-Minute Noodles (4 pack)', '280 g', 'snacks', 'maggi noodles', 60],
  ["Haldiram's Aloo Bhujia", '200 g', 'snacks', 'bhujia namkeen haldiram', 55],
  ['Parle-G Biscuit', '250 g', 'snacks', 'parle biscuit', 25],
  ['Britannia Good Day Cashew', '100 g', 'snacks', 'good day biscuit cookies', 30],
  ['Britannia Bread', '400 g', 'snacks', 'bread pauroti double roti', 45],
  ['Tata Tea Gold', '250 g', 'beverages', 'tea chai cha patti', 150],
  ['Red Label Tea', '250 g', 'beverages', 'tea chai cha patti', 140],
  ['Assam CTC Tea (loose)', '250 g', 'beverages', 'tea chai cha patti ctc assam', 90],
  ['Nescafe Classic Coffee', '50 g', 'beverages', 'coffee nescafe', 175],
  ['Bournvita', '500 g', 'beverages', 'bournvita health drink', 245],
  ['Coca-Cola (Chilled)', '750 ml', 'colddrinks', 'coke coca cola cold drink thanda', 40],
  ['Coca-Cola (Normal)', '750 ml', 'colddrinks', 'coke coca cola cold drink', 40],
  ['Thums Up', '750 ml', 'colddrinks', 'thums up thumbs up cold drink', 40],
  ['Sprite', '750 ml', 'colddrinks', 'sprite cold drink', 40],
  ['Maaza', '600 ml', 'colddrinks', 'maaza mango drink', 40],
  ['Bisleri Water', '1 L', 'colddrinks', 'water pani bisleri', 20],
  ['Dove Shampoo', '340 ml', 'personal', 'shampoo dove hair', 299],
  ['Clinic Plus Shampoo', '175 ml', 'personal', 'shampoo clinic plus hair', 110],
  ['Colgate Strong Teeth', '200 g', 'personal', 'toothpaste colgate manjan', 105],
  ['Lifebuoy Soap (4 x 100 g)', '400 g', 'personal', 'soap sabun lifebuoy', 140],
  ['Dettol Soap', '75 g', 'personal', 'soap sabun dettol', 45],
  ['Parachute Coconut Oil', '200 ml', 'personal', 'coconut oil nariyal tel parachute hair', 105],
  ['Surf Excel Easy Wash', '1 kg', 'cleaning', 'surf detergent washing powder', 140],
  ['Rin Bar', '250 g', 'cleaning', 'rin soap detergent bar', 30],
  ['Vim Bar', '300 g', 'cleaning', 'vim bartan dish wash', 30],
  ['Harpic Toilet Cleaner', '500 ml', 'cleaning', 'harpic toilet cleaner', 95],
  ['Lizol Floor Cleaner', '500 ml', 'cleaning', 'lizol floor cleaner pocha phenyl', 110],
  ['Good Knight Refill', '45 ml', 'cleaning', 'good knight mosquito machhar refill', 85],
]

export function makeSeed() {
  const now = new Date().toISOString()
  const today = dateStr()

  // Founder's own photos (public/photos). Products without one get a demo drawing
  // from scripts/make-demo-photos.mjs until a real photo is added in Admin → Products.
  const PHOTOS = {
    'Aashirvaad Atta 5 kg': 'aashirvaad-atta-5kg.jpg',
    'India Gate Basmati Rice 1 kg': 'india-gate-basmati-rice.jpg',
    'India Gate Basmati Rice 5 kg': 'india-gate-basmati-rice.jpg',
    'Toor Daal 1 kg': 'toor-dal-1kg.jpg',
    'Fortune Sunflower Oil 1 L': 'sunflower-oil-1l.jpg',
  }
  const POPULAR = ['Aashirvaad Atta 5 kg', 'India Gate Basmati Rice 5 kg', 'Toor Daal 1 kg', 'Fortune Sunflower Oil 1 L', 'Sugar 1 kg', 'Tata Tea Gold 250 g']
  const products = LIB.map(([name, size, category_id, keywords, price], i) => {
    const key = `${name} ${size}`
    return {
      id: `p${i + 1}`, name, size, category_id, keywords, price,
      photo_url: PHOTOS[key] ? `/photos/${PHOTOS[key]}` : `/demo/products/p${i + 1}.svg`,
      featured: POPULAR.includes(key),
      available: name !== 'Dove Shampoo', status: 'active', updated_at: now,
    }
  })
  const pid = (name, size) => products.find((p) => p.name === name && p.size === size)

  const store = {
    name: 'Jholzo Dergaon', phone: '9181061864', whatsapp: '919181061864',
    open_time: '08:00', close_time: '21:00', cutoff_time: '18:00', slot_start: '17:00', slot_end: '20:00',
    min_order: 0, delivery_area: ['Dergaon Bazaar', 'Dergaon Town'], paused: false,
    // Evening delivery: ₹40 below ₹99, ₹11 up to ₹298, FREE from ₹299 (see eveningFee).
    small_order_below: 99, small_order_fee: 40, mid_order_fee: 11, free_delivery_above: 299,
    // Express: within express_minutes for express_fee extra (switch on in Admin → Settings when a rider is free).
    express_on: false, express_fee: 40, express_minutes: 60,
    // Pay now by UPI: the store's UPI ID (set in Admin → Settings). Above cod_limit, UPI first.
    upi_id: '', upi_name: 'Jholzo', cod_limit: 350,
    upi_pay_minutes: 15, // a "Pay now by UPI" order not paid in this time is cancelled
    // Founder's home in Shantipur, Dergaon: delivery distance is measured from here.
    // Approximate until the exact pin is set in Admin → Settings.
    location: { lat: 26.7, lng: 93.97 },
    // Zone 1 (road ~4 km): Dergaon town, bazaar, Dergaon Circle, Radiant College area, Rangamati.
    per_km_fee: 10, min_delivery_fee: 20, max_delivery_km: 4,
    // Packaging: ₹5 below ₹500, ₹9 from ₹500, ₹12 from ₹1000 (items total).
    pack_fee_low: 3.8, pack_fee_mid: 7.8, pack_fee_high: 13.6, pack_mid_from: 500, pack_high_from: 1000,
  }

  const customers = [
    { id: 'c1', phone: '9000000101', name: 'Ritu Das', no_show_count: 0, blocked: false, created_at: now },
    { id: 'c2', phone: '9000000102', name: 'Bikash Gogoi', no_show_count: 1, blocked: false, created_at: now },
  ]

  const orders = []
  const order_items = []
  let n = 1001
  const addOrder = (o, lines) => {
    const id = `o${n}`
    const items = lines.map(([name, size, qty], i) => {
      const p = pid(name, size)
      return { id: `${id}-${i}`, order_id: id, product_id: p.id, name_snapshot: `${name} ${size}`, price_snapshot: p.price, quantity: qty, note: '', line_total: p.price * qty }
    })
    const subtotal = items.reduce((s, i) => s + i.line_total, 0)
    const quote = deliveryQuote(store, o.location, subtotal)
    orders.push({
      id, order_number: `DG-${n++}`, type: 'delivery', note: '', cancel_reason: '', allow_substitute: true,
      cash_collected: 0, confirmed_at: null, completed_at: null,
      ...o, distance_km: quote.km, subtotal, delivery_fee: quote.fee, packaging_fee: packagingFee(store, subtotal),
      total: subtotal + quote.fee + packagingFee(store, subtotal),
    })
    order_items.push(...items)
  }
  const ritu = { customer_id: 'c1', customer_name: 'Ritu Das', customer_phone: '9000000101', address: 'House 12, near Namghar', area: 'Dergaon Bazaar', location: { lat: 26.7052, lng: 93.9761 } }
  addOrder({ ...ritu, payment_method: 'cash', delivery_date: addDays(today, -1), status: 'completed', created_at: now, confirmed_at: now, completed_at: now },
    [['Aashirvaad Atta', '5 kg', 1], ['Tata Tea Gold', '250 g', 1]])
  addOrder({ ...ritu, payment_method: 'cash', delivery_date: today, status: 'confirmed', created_at: now, confirmed_at: now },
    [['Toor Daal', '1 kg', 1], ['Engine Mustard Oil', '1 L', 1], ['Amul Taaza Milk', '500 ml', 2]])
  addOrder({ customer_id: 'c2', customer_name: 'Bikash Gogoi', customer_phone: '9000000102', address: 'Behind Dergaon Post Office', area: 'Dergaon Town', location: { lat: 26.6921, lng: 93.9598 }, payment_method: 'upi', delivery_date: today, status: 'placed', created_at: now },
    [['India Gate Basmati Rice', '1 kg', 2], ['Sugar', '1 kg', 1], ['Parle-G Biscuit', '250 g', 2]])
  orders[0].cash_collected = orders[0].total

  const complaints = [
    { id: 'k1', order_id: 'o1001', order_number: 'DG-1001', customer_phone: '9000000101', customer_name: 'Ritu Das', type: 'Missing item', message: 'The tea pack was missing.', status: 'open', admin_note: '', created_at: now, resolved_at: null },
  ]

  return {
    store, categories: CATEGORIES.map((c) => ({ ...c, parent_id: null })), products,
    customers, orders, order_items, complaints, waitlist: [], daily_expenses: [], next_order_number: n,
  }
}
