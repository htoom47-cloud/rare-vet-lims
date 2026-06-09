/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          cream: '#FDFAF3',
          brown: '#4A3728',
          gold: '#C5A059',
          goldLight: '#E8D5B5',
          goldPale: '#F5EDE0',
        },
        primary: {
          50: '#FDFAF3',
          100: '#F8F2E8',
          200: '#EDE0C8',
          300: '#D9C48A',
          400: '#C5A059',
          500: '#A88644',
          600: '#4A3728',
          700: '#3D2E22',
          800: '#302419',
          900: '#241A12',
        },
      },
      fontFamily: {
        sans: ['Tajawal', 'Inter', 'Segoe UI', 'Tahoma', 'sans-serif'],
        arabic: ['Tajawal', 'Segoe UI', 'Tahoma', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
