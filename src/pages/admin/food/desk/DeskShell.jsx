import { useNavigate } from 'react-router-dom'
import { ToastHost } from './ui.jsx'
import { setNavigate } from './nav.js'

// Around the restaurant pages in Admin → Food: the Food Desk's styles (.fdesk), its messages, and moving between
// its pages with the admin's router.
export default function DeskShell({ children }) {
  const navigate = useNavigate()
  setNavigate(navigate)
  return (
    <div className="fdesk">
      <ToastHost>{children}</ToastHost>
    </div>
  )
}
