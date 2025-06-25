/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html",
  ],
  theme: {
    extend: {
      fontFamily: {
        // Defines a custom font family 'inter'
        inter: ['Inter', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
