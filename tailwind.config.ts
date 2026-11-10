import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#101828",
        brand: { DEFAULT: "#0F766E", dark: "#115E59", light: "#CCFBF1" },
        accent: { DEFAULT: "#EA580C", dark: "#C2410C" },
        appbg: "#F6F7F9",
      },
      fontFamily: {
        heading: ["var(--font-poppins)", "Poppins", "sans-serif"],
        body: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 3px rgba(16,24,40,0.08), 0 4px 14px rgba(16,24,40,0.05)",
        pop: "0 8px 30px rgba(16,24,40,0.12)",
      },
    },
  },
  plugins: [],
};
export default config;
