// Pilot rules from the plan. Values marked [TBD] are assumptions: change them here.
// Store details (name, phone, timings, delivery fee, areas) are edited in Admin → Settings.
export const CONFIG = {
  DELIVERY_CAP: 50, // default orders per evening; the real value is set in Admin → Settings (private)
  NO_SHOW_LIMIT: 2, // after this many no-shows the number cannot pay cash on delivery
  AREAS: ['Dergaon Bazaar', 'Dergaon Town', 'Borpathar', 'Station Road'], // [TBD]
  CANCEL_REASONS: ['Item not available', 'Customer unreachable', 'No-show', 'Customer cancelled', 'Other'],
  ROAD_FACTOR: 1.3, // road distance ≈ straight-line distance × this
  COMPLAINT_TYPES: ['Wrong item', 'Missing item', 'Damaged / expired', 'Late delivery', 'Payment issue', 'Other'],
}

// Demo mode: no Supabase keys in .env, so data is saved in this browser only (localStorage).
export const DEMO_MODE = !(import.meta.env?.VITE_SUPABASE_URL && import.meta.env?.VITE_SUPABASE_ANON_KEY)

// Launch offer: the first customers get a chance to win cash. ON: false hides the home banner and the
// /lucky-draw page once the campaign is over.
export const LUCKY_DRAW = {
  ON: false, // off for now: check the lottery / consumer law question before running it
  FIRST: 100, // first this many customers are in the draw
  WINNERS: 5,
  PRIZE: 1000, // ₹ cash for each winner
}

// Business details shown on the policy pages (/policy/...). Fill the [TBD] ones before launch.
// Phone and WhatsApp come from Admin → Settings.
export const LEGAL = {
  BRAND: 'Jholzo',
  COMPANY: 'Malchetra Group', // [TBD] exact registered name (proprietorship / LLP / Pvt Ltd)
  GROUP_LINE: 'Powered by Malchetra Group', // shown in the footer
  ADDRESS: 'Dergaon, Golaghat, Assam 785614',
  EMAIL: 'support@jholzo.com',
  // Grievance officer's name, needed for online stores in India (E-Commerce Rules 2020). Empty: the policy
  // shows "Customer Support" instead; put a founder's name here when you have decided.
  GRIEVANCE_OFFICER: '',
  FSSAI: '20326120001321', // Basic Registration (Retailer), issued 28 Oct 2026, valid to Oct 2027
  INSTAGRAM: 'https://www.instagram.com/jholzo/', // shown in the footer
  COMPLAINT_HOURS: 24, // report damaged / wrong / missing items within this many hours
  LAST_UPDATED: '29 October 2026',
}
