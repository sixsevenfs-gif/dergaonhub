import { Bell } from 'lucide-react'

// Pages of the App part of the admin (notifications, banners, app updates), as [path, label, countKey, Icon].
// Settings is always added after these (AdminArea.jsx). All of them are for the owner only.
export const APP_NAV = [
  ['/admin/app/notifications', 'Notifications', null, Bell],
]
