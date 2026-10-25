import { getShop, listShopProducts } from './store.js'
import { useData } from './useData.js'
import { useCart } from './cart-context.js'

// Joins the cart lines with the shop's current prices and stock.
export function useCartDetails() {
  const { cart } = useCart()
  const { data: shop } = useData(() => (cart.shopId ? getShop(cart.shopId) : null), [cart.shopId])
  const { data: products } = useData(() => (cart.shopId ? listShopProducts(cart.shopId, { publicOnly: true }) : []), [cart.shopId])
  const lines = Object.entries(cart.lines).map(([id, l]) => ({ ...l, id, product: products?.find((p) => p.id === id) }))
  const subtotal = lines.reduce((s, l) => s + (l.product?.price ?? 0) * l.qty, 0)
  const problems = lines.filter((l) => !l.product || !l.product.available)
  return { cart, shop, lines, subtotal, problems, ready: !cart.shopId || (shop !== undefined && products !== undefined) }
}
