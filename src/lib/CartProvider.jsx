import { useEffect, useState } from 'react'
import { CartContext } from './cart-context.js'

const KEY = 'dergaon-cart'
const EMPTY = { shopId: null, lines: {}, note: '' }

function loadCart() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? EMPTY
  } catch {
    return EMPTY
  }
}

// One cart, for one shop at a time. lines = { shopProductId: { qty, note } }
export default function CartProvider({ children }) {
  const [cart, setCart] = useState(loadCart)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(cart))
    } catch {
      // storage blocked: cart lasts until reload
    }
  }, [cart])

  const setQty = (shopId, productId, qty) =>
    setCart((c) => {
      const base = c.shopId === shopId ? c : { ...EMPTY, shopId }
      const lines = { ...base.lines }
      if (qty <= 0) delete lines[productId]
      else lines[productId] = { note: '', ...lines[productId], qty }
      return Object.keys(lines).length ? { ...base, lines } : EMPTY
    })

  const setLineNote = (productId, note) =>
    setCart((c) => (c.lines[productId] ? { ...c, lines: { ...c.lines, [productId]: { ...c.lines[productId], note } } } : c))

  const value = {
    cart,
    count: Object.values(cart.lines).reduce((s, l) => s + l.qty, 0),
    qtyOf: (productId) => cart.lines[productId]?.qty ?? 0,
    setQty,
    setLineNote,
    setNote: (note) => setCart((c) => ({ ...c, note })),
    clear: () => setCart(EMPTY),
  }
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}
