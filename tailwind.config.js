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
        background: '#FFF9F5',
        surface: '#ffffff',
        'surface-light': '#FFF5EF',
        primary: '#E7266A',
        secondary: '#C156D0',
        dark: '#2D1136',
      },
      fontFamily: {
        sans: ['Outfit'],
        serif: ['PlayfairDisplay'],
      },
    },
  },
  plugins: [],
};
