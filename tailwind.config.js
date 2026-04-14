/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      boxShadow: {
        sciFi: "0 0 0 1px rgba(128,221,255,0.18), 0 16px 55px rgba(0,7,16,0.7), 0 0 70px rgba(37,101,173,0.25)",
      },
      keyframes: {
        spinSlow: {
          to: { transform: "rotate(360deg)" },
        },
      },
      animation: {
        spinSlow: "spinSlow 1s linear infinite",
      },
      fontFamily: {
        rajdhani: ["Rajdhani", "Segoe UI", "Tahoma", "sans-serif"],
      },
    },
  },
  plugins: [],
};
