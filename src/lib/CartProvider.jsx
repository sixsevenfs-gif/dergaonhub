import { useEffect, useState } from 'react'
import { CartContext } from './cart-context.js'
import { saveMyCart } from './store.js'

const KEY = 'dergaonhub-cart'
const EMPTY = { lines: {}, note: '' }

function loadCart() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY))
    return saved?.lines ? saved : EMPTY
  } catch {
    return EMPTY
  }
}

// One cart for the store. lines = { productId: { qty, note } }
export default function CartProvider({ children }) {
  const [cart, setCart] = useState(loadCart)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(cart))
    } catch {
      // storage blocked: cart lasts until reload
    }
  }, [cart])

  // A logged-in customer's cart also goes to the database a few seconds after the last change (update 032),
  // so the order desk can send one reminder if it is left behind. Nothing is sent for visitors not logged in.
  useEffect(() => {
    const t = setTimeout(() => {
      saveMyCart(Object.entries(cart.lines).map(([id, l]) => ({ id, qty: l.qty }))).catch(() => {})
    }, 4000)
    return () => clearTimeout(t)
  }, [cart.lines])

  const setQty = (productId, qty) =>
    setCart((c) => {
      const lines = { ...c.lines }
      if (qty <= 0) delete lines[productId]
      else lines[productId] = { note: '', ...lines[productId], qty }
      return { ...c, lines }
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
