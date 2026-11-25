import { Bell, Image, RefreshCw } from 'lucide-react'

// Pages of the App part of the admin (notifications, banners, app updates), as [path, label, countKey, Icon].
// Settings is always added after these (AdminArea.jsx). All of them are for the owner only.
export const APP_NAV = [
  ['/admin/app/notifications', 'Notifications', null, Bell],
  ['/admin/app/banners', 'Banners', null, Image],
  ['/admin/app/updates', 'App updates', null, RefreshCw],
]
