import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        midnight: "#050811",
        abyss: "#090d16",
        biocyan: "#4fd1c5",
        candlegold: "#f6ad55",
        mysticpurple: "#b794f4",
        parchment: "#f4ecd8",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "Inter", "sans-serif"],
        serif: ["var(--font-serif)", "Cormorant Garamond", "Georgia", "serif"],
        handwriting: ["var(--font-handwriting)", "Caveat", "cursive"],
      },
      keyframes: {
        pulseGlow: {
          "0%, 100%": { opacity: "0.65", transform: "scale(1)" },
          "50%": { opacity: "1", transform: "scale(1.06)" },
        },
        floatSlow: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-5px)" },
        },
        soundWave: {
          "0%, 100%": { height: "4px" },
          "50%": { height: "16px" },
        },
      },
      animation: {
        "pulse-glow": "pulseGlow 3.5s ease-in-out infinite",
        "float-slow": "floatSlow 4s ease-in-out infinite",
        "sound-wave": "soundWave 1.1s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
export default config;

