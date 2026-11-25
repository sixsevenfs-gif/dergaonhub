import { Bell, Image, LayoutDashboard, RefreshCw, Power } from 'lucide-react'

// Pages of the App Control Center (the App part of the admin), as [path, label, countKey, Icon].
// Settings is always added after these (AdminArea.jsx). All of them are for the owner only.
export const APP_NAV = [
  ['/admin/app', 'Overview', null, LayoutDashboard],
  ['/admin/app/banners', 'Banners', null, Image],
  ['/admin/app/notifications', 'Notifications', null, Bell],
  ['/admin/app/updates', 'App update', null, RefreshCw],
  ['/admin/app/status', 'App status', null, Power],
]
