import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#6A34FF',
        accent: '#F5A524',
        surface: '#0F172A',
        card: '#111827',
      },
      boxShadow: {
        glow: '0 0 30px rgba(106, 52, 255, 0.15)',
      },
    },
  },
  plugins: [],
};

export default config;
