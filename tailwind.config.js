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
        background: '#f8f5ff',
        surface: '#ffffff',
        'surface-light': '#f0ebf5',
        primary: '#e724ab',
        secondary: '#d479ec',
        dark: '#4b164c',
        lavender: '#dfcef9',
      },
      fontFamily: {
        sans: ['Outfit'],
        serif: ['PlayfairDisplay'],
      },
    },
  },
  plugins: [],
};
