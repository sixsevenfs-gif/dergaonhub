// Times for scheduled notifications (Admin → App → Notifications, update 078), in this computer's time (India).
const pad = (n) => String(n).padStart(2, '0')
/** <input type="datetime-local"> value for a moment, in this computer's time (India). */
export const localInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
export const whenText = (iso) => new Date(iso).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

// Ready times for a food or grocery day; each picks the next one (today if it is still ahead, else tomorrow).
export const QUICK_TIMES = [['Breakfast', 8, 0], ['Lunch', 12, 30], ['Evening', 17, 0], ['Dinner', 19, 30]]
export function nextAt(h, m, dayOffset = 0) {
  const d = new Date()
  d.setDate(d.getDate() + dayOffset)
  d.setHours(h, m, 0, 0)
  if (dayOffset === 0 && d <= new Date(Date.now() + 2 * 60_000)) d.setDate(d.getDate() + 1)
  return localInput(d)
}

