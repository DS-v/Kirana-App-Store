/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        kirana: {
          green: '#059669',
          light: '#d1fae5',
          dark:  '#064e3b',
        },
      },
      boxShadow: {
        'card':    '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        'card-md': '0 4px 16px rgba(0,0,0,0.07), 0 1px 4px rgba(0,0,0,0.04)',
        'card-lg': '0 8px 32px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.05)',
        'nav':     '0 8px 32px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.06)',
        'btn':     '0 4px 14px rgba(16,185,129,0.35), 0 1px 3px rgba(0,0,0,0.08)',
        'btn-press':'0 1px 4px rgba(16,185,129,0.25)',
      },
      backgroundImage: {
        'emerald-gradient': 'linear-gradient(135deg, #059669 0%, #10b981 60%, #34d399 100%)',
        'card-shine': 'linear-gradient(135deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0) 50%)',
      },
      keyframes: {
        'fade-up': {
          '0%':   { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-up': {
          '0%':   { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pop': {
          '0%':   { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'voice-pulse': {
          '0%, 100%': { transform: 'scale(1)',    boxShadow: '0 0 0 0 rgba(16,185,129,0.4)' },
          '50%':      { transform: 'scale(1.06)', boxShadow: '0 0 0 14px rgba(16,185,129,0)' },
        },
        'shimmer': {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'fade-up':    'fade-up 0.22s ease-out',
        'fade-in':    'fade-in 0.18s ease-out',
        'slide-up':   'slide-up 0.25s ease-out',
        'pop':        'pop 0.18s ease-out',
        'voice-pulse':'voice-pulse 1.4s ease-in-out infinite',
        'shimmer':    'shimmer 1.8s linear infinite',
      },
    },
  },
  plugins: [],
}
