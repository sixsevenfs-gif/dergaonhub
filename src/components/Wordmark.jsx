import { Link } from 'react-router-dom'

export default function Wordmark({ className = 'text-2xl' }) {
  return (
    <Link to="/" className={`whitespace-nowrap font-black tracking-tight ${className}`}>
      dergaon hub<span className="text-accent">.</span>
    </Link>
  )
}
