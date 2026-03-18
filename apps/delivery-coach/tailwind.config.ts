import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#0f294d",
        cloud: "#eef3f7",
        line: "#d7e0ea",
        panel: "#ffffff",
        slate: "#516173",
        success: "#1f7a57",
        warning: "#b36b00",
        danger: "#b42318"
      },
      boxShadow: {
        panel: "0 12px 32px rgba(15, 41, 77, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
