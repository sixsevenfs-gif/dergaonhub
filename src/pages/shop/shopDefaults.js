import { CONFIG } from '../../config.js'

// Form values for a new shop, or an existing shop's values ready for editing.
export const shopDefaults = (shop) => ({
  name: '', category: CONFIG.SHOP_CATEGORIES[0], area: CONFIG.AREAS[0], address: '', phone: '', whatsapp: '',
  open_time: '08:00', close_time: '21:00', delivery_available: true, pickup_available: true,
  min_order: 300, delivery_fee: 30, cutoff_time: '14:00', slot_start: '17:00', slot_end: '20:00',
  delivery_area: [CONFIG.AREAS[0]],
  ...shop,
  ...(shop?.whatsapp ? { whatsapp: shop.whatsapp.slice(-10) } : {}),
})
