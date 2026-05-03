import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Package, ShoppingBag, Users, Sun } from 'lucide-react'
import useStore from '../store/useStore'

const tabs = [
  { to: '/',          icon: LayoutDashboard, label: 'Home' },
  { to: '/catalog',   icon: Package,         label: 'Catalog' },
  { to: '/orders',    icon: ShoppingBag,     label: 'Orders' },
  { to: '/customers', icon: Users,           label: 'Customers' },
  { to: '/day',       icon: Sun,             label: 'Day End' },
]

export default function BottomNav() {
  const incomingCount = useStore(s => s.incomingMessages.filter(m => m.status === 'pending').length)

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/90 backdrop-blur-md border-t border-zinc-100">
      <div className="flex max-w-lg mx-auto px-2">
        {tabs.map(({ to, icon: Icon, label }) => {
          const badge = to === '/orders' && incomingCount > 0 ? incomingCount : 0
          return (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center justify-center py-2.5 gap-1 transition-colors relative ${
                  isActive ? 'text-emerald-600' : 'text-zinc-400'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <div className={`relative p-1.5 rounded-xl transition-colors ${isActive ? 'bg-emerald-50' : ''}`}>
                    <Icon size={20} strokeWidth={isActive ? 2.2 : 1.8} />
                    {badge > 0 && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
                        {badge > 9 ? '9+' : badge}
                      </span>
                    )}
                  </div>
                  <span className={`text-[10px] font-semibold tracking-wide ${isActive ? 'text-emerald-600' : 'text-zinc-400'}`}>
                    {label}
                  </span>
                </>
              )}
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}
