const STYLES = {
  placed: ['New', 'bg-accent text-ink'],
  confirmed: ['Confirmed', 'bg-blue-100 text-blue-800'],
  completed: ['Completed', 'bg-green-100 text-green-800'],
  cancelled: ['Cancelled', 'bg-neutral-200 text-neutral-600'],
  draft: ['Draft', 'bg-neutral-200 text-neutral-700'],
  pending: ['Pending', 'bg-amber-100 text-amber-800'],
  live: ['Live', 'bg-green-100 text-green-800'],
  rejected: ['Rejected', 'bg-red-100 text-red-700'],
  hidden: ['Hidden', 'bg-neutral-200 text-neutral-600'],
  suspended: ['Suspended', 'bg-red-100 text-red-700'],
}

export default function StatusBadge({ status }) {
  const [label, style] = STYLES[status] ?? [status, 'bg-neutral-200 text-neutral-700']
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${style}`}>{label}</span>
}
