import { useParams } from 'react-router-dom'
import DeskShell from './desk/DeskShell.jsx'
import Restaurant from './desk/Restaurant.jsx'

// Admin → Food → Restaurants → one restaurant: everything the Food Desk has (details, timings, deal and markup,
// location, cover photos, menu with dish photos, papers). Changes save by themselves.
export default function FoodRestaurant() {
  const { id, tab = 'details' } = useParams()
  return (
    <DeskShell>
      <Restaurant key={id} id={id} tab={['menu', 'papers'].includes(tab) ? tab : 'details'} />
    </DeskShell>
  )
}
