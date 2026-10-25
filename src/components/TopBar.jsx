import { Link } from 'react-router-dom'
import { ShoppingCart } from 'lucide-react'
import Wordmark from './Wordmark.jsx'
import { useCart } from '../lib/cart-context.js'

// Customer header: wordmark left, cart (or any other action) right.
export default function TopBar({ right }) {
  const { count } = useCart()
  return (
    <header className="flex h-12 items-center justify-between">
      <Wordmark />
      {right ?? (
        <Link to="/cart" aria-label="Cart" className="relative flex h-11 w-11 items-center justify-center">
          <ShoppingCart size={26} />
          {count > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-xs font-bold text-ink">
              {count}
            </span>
          )}
        </Link>
      )}
    </header>
  )
}
