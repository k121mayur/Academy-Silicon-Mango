import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Primary — fresh "mango" brand (matches the logo's golden mango).
        // DEFAULT is the readable golden-amber for accent TEXT / icons / borders on
        // light surfaces (passes AA on white). `fill` is the bright mango yellow for
        // solid buttons & accent bars, paired with the dark espresso `on` text.
        // NOTE: white text on the bright fill is unreadable (1.7:1) — always pair
        // `bg-primary-fill` with `text-primary-on`, never `text-white`.
        primary: {
          DEFAULT: "#a85f00",
          fill: "#ffb800",
          fillHover: "#f0a800",
          fillActive: "#e09e00",
          container: "#ffb800",
          fixed: "#ffba20",
          on: "#3d2b00",
          onContainer: "#92400e",
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
        "card-hover": "0 2px 6px rgba(124,88,0,0.10), 0 18px 40px -12px rgba(124,88,0,0.18)",
        modal: "0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08)",
        nav: "2px 0 16px rgba(0,0,0,0.06)",
        // Brand-tinted glow for hero / CTA accents (shadow follows the surface hue, never pure black)
        glow: "0 0 0 1px rgba(255,184,0,0.18), 0 20px 60px -18px rgba(255,184,0,0.45)",
        "glow-cyan": "0 0 0 1px rgba(0,215,254,0.16), 0 20px 60px -18px rgba(0,215,254,0.35)",
        inset: "inset 0 1px 0 rgba(255,255,255,0.6)",
      },
      // Custom easing curves — built-in CSS easings are too weak (Emil Kowalski).
      transitionTimingFunction: {
        out: "cubic-bezier(0.23, 1, 0.32, 1)",
        "in-out": "cubic-bezier(0.77, 0, 0.175, 1)",
        drawer: "cubic-bezier(0.32, 0.72, 0, 1)",
        spring: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      backgroundImage: {
        "mango-aurora":
          "radial-gradient(60% 60% at 15% 10%, rgba(255,184,0,0.22) 0%, transparent 60%), radial-gradient(55% 55% at 85% 20%, rgba(0,215,254,0.16) 0%, transparent 55%), radial-gradient(50% 50% at 60% 95%, rgba(210,228,251,0.30) 0%, transparent 60%)",
        "grain":
          "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E\")",
      },
      animation: {
        "fade-in": "fade-in 0.3s cubic-bezier(0.23,1,0.32,1) both",
        "slide-up": "slide-up 0.4s cubic-bezier(0.16,1,0.3,1) both",
        "scale-in": "scale-in 0.22s cubic-bezier(0.23,1,0.32,1) both",
        "blur-in": "blur-in 0.5s cubic-bezier(0.16,1,0.3,1) both",
        float: "float 6s ease-in-out infinite",
        "float-slow": "float 9s ease-in-out infinite",
        shimmer: "shimmer 1.6s linear infinite",
        marquee: "marquee 32s linear infinite",
        "gradient-pan": "gradient-pan 8s ease-in-out infinite",
        "spin-slow": "spin 1.4s linear infinite",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "slide-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          // Never animate from scale(0) — start from 0.95 (Emil)
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "blur-in": {
          "0%": { opacity: "0", filter: "blur(8px)", transform: "translateY(10px)" },
          "100%": { opacity: "1", filter: "blur(0)", transform: "translateY(0)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        "gradient-pan": {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
