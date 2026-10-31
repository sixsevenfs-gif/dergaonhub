// upi://pay link: opens GPay / PhonePe / Paytm with the amount and order number filled in.
function upiQuery(order, store) {
  const q = new URLSearchParams({
    pa: store.upi_id,
    pn: store.upi_name || store.name || 'Jholzo',
    am: Number(order.total).toFixed(2),
    cu: 'INR',
    tn: `Jholzo ${order.order_number}`,
  })
  return q.toString().replace(/\+/g, '%20')
}

export const upiLink = (order, store) => `upi://pay?${upiQuery(order, store)}`

const isIOS = () => typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent)

// One button per app, so the customer picks the app instead of the phone choosing one.
// Same payment details as upiLink; only the app it opens differs.
export function upiApps(order, store) {
  const q = upiQuery(order, store)
  return [
    { id: 'phonepe', name: 'PhonePe', icon: '/upi/phonepe.png', href: `phonepe://pay?${q}` },
    { id: 'gpay', name: 'Google Pay', icon: '/upi/gpay.png', href: isIOS() ? `gpay://upi/pay?${q}` : `tez://upi/pay?${q}` },
    { id: 'paytm', name: 'Paytm', icon: '/upi/paytm.png', href: `paytmmp://pay?${q}` },
    { id: 'other', name: 'Other UPI app', href: `upi://pay?${q}` },
  ]
}
