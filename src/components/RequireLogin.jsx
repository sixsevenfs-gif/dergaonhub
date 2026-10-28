import { currentCustomer, getStore } from '../lib/store.js'
import { useData } from '../lib/useData.js'
import Login from '../pages/customer/Login.jsx'

// With phone OTP switched on (Admin → Settings), the shop opens with a login first. After one OTP the
// login is kept on this phone, so it is not asked again. With OTP off, the shop opens as before.
export default function RequireLogin({ children }) {
  const { data: store } = useData(getStore) // also re-renders after login / logout
  if (store === undefined) return null
  const me = currentCustomer()
  if (store?.otp_required && !(me?.phone && me?.verified)) return <Login gate />
  return children
}
