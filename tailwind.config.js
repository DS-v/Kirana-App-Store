/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      // Distinct palette tuned for Indian kirana shopkeepers:
      //   • Emerald — fresh, growth, money-good (kept as primary)
      //   • Saffron / marigold — warmth, festive, attention
      //   • Cream — paper, ledger, less harsh than zinc-50
      //   • Ink — deep brown-black, easier on eyes than pure black
      //   • Maroon — Khaata / udhaar context (ledger book vibe)
      colors: {
        // Primary brand
        kirana: {
          50:  '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',   // primary
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
        },
        // Accent — saffron / marigold
        saffron: {
          50:  '#FFF8EC',
          100: '#FEEFCB',
          200: '#FDDDA0',
          300: '#FBC664',
          400: '#F8AC2C',
          500: '#F19200',   // accent
          600: '#D77600',
          700: '#A95B00',
          800: '#7C4300',
          900: '#553002',
        },
        // Khaata / udhaar — deep ledger maroon
        khaata: {
          50:  '#FCF1F2',
          100: '#F8DCE0',
          200: '#F0B6BE',
          300: '#E48695',
          400: '#D45970',
          500: '#B83C57',
          600: '#8B2C3D',   // khaata pop
          700: '#6B2030',
          800: '#4D1622',
          900: '#330E17',
        },
        // Surfaces — warm cream rather than cold zinc
        cream: {
          50:  '#FCFAF4',   // page bg
          100: '#F8F4E9',   // card bg
          200: '#F1EAD6',
          300: '#E5DAB9',
        },
        // Ink — body text / borders / icons
        ink: {
          50:  '#F5F2EE',
          100: '#E8E2D9',
          200: '#C9BFB0',
          300: '#9C8E7A',
          400: '#6E6253',
          500: '#473F33',
          600: '#2C261D',   // strong text
          700: '#1F1B14',
          800: '#15110D',
          900: '#0B0906',
        },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', '"Inter"', 'system-ui', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', '"Inter Tight"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      fontFeatureSettings: {
        // Ensure tabular numerals for prices / counts everywhere.
      },
      boxShadow: {
        // Softer, warmer shadows than the cool default zinc shadows
        'card':     '0 1px 2px rgba(33,28,19,0.04), 0 2px 6px rgba(33,28,19,0.04)',
        'card-md':  '0 4px 16px rgba(33,28,19,0.06), 0 2px 6px rgba(33,28,19,0.05)',
        'card-lg':  '0 12px 40px rgba(33,28,19,0.10), 0 4px 12px rgba(33,28,19,0.06)',
        'card-hi':  '0 18px 50px rgba(33,28,19,0.16), 0 6px 18px rgba(33,28,19,0.08)',
        'nav':      '0 -4px 24px rgba(33,28,19,0.08), 0 8px 32px rgba(33,28,19,0.14), 0 2px 8px rgba(33,28,19,0.04)',
        'btn':      '0 6px 20px rgba(5,150,105,0.28), 0 1px 3px rgba(33,28,19,0.10), inset 0 1px 0 rgba(255,255,255,0.20)',
        'btn-acc':  '0 6px 20px rgba(241,146,0,0.32), 0 1px 3px rgba(33,28,19,0.10), inset 0 1px 0 rgba(255,255,255,0.25)',
        'btn-press':'0 1px 3px rgba(5,150,105,0.20)',
        'inset-1':  'inset 0 1px 2px rgba(33,28,19,0.04)',
        // Glowing shadow for selected nav tab
        'tab-glow': '0 8px 24px rgba(5,150,105,0.45), 0 2px 6px rgba(5,150,105,0.30)',
      },
      backgroundImage: {
        // Brand gradients — warmer than the previous flat emerald
        'emerald-gradient':  'linear-gradient(135deg, #047857 0%, #059669 50%, #10b981 100%)',
        'emerald-festive':   'linear-gradient(135deg, #064e3b 0%, #047857 30%, #059669 60%, #10b981 100%)',
        'saffron-gradient':  'linear-gradient(135deg, #D77600 0%, #F19200 50%, #FBC664 100%)',
        'khaata-gradient':   'linear-gradient(135deg, #6B2030 0%, #8B2C3D 60%, #B83C57 100%)',
        'cream-soft':        'linear-gradient(180deg, #FCFAF4 0%, #F8F4E9 100%)',
        'card-shine':        'linear-gradient(135deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0) 50%)',
        // Subtle paper texture — base64'd 1px noise repeated. Tuned light.
        'paper': 'url("data:image/svg+xml;utf8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%22120%22%3E%3Cfilter id=%22n%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.85%22 numOctaves=%221%22/%3E%3CfeColorMatrix values=%220 0 0 0 0.96 0 0 0 0 0.92 0 0 0 0 0.82 0 0 0 0.05 0%22/%3E%3C/filter%3E%3Crect width=%22120%22 height=%22120%22 filter=%22url(%23n)%22/%3E%3C/svg%3E")',
        // Diagonal jaali pattern — very subtle, decorative on heros
        'jaali':  'url("data:image/svg+xml;utf8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2240%22 height=%2240%22 viewBox=%220 0 40 40%22%3E%3Cpath d=%22M0 20 L20 0 L40 20 L20 40 Z%22 fill=%22none%22 stroke=%22rgba(255,255,255,0.08)%22 stroke-width=%221%22/%3E%3C/svg%3E")',
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
          '0%, 100%': { transform: 'scale(1)',    boxShadow: '0 0 0 0 rgba(241,146,0,0.45)' },
          '50%':      { transform: 'scale(1.07)', boxShadow: '0 0 0 16px rgba(241,146,0,0)' },
        },
        'shimmer': {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'glow-soft': {
          '0%, 100%': { boxShadow: '0 8px 24px rgba(5,150,105,0.35)' },
          '50%':      { boxShadow: '0 8px 32px rgba(5,150,105,0.55)' },
        },
      },
      animation: {
        'fade-up':    'fade-up 0.22s ease-out',
        'fade-in':    'fade-in 0.18s ease-out',
        'slide-up':   'slide-up 0.25s ease-out',
        'pop':        'pop 0.18s ease-out',
        'voice-pulse':'voice-pulse 1.4s ease-in-out infinite',
        'shimmer':    'shimmer 1.8s linear infinite',
        'glow-soft':  'glow-soft 2.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
