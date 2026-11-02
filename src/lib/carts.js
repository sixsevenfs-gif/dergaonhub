import { rupee } from './format.js'
import { deliveryRules } from './delivery.js'

// Carts left behind (update 032): each cart's items at today's prices. Items no longer sold drop out.
// carts: rows of the carts table; products: [{ id, name, size, price, photo_url, category_id }];
// team: [{ user_id, name }] for "reminded by".
export function cartRows(carts, products, team = []) {
  const byId = new Map(products.map((p) => [p.id, p]))
  return carts
    .map((c) => {
      const lines = (c.items ?? []).map((i) => ({ ...i, product: byId.get(i.id) ?? null })).filter((l) => l.product)
      return {
        ...c,
        lines,
        count: lines.reduce((n, l) => n + l.qty, 0),
        total: lines.reduce((n, l) => n + l.qty * Number(l.product.price), 0),
        reminded_by_name: c.reminded_at ? team.find((t) => t.user_id === c.reminded_by)?.name || 'Owner' : '',
      }
    })
    .filter((c) => c.lines.length)
}

// The WhatsApp reminder: friendly, short, what is waiting, and the free delivery line.
export function cartReminder(cart, store) {
  const names = cart.lines.map((l) => l.product.name)
  const list = names.length > 2 ? `${names.slice(0, 2).join(', ')} and ${names.length - 2} more` : names.join(' and ')
  const free = store ? deliveryRules(store).freeAbove : 0
  const first = (cart.name ?? '').trim().split(/\s+/)[0]
  return [
    `Hi${first ? ` ${first}` : ''} 👋 Your Jholzo cart is still waiting for you 🛒`,
    `${list} (${rupee(cart.total)})`,
    `Don't overthink it, your groceries are just one tap away! Order now and we'll bring them to your door.${free ? ` FREE delivery on orders of ${rupee(free)}+ 🚀` : ''}`,
    `👉 ${window.location.origin}/cart`,
  ].join('\n')
}
