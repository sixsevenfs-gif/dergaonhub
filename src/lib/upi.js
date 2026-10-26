// upi://pay link: opens GPay / PhonePe / Paytm with the amount and order number filled in.
export function upiLink(order, store) {
  const q = new URLSearchParams({
    pa: store.upi_id,
    pn: store.upi_name || store.name || 'Dergaon Hub',
    am: Number(order.total).toFixed(2),
    cu: 'INR',
    tn: `Dergaon Hub ${order.order_number}`,
  })
  return `upi://pay?${q.toString().replace(/\+/g, '%20')}`
}
