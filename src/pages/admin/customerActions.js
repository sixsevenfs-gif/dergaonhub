import { adminWalletAdjust } from '../../lib/store.js'
import { rupee } from '../../lib/format.js'

// Add money (goodwill for a complaint) or take it back (minus amount), always with a reason. Customers list and
// a customer's page.
export async function adjustWallet(c) {
  const amount = window.prompt(`Jholzo Money for ${c.name || c.phone} (now ${rupee(c.wallet ?? 0)}).\nAmount to add, or minus to take back (e.g. 50 or -20):`)
  if (amount === null || !amount.trim()) return
  const note = window.prompt('Reason (the customer sees this):', 'Sorry for the trouble')
  if (note === null) return
  try {
    await adminWalletAdjust(c.id, Number(amount), note)
  } catch (err) {
    window.alert(err.message)
  }
}
