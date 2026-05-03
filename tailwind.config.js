/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        kirana: {
          green: '#16a34a',
          light: '#dcfce7',
          dark: '#14532d',
        }
      }
    }
  },
  plugins: []
}
