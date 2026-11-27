// Deleting test food orders (database update 075), like grocery's Delete orders: the owner only, with the same
// delete code. In demo mode (no keys) the orders are only hidden on the delete page, in this tab.
import { supabase as sb } from './supabase.js'

const goneInDemo = new Set()
export const deletedInDemo = (id) => goneInDemo.has(id)

/** Deletes food orders for good. Returns { orders } (how many went). */
export async function adminDeleteFoodOrders(ids, code) {
  if (!sb) {
    if (!code) throw new Error('Enter the delete code.')
    ids.forEach((id) => goneInDemo.add(id))
    return { orders: ids.length }
  }
  const { data, error } = await sb.rpc('admin_delete_food_orders', { p_ids: ids, p_code: code })
  if (error) {
    if (/admin_delete_food_orders|schema cache|Could not find/i.test(error.message)) throw new Error('Run database update 075 first (Supabase → SQL Editor).')
    throw new Error(error.message)
  }
  return data
}
