// Makes simple demo pictures for every library product and demo shop.
// They are drawings, not real packages: replace them with your own photos before launch.
// Run again after changing the library:  node scripts/make-demo-photos.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { makeSeed } from '../src/lib/seed.js'

const STYLE = {
  atta: ['#E9B949', 'bag'], rice: ['#7FB685', 'bag'], daal: ['#F08A24', 'bag'], oil: ['#E5B700', 'bottle'],
  masala: ['#C8423B', 'pouch'], dairy: ['#3B8FD9', 'carton'], snacks: ['#E4572E', 'pouch'],
  beverages: ['#8D5524', 'box'], colddrinks: ['#C0392B', 'bottle'], personal: ['#8E5BB5', 'bottle'], cleaning: ['#2A8FBD', 'box'],
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&#39;')

// Breaks the name into short lines that fit on the pack.
function wrap(text, max = 11) {
  const lines = []
  let line = ''
  for (const word of text.split(' ')) {
    if ((line + ' ' + word).trim().length > max && line) {
      lines.push(line)
      line = word
    } else line = (line + ' ' + word).trim()
  }
  if (line) lines.push(line)
  return lines.slice(0, 3)
}

const SHAPES = {
  bag: (c) => `<path d="M110 95 L290 95 L300 330 Q300 345 285 345 L115 345 Q100 345 100 330 Z" fill="${c}"/><path d="M110 95 L290 95 L290 80 Q250 70 200 80 Q150 70 110 80 Z" fill="${c}" opacity=".75"/>`,
  bottle: (c) => `<rect x="172" y="50" width="56" height="34" rx="6" fill="#333"/><path d="M178 84 L222 84 L222 110 Q285 130 285 185 L285 330 Q285 350 265 350 L135 350 Q115 350 115 330 L115 185 Q115 130 178 110 Z" fill="${c}"/>`,
  box: (c) => `<rect x="105" y="85" width="190" height="260" rx="10" fill="${c}"/><rect x="105" y="85" width="190" height="34" rx="10" fill="#000" opacity=".15"/>`,
  carton: (c) => `<path d="M130 110 L200 70 L270 110 L270 345 L130 345 Z" fill="${c}"/><path d="M130 110 L200 70 L270 110 Z" fill="#fff" opacity=".35"/>`,
  pouch: (c) => `<path d="M115 80 L285 80 L295 120 L285 345 L115 345 L105 120 Z" fill="${c}"/><path d="M115 80 L285 80 L289 96 L111 96 Z" fill="#000" opacity=".18"/>`,
}

function productSvg({ name, size, category_id }) {
  const [color, shape] = STYLE[category_id] ?? ['#888888', 'box']
  const lines = wrap(name)
  const top = 200 - (lines.length - 1) * 19
  const label = lines.map((l, i) => `<text x="200" y="${top + i * 38}" text-anchor="middle" font-size="33" font-weight="800">${esc(l)}</text>`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" font-family="Arial, Helvetica, sans-serif">
<rect width="400" height="400" fill="#F4F3EF"/>
<ellipse cx="200" cy="355" rx="110" ry="12" fill="#000" opacity=".08"/>
${SHAPES[shape](color)}
<rect x="92" y="${top - 42}" width="216" height="${lines.length * 38 + 66}" rx="14" fill="#fff" opacity=".94"/>
<g fill="#1C1C1A">${label}</g>
<text x="200" y="${top + lines.length * 38 + 6}" text-anchor="middle" font-size="26" font-weight="700" fill="#555">${esc(size)}</text>
<text x="388" y="388" text-anchor="end" font-size="13" fill="#999">DEMO</text>
</svg>
`
}

function logoSvg(name, color) {
  const initials = name.split(' ').filter((w) => /^[A-Za-z]/.test(w)).slice(0, 2).map((w) => w[0].toUpperCase()).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" font-family="Arial, Helvetica, sans-serif">
<rect width="200" height="200" rx="40" fill="${color}"/>
<text x="100" y="128" text-anchor="middle" font-size="84" font-weight="900" fill="#fff">${esc(initials)}</text>
</svg>
`
}

const seed = makeSeed()
mkdirSync('public/demo/products', { recursive: true })
mkdirSync('public/demo/shops', { recursive: true })
for (const item of seed.library) writeFileSync(`public/demo/products/${item.id}.svg`, productSvg(item))
const LOGO_COLORS = ['#1F7A4A', '#B4462F', '#3559A8', '#7A3FA0']
seed.shops.forEach((s, i) => writeFileSync(`public/demo/shops/${s.id}.svg`, logoSvg(s.name, LOGO_COLORS[i % LOGO_COLORS.length])))
console.log(`${seed.library.length} product pictures, ${seed.shops.length} shop logos`)
