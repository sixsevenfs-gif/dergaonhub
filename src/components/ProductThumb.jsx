import { CategoryIcon } from './icons.jsx'
import FastImg from './FastImg.jsx'

// Product photo if there is one, otherwise the clean category icon (plan section 7).
export default function ProductThumb({ product, size = 'h-16 w-16', iconSize = 28, className = '' }) {
  return (
    <div className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl ${size} ${className}`}>
      {product?.photo_url ? (
        <FastImg src={product.photo_url} width={160} alt="" loading="lazy" className="h-full w-full object-contain" />
      ) : (
        <CategoryIcon id={product?.category_id} size={iconSize} strokeWidth={1.5} />
      )}
    </div>
  )
}
