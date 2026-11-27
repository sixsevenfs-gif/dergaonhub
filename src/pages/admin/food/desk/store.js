// The real database with keys in .env, otherwise the demo that stays in this browser (like the rest of the site).
import { supabaseStore, hasDatabase } from './storeSupabase.js'
import { demoStore } from './storeDemo.js'

export const store = hasDatabase ? supabaseStore : demoStore
