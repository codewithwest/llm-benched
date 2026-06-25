/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#000000',
        panel: '#0A0A0A',
        border: '#1F1F1F',
        accent: '#FF00FF',
        accentHover: '#D900D9',
        textMain: '#F8FAFC',
        textMuted: '#94A3B8',
        success: '#10B981',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
