import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Package, ShoppingBag, BookOpen } from 'lucide-react'
import useStore from '../store/useStore'

// Order Book is the primary tab. Khaata merges customers + udhaar.
// Saamaan replaces Catalog. Profile is the shop / settings screen.
const tabs = [
  { to: '/orders',    icon: ShoppingBag,     label: 'Order Book' },
  { to: '/customers', icon: BookOpen,        label: 'Khaata' },
  { to: '/catalog',   icon: Package,         label: 'Saamaan' },
  { to: '/profile',   icon: LayoutDashboard, label: 'Profile' },
]

// Inline gradient for the active pill — Tailwind's `bg-emerald-gradient`
// (an extended backgroundImage token) doesn't always resolve cleanly in JIT
// dev cache. Inline style is bulletproof and the same green we use on .btn-primary.
const activeGradient =
  'linear-gradient(135deg, #047857 0%, #059669 50%, #10b981 100%)'
const activeShadow =
  '0 6px 18px rgba(5,150,105,0.40), 0 2px 6px rgba(5,150,105,0.28), inset 0 1px 0 rgba(255,255,255,0.22)'

export default function BottomNav() {
  const incomingCount = useStore(s => s.incomingMessages.filter(m => m.status === 'pending').length)

  return (
    /* Floating pill — premium feel, glow on active tab.
       Reduced backdrop-blur (md vs 2xl) — much cheaper on mobile GPUs and
       removes the visible repaint stutter on tab change. */
    <div className="fixed bottom-3 left-3 right-3 z-40 flex justify-center pointer-events-none pb-safe">
      <nav
        className="pointer-events-auto w-full max-w-sm bg-white/95 backdrop-blur-md rounded-[22px] flex items-center px-1.5 py-1.5"
        style={{
          boxShadow:
            '0 -4px 24px rgba(33,28,19,0.06), 0 12px 40px rgba(33,28,19,0.14), 0 2px 6px rgba(33,28,19,0.04), 0 0 0 1px rgba(33,28,19,0.04)',
        }}
      >
        {tabs.map(({ to, icon: Icon, label }) => {
          const badge = to === '/orders' && incomingCount > 0 ? incomingCount : 0
          return (
            <NavLink
              key={to}
              to={to}
              end
              className="flex-1 min-h-[44px] flex"
              aria-label={label}
            >
              {({ isActive }) => (
                <div
                  className="relative flex-1 flex flex-col items-center justify-center gap-1 py-2 mx-0.5 rounded-2xl transition-[transform,background-color] duration-150 ease-out active:scale-[0.97]"
                  style={
                    isActive
                      ? { background: activeGradient, boxShadow: activeShadow }
                      : undefined
                  }
                >
                  {/* Icon */}
                  <div className="relative">
                    <Icon
                      size={isActive ? 20 : 19}
                      strokeWidth={isActive ? 2.4 : 1.8}
                      style={{ color: isActive ? '#ffffff' : '#9C8E7A' }}
                    />
                    {/* Active dot indicator */}
                    {isActive && (
                      <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-white/80" />
                    )}
                    {/* Badge — saffron, with glow */}
                    {badge > 0 && (
                      <span
                        className="absolute -top-1.5 -right-2 min-w-[18px] h-[18px] rounded-full text-white text-[10px] font-extrabold flex items-center justify-center px-1 leading-none ring-2 ring-white"
                        style={{
                          backgroundColor: '#F19200',
                          boxShadow: '0 2px 8px rgba(241,146,0,0.45)',
                        }}
                      >
                        {badge > 9 ? '9+' : badge}
                      </span>
                    )}
                  </div>

                  {/* Label */}
                  <span
                    className="text-[10px] font-extrabold leading-none tracking-wide"
                    style={{ color: isActive ? '#ffffff' : '#6E6253' }}
                  >
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
