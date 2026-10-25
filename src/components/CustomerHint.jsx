import { AlertTriangle, Ban, Sparkles } from 'lucide-react'

export default function CustomerHint({ hint }) {
  if (!hint) return null
  if (hint.blocked) return <p className="flex items-center gap-1.5 text-sm font-semibold text-red-600"><Ban size={15} /> Blocked number</p>
  if (hint.no_show_count > 0) {
    return (
      <p className="flex items-center gap-1.5 text-sm font-semibold text-orange-600">
        <AlertTriangle size={15} /> This number has {hint.no_show_count} earlier no-show{hint.no_show_count > 1 ? 's' : ''}
      </p>
    )
  }
  if (hint.completed === 0) return <p className="flex items-center gap-1.5 text-sm text-neutral-500"><Sparkles size={15} /> New customer, pehla order</p>
  return <p className="text-sm text-neutral-500">{hint.completed} earlier completed order{hint.completed > 1 ? 's' : ''}</p>
}
