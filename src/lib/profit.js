// Profit from buy prices (update 034), the owner's view: what the items earned (selling price − buy price),
// plus delivery, packaging and express fees, minus Jholzo Money used, the rider's pay (with petrol) and the bag.
// costs: { productId: buy price today }; an item's own cost (saved when it was ordered) wins over it.
// rules: Settings → Costs per order.
export const COST_DEFAULTS = { rider_pay_near: 15, rider_pay_far: 20, rider_far_km: 2, packing_cost: 2 }

export const riderPayFor = (order, rules) =>
  Number(order.distance_km) > Number(rules.rider_far_km) ? Number(rules.rider_pay_far) : Number(rules.rider_pay_near)

// Margin of one product at a buy price: { rupees, percent } of the selling price.
export function margin(price, cost) {
  const rupees = Number(price) - Number(cost)
  return { rupees, percent: Number(price) > 0 ? Math.round((rupees / Number(price)) * 100) : 0 }
}

export function orderProfit(order, items, costs = {}, rules = COST_DEFAULTS) {
  let itemsEarned = 0
  const missing = []
  for (const i of items) {
    const cost = i.cost ?? costs[i.product_id]
    if (cost == null) missing.push(i.name_snapshot)
    else itemsEarned += Number(i.line_total) - Number(cost) * i.quantity
  }
  const fees = Number(order.delivery_fee || 0) + Number(order.packaging_fee || 0) + Number(order.express_fee || 0)
  const discount = Number(order.wallet_used || 0)
  const rider = riderPayFor(order, rules)
  const packing = Number(rules.packing_cost || 0)
  return { itemsEarned, missing, fees, discount, rider, packing, profit: itemsEarned + fees - discount - rider - packing }
}

// A day's delivered orders added up. items: every item of those orders (with order_id).
export function dayProfit(orders, items, costs, rules) {
  const total = { orders: orders.length, itemsEarned: 0, fees: 0, discount: 0, rider: 0, packing: 0, profit: 0, missing: 0 }
  for (const o of orders) {
    const p = orderProfit(o, items.filter((i) => i.order_id === o.id), costs, rules)
    for (const k of ['itemsEarned', 'fees', 'discount', 'rider', 'packing', 'profit']) total[k] += p[k]
    total.missing += p.missing.length
  }
  return total
}
