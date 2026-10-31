import { Link } from 'react-router-dom'
import Wordmark from '../components/Wordmark.jsx'

export default function NotFound() {
  return (
    <main className="mx-auto min-h-screen max-w-md px-4 pt-4">
      <Wordmark />
      <h1 className="mt-16 text-center text-2xl font-semibold">Page not found</h1>
      <Link to="/" className="mt-4 block text-center text-brand underline">Go to home</Link>
    </main>
  )
}
