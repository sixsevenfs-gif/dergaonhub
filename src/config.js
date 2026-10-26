// Pilot rules from the plan. Values marked [TBD] are assumptions: change them here.
// Store details (name, phone, timings, delivery fee, areas) are edited in Admin → Settings.
export const CONFIG = {
  DELIVERY_CAP: 15, // max delivery orders per evening slot (plan: 10 to 15)
  FIRST_ORDER_LIMIT: 500, // [TBD] max order value for a phone number with no delivered order
  NO_SHOW_LIMIT: 2, // after this many no-shows the number cannot pay cash on delivery
  AREAS: ['Dergaon Bazaar', 'Dergaon Town', 'Borpathar', 'Station Road'], // [TBD]
  CANCEL_REASONS: ['Item not available', 'Customer unreachable', 'No-show', 'Customer cancelled', 'Other'],
  ROAD_FACTOR: 1.3, // road distance ≈ straight-line distance × this
  COMPLAINT_TYPES: ['Wrong item', 'Missing item', 'Damaged / expired', 'Late delivery', 'Payment issue', 'Other'],
}

// Demo mode: no Supabase keys in .env, so data is saved in this browser only (localStorage).
export const DEMO_MODE = !(import.meta.env?.VITE_SUPABASE_URL && import.meta.env?.VITE_SUPABASE_ANON_KEY)

// Business details shown on the policy pages (/policy/...). Fill the [TBD] ones before launch.
// Phone and WhatsApp come from Admin → Settings.
export const LEGAL = {
  BRAND: 'Dergaon Hub',
  COMPANY: 'Malchetra Groups', // [TBD] exact registered name (proprietorship / LLP / Pvt Ltd)
  ADDRESS: '[TBD] Full address, Dergaon, Golaghat, Assam 785614', // [TBD] check PIN code
  EMAIL: '[TBD] support email',
  GRIEVANCE_OFFICER: '[TBD] Name', // required for online stores in India
  FSSAI: '[TBD] FSSAI registration number',
  COMPLAINT_HOURS: 24, // report damaged / wrong / missing items within this many hours
  LAST_UPDATED: '25 October 2026',
}
