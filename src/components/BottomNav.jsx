import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Package, ShoppingBag, Users } from 'lucide-react'
import useStore from '../store/useStore'

const tabs = [
  { to: '/',          icon: LayoutDashboard, label: 'Home' },
  { to: '/catalog',   icon: Package,         label: 'Catalog' },
  { to: '/orders',    icon: ShoppingBag,     label: 'Orders' },
  { to: '/customers', icon: Users,           label: 'People' },
]

export default function BottomNav() {
  const incomingCount = useStore(s => s.incomingMessages.filter(m => m.status === 'pending').length)

  return (
    /* Floating pill — sits 12px off the bottom edge */
    <div className="fixed bottom-3 left-3 right-3 z-40 flex justify-center pointer-events-none">
      <nav
        className="pointer-events-auto w-full max-w-sm bg-white/96 backdrop-blur-2xl rounded-2xl flex items-center px-1 py-1.5"
        style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)' }}
      >
        {tabs.map(({ to, icon: Icon, label }) => {
          const badge = to === '/orders' && incomingCount > 0 ? incomingCount : 0
          return (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className="flex-1"
            >
              {({ isActive }) => (
                <div
                  className={`relative flex flex-col items-center gap-0.5 py-2 mx-0.5 rounded-xl transition-all duration-200 ${
                    isActive
                      ? 'bg-emerald-500'
                      : 'hover:bg-zinc-50 active:bg-zinc-100'
                  }`}
                >
                  {/* Icon */}
                  <div className="relative">
                    <Icon
                      size={20}
                      strokeWidth={isActive ? 2.2 : 1.8}
                      className={isActive ? 'text-white' : 'text-zinc-400'}
                    />
                    {/* Badge */}
                    {badge > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center px-1 leading-none">
                        {badge > 9 ? '9+' : badge}
                      </span>
                    )}
                  </div>

                  {/* Label */}
                  <span className={`text-[10px] font-bold tracking-wide leading-none ${isActive ? 'text-white' : 'text-zinc-400'}`}>
                    {label}
                  </span>
                </div>
              )}
            </NavLink>
          )
        })}
      </nav>
    </div>
  )
}
