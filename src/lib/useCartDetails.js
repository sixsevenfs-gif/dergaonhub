import { getStore, listProducts } from './store.js'
import { useData } from './useData.js'
import { useCart } from './cart-context.js'

// Joins the cart lines with current prices and stock.
export function useCartDetails() {
  const { cart } = useCart()
  const { data: store } = useData(getStore)
  const { data: products } = useData(listProducts)
  const lines = Object.entries(cart.lines).map(([id, l]) => ({ ...l, id, product: products?.find((p) => p.id === id) }))
  const subtotal = lines.reduce((s, l) => s + (l.product?.price ?? 0) * l.qty, 0)
  const problems = lines.filter((l) => !l.product || !l.product.available)
  return { cart, store, lines, subtotal, problems, ready: store !== undefined && products !== undefined }
}
