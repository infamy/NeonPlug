/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'neon-cyan': '#00FFF7',
        'neon-magenta': '#FF00FF',
        'electric-purple': '#9B30FF',
        'neon-yellow': '#FFF200',
        'dark-charcoal': '#121212',
        'deep-gray': '#1E1E1E',
        'cool-gray': '#B0B0B0',
      },
      boxShadow: {
        'glow-cyan': '0 0 6px #00fff7, 0 0 15px #00fff7',
        'glow-magenta': '0 0 6px #ff00ff, 0 0 15px #ff00ff',
        'glow-purple': '0 0 6px #9B30FF, 0 0 15px #9B30FF',
      },
      textShadow: {
        'glow-cyan': '0 0 4px #00fff7, 0 0 10px #00fff7',
        'glow-magenta': '0 0 4px #ff00ff, 0 0 10px #ff00ff',
      },
    },
  },
  plugins: [],
}

