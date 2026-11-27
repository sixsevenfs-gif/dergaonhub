// Money to give back on orders paid online (database update 072): an order paid by UPI that is then cancelled, or
// made cheaper after paying (an item taken off, the express charge not taken), owes the customer the difference.

export const REFUND_WAYS = [['upi', 'UPI'], ['cash', 'Cash'], ['wallet', 'Jholzo Money']]
export const REFUND_WAY_LABEL = Object.fromEntries(REFUND_WAYS)

/** Still to give back (same as order_refund_due() in the database). 0 before update 072 (no paid_amount). */
export function refundDue(o) {
  if (!o || o.payment_status !== 'paid') return 0
  const paid = Number(o.paid_amount) || 0
  if (paid <= 0) return 0
  const left = paid - (o.status === 'cancelled' ? 0 : Number(o.total) || 0) - (Number(o.refunded_amount) || 0)
  return Math.max(0, Math.round(left * 100) / 100)
}

/** Why money is owed, in a few words. */
export const refundWhy = (o) => (o.status === 'cancelled' ? `Cancelled${o.cancel_reason ? `: ${o.cancel_reason}` : ''}` : 'Made cheaper after paying')
