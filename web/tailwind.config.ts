import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: "#1E3A5F",
        ambar: "#B45309",
        hueso: "#F6F2EA"
      }
    }
  },
  plugins: []
};

export default config;
