// Pilot rules from the plan. Values marked [TBD] are assumptions: change them here.
export const CONFIG = {
  DELIVERY_CAP: 15, // max delivery orders per evening slot (plan: 10 to 15)
  FIRST_ORDER_LIMIT: 500, // [TBD] max order value for a phone number with no completed order
  NO_SHOW_LIMIT: 2, // after this many no-shows the number cannot order online
  AREAS: ['Dergaon Bazaar', 'Dergaon Town', 'Borpathar', 'Station Road'], // [TBD]
  SHOP_CATEGORIES: ['Grocery'], // Stage 1: only grocery takes orders
  DIRECTORY_CATEGORIES: ['Medical', 'Salon', 'Mobile repair', 'Electrician', 'Tuition', 'Bakery', 'Restaurant', 'Other'],
  CANCEL_REASONS: ['Out of stock', 'Customer unreachable', 'No-show', 'Customer cancelled', 'Other'],
}

// Demo mode: data is saved in this browser only (localStorage) until Supabase is connected.
export const DEMO_MODE = true
