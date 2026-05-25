import type { Config } from "tailwindcss";

// Tailwind is scoped to the public-facing redesign.
// `corePlugins.preflight = false` keeps the global CSS reset off so the
// inline-styled internal staff tools (POS, dashboard, orders, etc.) keep
// rendering exactly as they do today — no surprise margin/padding wipes.

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: "#1a2e5a",
          50:  "#eef2f9",
          100: "#d6dee9",
          200: "#a6b6cf",
          300: "#7689b2",
          400: "#475d95",
          500: "#1a2e5a",
          600: "#162648",
          700: "#101c36",
          800: "#0a1325",
          900: "#060d1f",
          // Founder-spec for bscbahamas.com landing (2026-05-24).
          brand: "#020B1C",
          card:  "#071225",
        },
        gold: {
          DEFAULT: "#f4c842",
          50:  "#fffaeb",
          100: "#fef0c7",
          200: "#fde08a",
          300: "#fbcd4f",
          400: "#f4c842",
          500: "#e0ad19",
          600: "#c28a10",
          700: "#9b6711",
          800: "#7e5215",
          900: "#6c4318",
          // Founder-spec for bscbahamas.com landing (2026-05-24).
          brand: "#F5C518",
          hover: "#FFD84D",
        },
        // Cyan accent for the "BROWSE BY CATEGORY" label + small details.
        cyan: {
          brand: "#00D4FF",
        },
      },
      fontFamily: {
        sans: ['"Inter"', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
        display: ['"Playfair Display"', 'Georgia', 'serif'],
      },
      boxShadow: {
        card: "0 1px 2px rgba(15,23,42,0.04), 0 4px 12px rgba(15,23,42,0.06)",
        "card-hover": "0 4px 8px rgba(15,23,42,0.06), 0 12px 32px rgba(15,23,42,0.12)",
      },
    },
  },
  plugins: [],
};

export default config;
