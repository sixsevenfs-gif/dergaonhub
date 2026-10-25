const STYLES = {
  placed: ['New', 'bg-accent text-ink'],
  confirmed: ['Confirmed', 'bg-blue-100 text-blue-800'],
  completed: ['Delivered', 'bg-green-100 text-green-800'],
  cancelled: ['Cancelled', 'bg-neutral-200 text-neutral-600'],
  open: ['Open', 'bg-orange-100 text-orange-800'],
  resolved: ['Resolved', 'bg-green-100 text-green-800'],
}

export default function StatusBadge({ status }) {
  const [label, style] = STYLES[status] ?? [status, 'bg-neutral-200 text-neutral-700']
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${style}`}>{label}</span>
}
