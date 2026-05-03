import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Package, ShoppingBag, Users, Sun } from 'lucide-react'

const tabs = [
  { to: '/',          icon: LayoutDashboard, label: 'Home' },
  { to: '/catalog',   icon: Package,         label: 'Catalog' },
  { to: '/orders',    icon: ShoppingBag,     label: 'Orders' },
  { to: '/customers', icon: Users,           label: 'Customers' },
  { to: '/day',       icon: Sun,             label: 'Day End' },
]

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40 safe-area-bottom">
      <div className="flex max-w-lg mx-auto">
        {tabs.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center py-2 gap-0.5 tap-target transition-colors ${
                isActive ? 'text-green-600' : 'text-gray-400'
              }`
            }
          >
            <Icon size={22} />
            <span className="text-xs font-medium">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
