import { createClient } from '@supabase/supabase-js'

// Keys come from the .env file (never pushed to GitHub). See .env.example.
const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// null until the Supabase project is connected (build step 1).
export const supabase = url && anonKey ? createClient(url, anonKey) : null

// The same public values, for the few calls made without the client (lib/partnerApp.js).
export const SUPABASE_URL = url
export const SUPABASE_ANON_KEY = anonKey
