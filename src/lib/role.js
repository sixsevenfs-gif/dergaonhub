import { createContext, useContext } from 'react'

// Who is using the dashboard: 'owner' (admins table) or 'executive' (order desk, update 032).
// Owner-only buttons are hidden from the executive; the database refuses those actions too.
export const RoleContext = createContext('owner')

export function useRole() {
  const role = useContext(RoleContext)
  return { role, isOwner: role === 'owner', isExecutive: role === 'executive' }
}
