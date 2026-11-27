/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./*.html', './assets/gear-shelf.js', './assets/share-tool.js'],
  theme: {
    extend: {
      colors: {
        brand: {
          navy: '#0f172a',
          gold: '#d97706',
          blue: '#1e3a8a',
        },
      },
    },
  },
  plugins: [],
};
