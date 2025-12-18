import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    screens: {
      'xs': '480px',
      'sm': '640px',
      'md': '768px',
      'lg': '1024px',
      'xl': '1280px',
      '2xl': '1536px',
    },
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
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        // Channel colors
        whatsapp: '#25D366',
        telegram: '#0088cc',
        instagram: '#E4405F',
        facebook: '#1877F2',
        // Hot Pink + Purple Kawaii Theme
        hotpink: {
          50: '#fff0f7',
          100: '#ffe1ef',
          200: '#ffc2df',
          300: '#ff94c7',
          400: '#ff55a5',
          500: '#ff1a85',
          600: '#f00070',
          700: '#d1005e',
          800: '#ad004f',
          900: '#8f0044',
        },
        peach: {
          50: '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#f97316',
        },
        mint: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
        },
        lavender: {
          50: '#faf5ff',
          100: '#f3e8ff',
          200: '#e9d5ff',
          300: '#d8b4fe',
          400: '#c084fc',
          500: '#a855f7',
        },
        blush: {
          50: '#fff1f2',
          100: '#ffe4e6',
          200: '#fecdd3',
          300: '#fda4af',
          400: '#fb7185',
          500: '#f43f5e',
        },
        cream: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        '2xl': '1rem',
        '3xl': '1.5rem',
        '4xl': '2rem',
      },
      boxShadow: {
        'pink-sm': '0 1px 2px 0 rgba(236, 72, 153, 0.05)',
        'pink': '0 4px 6px -1px rgba(236, 72, 153, 0.1), 0 2px 4px -1px rgba(236, 72, 153, 0.06)',
        'pink-md': '0 4px 6px -1px rgba(236, 72, 153, 0.1), 0 2px 4px -1px rgba(236, 72, 153, 0.06)',
        'pink-lg': '0 10px 15px -3px rgba(236, 72, 153, 0.15), 0 4px 6px -2px rgba(236, 72, 153, 0.1)',
        'pink-xl': '0 20px 25px -5px rgba(236, 72, 153, 0.15), 0 10px 10px -5px rgba(236, 72, 153, 0.08)',
        'pink-glow': '0 0 20px rgba(236, 72, 153, 0.15), 0 0 40px rgba(236, 72, 153, 0.1)',
        'lavender': '0 4px 6px -1px rgba(168, 85, 247, 0.1), 0 2px 4px -1px rgba(168, 85, 247, 0.06)',
        'lavender-lg': '0 10px 15px -3px rgba(168, 85, 247, 0.15), 0 4px 6px -2px rgba(168, 85, 247, 0.1)',
        // Hotpink shadows
        'hotpink': '0 4px 15px rgba(255, 26, 133, 0.3)',
        'hotpink-lg': '0 8px 25px rgba(255, 26, 133, 0.4)',
        'hotpink-glow': '0 0 20px rgba(255, 26, 133, 0.4), 0 0 40px rgba(255, 26, 133, 0.2)',
        'bubble': '0 2px 12px rgba(255, 26, 133, 0.2)',
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
        'float': {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-5px)' },
        },
        'sparkle': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.7', transform: 'scale(1.1)' },
        },
        'bounce-in': {
          '0%': { opacity: '0', transform: 'scale(0.3)' },
          '50%': { opacity: '1', transform: 'scale(1.05)' },
          '70%': { transform: 'scale(0.9)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'wiggle': {
          '0%, 100%': { transform: 'rotate(-3deg)' },
          '50%': { transform: 'rotate(3deg)' },
        },
        'heartbeat': {
          '0%, 100%': { transform: 'scale(1)' },
          '25%': { transform: 'scale(1.1)' },
          '50%': { transform: 'scale(1)' },
          '75%': { transform: 'scale(1.1)' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
        'shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        // Kawaii animations
        'jelly': {
          '0%': { transform: 'scale(1, 1)' },
          '25%': { transform: 'scale(0.95, 1.05)' },
          '50%': { transform: 'scale(1.05, 0.95)' },
          '75%': { transform: 'scale(0.98, 1.02)' },
          '100%': { transform: 'scale(1, 1)' },
        },
        'pop': {
          '0%': { transform: 'scale(0)', opacity: '0' },
          '50%': { transform: 'scale(1.2)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'wiggle-more': {
          '0%, 100%': { transform: 'rotate(-6deg)' },
          '50%': { transform: 'rotate(6deg)' },
        },
        'message-in': {
          '0%': { opacity: '0', transform: 'translateY(10px) scale(0.95)' },
          '60%': { transform: 'translateY(-2px) scale(1.02)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 5px rgba(255, 26, 133, 0.4)' },
          '50%': { boxShadow: '0 0 20px rgba(255, 26, 133, 0.6)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'float': 'float 3s ease-in-out infinite',
        'sparkle': 'sparkle 2s ease-in-out infinite',
        'bounce-in': 'bounce-in 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
        'slide-up': 'slide-up 0.3s ease-out',
        'wiggle': 'wiggle 0.3s ease-in-out',
        'heartbeat': 'heartbeat 1s ease-in-out infinite',
        'pulse-soft': 'pulse-soft 2s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite',
        // Kawaii animations
        'jelly': 'jelly 0.5s ease-in-out',
        'pop': 'pop 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
        'wiggle-more': 'wiggle-more 0.4s ease-in-out',
        'message-in': 'message-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
      },
      backgroundImage: {
        'gradient-pink': 'linear-gradient(135deg, hsl(330, 80%, 95%) 0%, hsl(280, 60%, 95%) 100%)',
        'gradient-lavender': 'linear-gradient(135deg, hsl(280, 60%, 95%) 0%, hsl(330, 80%, 95%) 100%)',
        'gradient-peach': 'linear-gradient(135deg, hsl(20, 100%, 95%) 0%, hsl(330, 80%, 95%) 100%)',
        'gradient-cute': 'linear-gradient(135deg, #ec4899 0%, #a855f7 100%)',
        'gradient-hotpink': 'linear-gradient(135deg, #ff1a85 0%, #a855f7 100%)',
        'gradient-hotpink-soft': 'linear-gradient(135deg, rgba(255, 26, 133, 0.15) 0%, rgba(168, 85, 247, 0.15) 100%)',
        'gradient-bubble-out': 'linear-gradient(135deg, #ff1a85 0%, #a855f7 100%)',
        'gradient-bubble-in': 'linear-gradient(135deg, #faf5ff 0%, #fff0f7 100%)',
        'shimmer': 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
