// Category colour and name, for the round category tiles and products without a photo.
export const CATEGORY_LOOK = {
  atta: ['#C8912E', 'Atta & Flour'],
  rice: ['#A48A4F', 'Rice & Poha'],
  daal: ['#D98A1F', 'Dal & Pulses'],
  oil: ['#C9A21C', 'Oil & Ghee'],
  masala: ['#C8582F', 'Masala & Salt'],
  dairy: ['#3F86C9', 'Dairy'],
  snacks: ['#E0722C', 'Snacks'],
  beverages: ['#8A5A3B', 'Tea & Coffee'],
  colddrinks: ['#D9443C', 'Cold Drinks'],
  personal: ['#8D62C4', 'Personal Care'],
  cleaning: ['#2A9D8F', 'Cleaning'],
  vegetables: ['#4F8A2E', 'Vegetables'],
}
export const categoryTint = (id) => CATEGORY_LOOK[id]?.[0] ?? '#1F6B3A'

// Product-collage pictures for the home category tiles (public/categories). Others use the icon.
export const CATEGORY_ART = Object.fromEntries(
  ['atta', 'rice', 'daal', 'oil', 'masala', 'dairy', 'snacks'].map((id) => [id, `/categories/${id}.webp`]),
)
