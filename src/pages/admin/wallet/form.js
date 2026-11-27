// The Jholzo Money form's choices, shared by "Give Jholzo Money" (one customer) and "Give to all customers".
const pad = (n) => String(n).padStart(2, '0')
// <input type="datetime-local"> value for a moment, in this phone's time.
export const localInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
// End of the day, n days from today.
export const daysFromNow = (n) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  d.setHours(23, 59, 0, 0)
  return localInput(d)
}
export const VALID_FOR = [[0, 'Today'], [3, '3 days'], [7, '7 days'], [15, '15 days'], [30, '30 days']]
export const MIN_PRESETS = [0, 199, 299, 499]
// Ready notes for the gift (the customer sees it in their wallet); "other" opens a box for any occasion.
export const NOTE_PRESETS = [['', 'No note'], ["Children's Day special 🎈", "Children's Day special 🎈"], ['other', 'Others']]
export const chip = (on) => `h-8 rounded-full border px-3 text-xs font-semibold ${on ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 bg-white text-neutral-700'}`
