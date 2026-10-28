import {
  Bean, Carrot, Coffee, Cookie, CookingPot, CupSoda, Droplet, Milk, Package, Soup, Sparkles, SprayCan, Wheat,
} from 'lucide-react'

const CATEGORY_ICONS = {
  atta: Wheat, rice: CookingPot, daal: Bean, oil: Droplet, masala: Soup, dairy: Milk,
  snacks: Cookie, beverages: Coffee, colddrinks: CupSoda, personal: Sparkles, cleaning: SprayCan,
  vegetables: Carrot,
}

// Products without a photo show their category icon (plan section 7).
export function CategoryIcon({ id, ...props }) {
  const Icon = CATEGORY_ICONS[id] ?? Package
  return <Icon {...props} />
}

export function WhatsAppIcon({ size = 20, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.39-1.48-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.62.71.23 1.36.2 1.87.12.57-.08 1.76-.72 2.01-1.42.25-.7.25-1.29.17-1.42-.07-.12-.27-.2-.57-.35M12.05 21.5h-.01a9.4 9.4 0 0 1-4.8-1.31l-.34-.2-3.56.93.95-3.47-.22-.36a9.4 9.4 0 0 1-1.44-5.01c0-5.2 4.23-9.43 9.43-9.43a9.4 9.4 0 0 1 9.42 9.44c0 5.2-4.23 9.42-9.43 9.42m8.02-17.45A11.27 11.27 0 0 0 12.05.72C5.8.72.7 5.8.7 12.07c0 2 .52 3.95 1.52 5.67L.6 23.6l6-1.57a11.3 11.3 0 0 0 5.43 1.38h.01c6.25 0 11.34-5.09 11.35-11.35 0-3.03-1.18-5.88-3.32-8.02" />
    </svg>
  )
}
