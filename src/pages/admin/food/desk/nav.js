// Moving between the restaurant pages inside Admin → Food (the Food Desk used the # part of the address).
// AdminFoodDesk sets the router's navigate here; paths are the Food Desk's: '/' (the list), 'r/<id>', 'r/<id>/menu'.
export const BASE = '/admin/food/restaurants'
let navigate = null
export const setNavigate = (fn) => {
  navigate = fn
}
export const pathFor = (path) => {
  const p = path.replace(/^#?\//, '').replace(/^r\//, '')
  return p ? `${BASE}/${p}` : BASE
}
export const go = (path) => navigate?.(pathFor(path))
// Restaurants added on this visit: their page opens on the name, and is removed again if left empty.
export const fresh = new Set()
