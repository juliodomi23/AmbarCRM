import type { Config } from "tailwindcss";

const hsl = (token: string) => `hsl(var(${token}) / <alpha-value>)`;

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: hsl("--background"), surface: hsl("--surface"), foreground: hsl("--foreground"),
        card: { DEFAULT: hsl("--card"), foreground: hsl("--card-foreground") },
        muted: { DEFAULT: hsl("--muted"), foreground: hsl("--muted-foreground") },
        border: hsl("--border"), input: hsl("--input"),
        primary: { DEFAULT: hsl("--primary"), foreground: hsl("--primary-foreground") },
        accent: { DEFAULT: hsl("--accent"), foreground: hsl("--accent-foreground") },
        "brand-from": hsl("--brand-from"), "brand-to": hsl("--brand-to"),
        success: hsl("--success"), warning: hsl("--warning"), info: hsl("--info"), destructive: hsl("--destructive")
      },
      fontFamily: { sans: ["var(--font-inter)", "sans-serif"], display: ["var(--font-jakarta)", "sans-serif"] },
      borderRadius: { lg: "var(--radius)", xl: "calc(var(--radius) + .25rem)", "2xl": "calc(var(--radius) + .65rem)" },
      boxShadow: { soft: "var(--shadow-soft)", lift: "var(--shadow-lift)", pop: "var(--shadow-pop)", glow: "var(--shadow-glow)" },
      backgroundImage: { "brand-gradient": "linear-gradient(135deg, hsl(var(--brand-from)), hsl(var(--brand-to)))" }
    }
  },
  plugins: []
};

export default config;
