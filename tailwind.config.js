/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './App.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Neon accent palette for futuristic/glassmorphism UI
        neon: {
          cyan:    '#00f3ff',
          blue:    '#0080ff',
          purple:  '#8b00ff',
          pink:    '#ff00c8',
          green:   '#00ff87',
        },
        glass: {
          light:  'rgba(255,255,255,0.08)',
          border: 'rgba(255,255,255,0.15)',
          dark:   'rgba(0,0,0,0.4)',
        },
      },
      fontFamily: {
        mono: ['Courier New', 'monospace'],
      },
    },
  },
  plugins: [],
};
