import { Link } from 'react-router-dom'

export default function Wordmark() {
  return (
    <Link to="/" className="text-2xl font-black tracking-tight">
      dergaon<span className="text-accent">.</span>
    </Link>
  )
}
