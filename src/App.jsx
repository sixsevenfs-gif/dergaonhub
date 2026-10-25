import { Routes, Route } from 'react-router-dom'
import Home from './pages/customer/Home.jsx'
import ShopDashboard from './pages/shop/ShopDashboard.jsx'
import AdminPanel from './pages/admin/AdminPanel.jsx'
import NotFound from './pages/NotFound.jsx'

// One website, three areas (plan section 5):
//   /        -> customer site (no login)
//   /shop    -> shop owner dashboard (login, built in step 2)
//   /admin   -> founder-only admin panel (built in step 6)
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/shop/*" element={<ShopDashboard />} />
      <Route path="/admin/*" element={<AdminPanel />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
