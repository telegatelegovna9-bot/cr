/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Midnight Aurora palette
        bg: {
          primary: '#0A0A12',
          secondary: '#12121E',
          tertiary: '#1A1A2E',
          elevated: '#1E1E32',
        },
        surface: {
          DEFAULT: '#16162A',
          hover: '#1E1E36',
          active: '#252542',
          glass: 'rgba(22, 22, 42, 0.6)',
        },
        accent: {
          DEFAULT: '#6366f1',
          light: '#818cf8',
          dark: '#4f46e5',
          glow: 'rgba(99, 102, 241, 0.15)',
        },
        violet: {
          glow: 'rgba(139, 92, 246, 0.15)',
        },
        positive: '#22c55e',
        negative: '#ef4444',
        warning: '#f59e0b',
        text: {
          primary: '#E8E8F0',
          secondary: '#9898B8',
          muted: '#6B6B8A',
        },
        border: {
          DEFAULT: 'rgba(255,255,255,0.06)',
          light: 'rgba(255,255,255,0.1)',
          accent: 'rgba(99, 102, 241, 0.3)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      borderRadius: {
        'xl': '16px',
        '2xl': '20px',
      },
      boxShadow: {
        'glow-sm': '0 0 15px rgba(99, 102, 241, 0.1)',
        'glow-md': '0 0 30px rgba(99, 102, 241, 0.15)',
        'glow-lg': '0 4px 60px rgba(99, 102, 241, 0.2)',
        'glow-positive': '0 0 20px rgba(34, 197, 94, 0.15)',
        'glow-negative': '0 0 20px rgba(239, 68, 68, 0.15)',
        'glass': '0 8px 32px rgba(0, 0, 0, 0.3)',
        'glass-lg': '0 16px 48px rgba(0, 0, 0, 0.4)',
      },
      backgroundImage: {
        'aurora': 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a78bfa 100%)',
        'aurora-subtle': 'linear-gradient(135deg, rgba(99,102,241,0.1) 0%, rgba(139,92,246,0.05) 100%)',
        'glass-gradient': 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'float': 'float 6s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite',
        'aurora-shift': 'aurora-shift 8s ease-in-out infinite',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { opacity: '0.4' },
          '50%': { opacity: '1' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        'shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'aurora-shift': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
      },
      backdropBlur: {
        'xs': '2px',
        'glass': '20px',
        'glass-lg': '40px',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
};
