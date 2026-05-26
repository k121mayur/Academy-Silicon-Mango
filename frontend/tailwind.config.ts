import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Primary
        primary: {
          DEFAULT: "#7c5800",
          container: "#ffb800",
          fixed: "#ffba20",
          on: "#ffffff",
          onContainer: "#6b4c00",
        },
        // Secondary
        secondary: {
          DEFAULT: "#4f6073",
          container: "#d2e4fb",
          on: "#ffffff",
        },
        // Tertiary
        tertiary: {
          DEFAULT: "#00687b",
          container: "#00d7fe",
          on: "#ffffff",
        },
        // Surface
        surface: {
          DEFAULT: "#f8f9fa",
          container: "#edeeef",
          containerLow: "#f3f4f5",
          containerHigh: "#e7e8e9",
          lowest: "#ffffff",
        },
        // Foreground
        ink: {
          DEFAULT: "#191c1d",
          variant: "#514532",
          outline: "#837560",
          outlineVariant: "#d5c4ab",
        },
        danger: {
          DEFAULT: "#ba1a1a",
          container: "#ffdad6",
        },
        success: {
          DEFAULT: "#00687b",
          container: "#b3ecf5",
        },
      },
      fontFamily: {
        display: ['"Manrope"', "system-ui", "sans-serif"],
        sans: ['"Inter"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "monospace"],
      },
      fontSize: {
        "display-xl": ["48px", { lineHeight: "56px", letterSpacing: "-0.02em", fontWeight: "800" }],
        "display-lg": ["36px", { lineHeight: "44px", letterSpacing: "-0.01em", fontWeight: "700" }],
        "display-md": ["28px", { lineHeight: "36px", fontWeight: "700" }],
        headline: ["24px", { lineHeight: "32px", fontWeight: "600" }],
        "title-lg": ["20px", { lineHeight: "28px", fontWeight: "600" }],
        "title-md": ["16px", { lineHeight: "24px", fontWeight: "600" }],
        "body-lg": ["16px", { lineHeight: "24px", fontWeight: "400" }],
        "body-sm": ["14px", { lineHeight: "20px", fontWeight: "400" }],
        label: ["12px", { lineHeight: "16px", letterSpacing: "0.04em", fontWeight: "500" }],
        caption: ["10px", { lineHeight: "14px", letterSpacing: "0.1em", fontWeight: "700" }],
      },
      borderRadius: {
        sm: "4px",
        DEFAULT: "8px",
        md: "8px",
        xl: "12px",
        "2xl": "16px",
        "3xl": "24px",
      },
      boxShadow: {
        card: "0 1px 3px rgba(124,88,0,0.08), 0 4px 16px rgba(124,88,0,0.04)",
        modal: "0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08)",
        nav: "2px 0 16px rgba(0,0,0,0.06)",
      },
      animation: {
        "fade-in": "fade-in 0.3s ease-out",
        "slide-up": "slide-up 0.4s ease-out",
        float: "float 6s ease-in-out infinite",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "slide-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
