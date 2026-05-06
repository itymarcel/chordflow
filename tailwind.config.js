/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}", "./public/index.html"],
  theme: {
    extend: {
      colors: {
        base: "#06131f",
        panel: "#0c2132",
        accent: "#8df6ff",
        accentStrong: "#35d6ff",
        glow: "#7ce8ff",
        ink: "#edf7ff",
        muted: "#90abc0",
        warning: "#f3b77a"
      },
      boxShadow: {
        neon: "0 0 35px rgba(125, 239, 255, 0.2)",
        key: "0 20px 40px rgba(0, 0, 0, 0.25)"
      },
      backgroundImage: {
        grid: "linear-gradient(rgba(141, 246, 255, 0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(141, 246, 255, 0.08) 1px, transparent 1px)"
      },
      fontFamily: {
        display: ["'Space Grotesk'", "sans-serif"],
        body: ["'IBM Plex Sans'", "sans-serif"]
      },
      keyframes: {
        pulseGlow: {
          "0%, 100%": { boxShadow: "0 0 0 rgba(53, 214, 255, 0.0)" },
          "50%": { boxShadow: "0 0 25px rgba(53, 214, 255, 0.35)" }
        }
      },
      animation: {
        pulseGlow: "pulseGlow 2.5s ease-in-out infinite"
      }
    }
  },
  plugins: []
};
