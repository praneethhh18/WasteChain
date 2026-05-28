/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0a0d0b",           // deeper, warmer
        panel: "#10171a",        // slight warm tint
        line: "#1c2823",
        accent: "#2eea84",       // brighter green
        accent2: "#f5cf6f",      // warmer yellow
        cream: "#f5e6d3",        // for hero copy
        danger: "#ff6b6b",
        muted: "#8a9a93",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui"],
        serif: ["Fraunces", "ui-serif", "Georgia", "serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      boxShadow: {
        glow: "0 0 40px rgba(46, 234, 132, 0.18)",
        glowYellow: "0 0 40px rgba(245, 207, 111, 0.18)",
        card: "0 4px 24px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.04)",
      },
      letterSpacing: {
        tightish: "-0.022em",
        tight2: "-0.04em",
      },
      animation: {
        "fade-up": "fade-up 0.6s ease-out",
        "fade-in": "fade-in 0.5s ease-out",
        "pulse-slow": "pulse 3s ease-in-out infinite",
        "shimmer": "shimmer 2.4s linear infinite",
      },
      keyframes: {
        "fade-up": { "0%": { opacity: 0, transform: "translateY(12px)" }, "100%": { opacity: 1, transform: "translateY(0)" } },
        "fade-in": { "0%": { opacity: 0 }, "100%": { opacity: 1 } },
        "shimmer": { "0%": { backgroundPosition: "-200% 0" }, "100%": { backgroundPosition: "200% 0" } },
      },
    },
  },
  plugins: [],
};
