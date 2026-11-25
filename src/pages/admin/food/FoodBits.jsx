import { FOOD_STATUS } from '../../../lib/foodAdmin.js'

// Small shared parts of the Food admin pages.

export function FoodStatus({ status }) {
  const [label, cls] = FOOD_STATUS[status] ?? [status, 'bg-neutral-100 text-neutral-600']
  return <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${cls}`}>{label}</span>
}

// Shown until the owner runs the database update the page needs.
export function NeedsUpdate({ n, what }) {
  return (
    <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">
      <p className="font-bold">Run database update {n} first</p>
      <p className="mt-1">
        This page shows {what}. Open Supabase → SQL Editor, paste <code className="rounded bg-white px-1">supabase/migrations/{n}_…sql</code> and press Run. Then reload this page.
      </p>
    </div>
  )
}
