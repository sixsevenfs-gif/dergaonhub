import { addDays, dateStr } from './format.js'

// Demo data. The WhatsApp/phone numbers are fake placeholders.

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

  const library = LIB.map(([name, size, category_id, keywords], i) => ({
    id: `lp${i + 1}`, name, size, category_id, keywords, photo_url: `/demo/products/lp${i + 1}.svg`, status: 'active',
  }))
  const lp = (name, size) => library.find((l) => l.name === name && (!size || l.size === size)).id

  const users = [
    { id: 'u1', email: 'sharma@demo.in', role: 'shop_owner', created_at: now },
    { id: 'u2', email: 'nath@demo.in', role: 'shop_owner', created_at: now },
    { id: 'u3', email: 'laxmi@demo.in', role: 'shop_owner', created_at: now },
  ]

  const rules = {
    delivery_available: true, pickup_available: true, min_order: 300, delivery_fee: 30,
    cutoff_time: '14:00', slot_start: '17:00', slot_end: '20:00',
    open_time: '08:00', close_time: '21:00', paused: false, reject_reason: '', logo_url: '', created_at: now,
  }
  const shops = [
    { ...rules, id: 'sharma', owner_user_id: 'u1', name: 'Sharma Grocery Store', category: 'Grocery', area: 'Dergaon Bazaar', address: 'Main Road, Dergaon Bazaar', phone: '9000000001', whatsapp: '919000000001', delivery_area: ['Dergaon Bazaar', 'Dergaon Town'], status: 'live' },
    { ...rules, id: 'nath', owner_user_id: 'u2', name: 'Nath General Store', category: 'Grocery', area: 'Borpathar', address: 'Near Borpathar Chariali', phone: '9000000002', whatsapp: '919000000002', delivery_available: false, delivery_area: [], status: 'live' },
    { ...rules, id: 'laxmi', owner_user_id: 'u3', name: 'Maa Laxmi Kirana', category: 'Grocery', area: 'Dergaon Town', address: 'College Road, Dergaon Town', phone: '9000000003', whatsapp: '919000000003', delivery_area: ['Dergaon Town'], status: 'pending' },
  ]

  // Demo drawings from scripts/make-demo-photos.mjs; real photos replace them before launch.
  for (const s of shops) s.logo_url = `/demo/shops/${s.id}.svg`

  const sp = (shop_id, l, price, extra = {}) => ({
    id: `${shop_id}-${l.id}`, shop_id, library_product_id: l.id, custom_name: '', custom_size: '', category_id: l.category_id,
    price, available: true, review_status: 'approved', photo_url: '', updated_at: now, ...extra,
  })
  const shop_products = [
    ...library.map((l, i) => sp('sharma', l, LIB[i][4], l.name === 'Dove Shampoo' ? { available: false } : {})),
    ...library.filter((_, i) => i % 2 === 0).map((l) => sp('nath', l, LIB[library.indexOf(l)][4] + 5)),
    ...library.slice(0, 12).map((l, i) => sp('laxmi', l, LIB[i][4])),
    { id: 'laxmi-c1', shop_id: 'laxmi', library_product_id: null, custom_name: 'Pitha Guri (Rice Flour)', custom_size: '500 g', category_id: 'atta', price: 50, available: true, review_status: 'pending', photo_url: '', updated_at: now },
  ]

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
      const prod = shop_products.find((p) => p.shop_id === o.shop_id && p.library_product_id === lp(name, size))
      return { id: `${id}-${i}`, order_id: id, shop_product_id: prod.id, name_snapshot: `${name} ${size}`, price_snapshot: prod.price, quantity: qty, note: '', line_total: prod.price * qty }
    })
    const subtotal = items.reduce((s, i) => s + i.line_total, 0)
    const delivery_fee = o.type === 'delivery' ? 30 : 0
    orders.push({ id, order_number: `DG-${n++}`, note: '', cancel_reason: '', cash_collected: 0, confirmed_at: null, completed_at: null, ...o, subtotal, delivery_fee, total: subtotal + delivery_fee })
    order_items.push(...items)
  }
  addOrder({ shop_id: 'sharma', customer_id: 'c1', customer_name: 'Ritu Das', customer_phone: '9000000101', type: 'delivery', address: 'House 12, near Namghar', area: 'Dergaon Bazaar', payment_method: 'cash', delivery_date: addDays(today, -1), status: 'completed', created_at: now, confirmed_at: now, completed_at: now, cash_collected: 0 },
    [['Aashirvaad Atta', '5 kg', 1], ['Tata Tea Gold', '250 g', 1]])
  addOrder({ shop_id: 'sharma', customer_id: 'c1', customer_name: 'Ritu Das', customer_phone: '9000000101', type: 'delivery', address: 'House 12, near Namghar', area: 'Dergaon Bazaar', payment_method: 'cash', delivery_date: today, status: 'confirmed', created_at: now, confirmed_at: now },
    [['Toor Daal', '1 kg', 1], ['Engine Mustard Oil', '1 L', 1], ['Amul Taaza Milk', '500 ml', 2]])
  addOrder({ shop_id: 'sharma', customer_id: 'c2', customer_name: 'Bikash Gogoi', customer_phone: '9000000102', type: 'delivery', address: 'Behind Dergaon Post Office', area: 'Dergaon Town', payment_method: 'upi', delivery_date: today, status: 'placed', created_at: now },
    [['India Gate Basmati Rice', '1 kg', 2], ['Sugar', '1 kg', 1], ['Parle-G Biscuit', '250 g', 2]])
  // The completed order was paid in cash to the founder on delivery.
  orders[0].cash_collected = orders[0].total

  const directory = [
    { id: 'd1', name: 'Das Medical Store', category: 'Medical', area: 'Dergaon Bazaar', phone: '9000000201', whatsapp: '919000000201', hours: '8 AM – 9 PM', photo_url: '', status: 'live' },
    { id: 'd2', name: 'Style Zone Salon', category: 'Salon', area: 'Dergaon Town', phone: '9000000202', whatsapp: '919000000202', hours: '9 AM – 8 PM', photo_url: '', status: 'live' },
    { id: 'd3', name: 'Mobile Care Repair', category: 'Mobile repair', area: 'Station Road', phone: '9000000203', whatsapp: '919000000203', hours: '10 AM – 8 PM', photo_url: '', status: 'live' },
    { id: 'd4', name: 'Bora Electricals', category: 'Electrician', area: 'Borpathar', phone: '9000000204', whatsapp: '', hours: 'On call', photo_url: '', status: 'live' },
    { id: 'd5', name: 'Bright Future Tuition', category: 'Tuition', area: 'Dergaon Town', phone: '9000000205', whatsapp: '919000000205', hours: '6 AM – 9 AM, 4 PM – 7 PM', photo_url: '', status: 'pending' },
  ]

  return {
    users, shops, categories: CATEGORIES.map((c) => ({ ...c, parent_id: null })), library, shop_products,
    customers, orders, order_items, directory, settlements: [], next_order_number: n,
  }
}
