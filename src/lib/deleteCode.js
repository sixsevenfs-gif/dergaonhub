// The code that opens Admin → Delete orders (update 030). The database checks it; here it is only kept
// in this tab's memory, so a reload or "Lock" asks for it again. It is never saved in the browser.
import { adminCheckDeleteCode } from './store.js'

let code = ''

export const deleteCode = () => code

export async function unlockDelete(value) {
  const ok = await adminCheckDeleteCode(value)
  if (ok) code = String(value)
  return ok
}

export function lockDelete() {
  code = ''
}

// The database answers "function not found" until the update is run.
export const friendlyDeleteError = (msg) =>
  /admin_delete_orders|admin_check_delete_code|schema cache|does not exist/i.test(msg ?? '')
    ? 'Run supabase/migrations/029_admin_delete_orders.sql and 030_delete_code.sql in Supabase first.'
    : msg
