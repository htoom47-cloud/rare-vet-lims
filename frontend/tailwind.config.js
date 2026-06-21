/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
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
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        brand: {
          cream: '#FDFAF3',
          brown: '#4A3728',
          gold: '#C5A059',
          goldLight: '#E8D5B5',
          goldPale: '#F5EDE0',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['Tajawal', 'Inter', 'Segoe UI', 'Tahoma', 'sans-serif'],
        arabic: ['Tajawal', 'Segoe UI', 'Tahoma', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 3px rgba(74, 55, 40, 0.06), 0 4px 16px rgba(74, 55, 40, 0.04)',
        'card-hover': '0 4px 12px rgba(74, 55, 40, 0.1), 0 8px 24px rgba(74, 55, 40, 0.06)',
        header: '0 1px 0 rgba(74, 55, 40, 0.06)',
      },
      backgroundImage: {
        'app-mesh': 'radial-gradient(ellipse 80% 60% at 100% 0%, rgba(197, 160, 89, 0.12), transparent), radial-gradient(ellipse 60% 50% at 0% 100%, rgba(74, 55, 40, 0.06), transparent)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
