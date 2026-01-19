import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./client/index.html", "./client/src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      // TerraValue Design System - "Modern Cartographic"
      fontFamily: {
        display: ['DM Serif Display', 'Georgia', 'serif'],
        body: ['IBM Plex Sans', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'monospace'],
      },
      colors: {
        // Core Earth Tones
        terra: {
          black: '#1a1814',
          brown: '#3d2e1f',
          umber: '#6b4423',
        },
        // Working Greens - Crops & Growth
        field: {
          DEFAULT: '#2d5016',
          green: '#2d5016',
          spring: '#4a7c23',
          light: '#6b9b3a',
        },
        // Wheat & Cream tones
        wheat: {
          pale: '#e8dcc4',
          cream: '#faf6ed',
          dark: '#c4b59d',
        },
        // Accent: Golden Hour
        gold: {
          DEFAULT: '#d4a03c',
          light: '#f0c866',
          dark: '#b8862a',
        },
        // CSR2 Scale Colors
        csr: {
          excellent: '#2d5016',
          good: '#d4a03c',
          fair: '#c17f24',
          poor: '#8b4513',
        },
        // AI Insight color
        insight: '#6366f1',
        // Warm Gray Neutrals
        warm: {
          50: '#fafaf8',
          100: '#f4f3f0',
          200: '#e8e6e1',
          300: '#d3d0c9',
          400: '#a8a49b',
          500: '#78746b',
          600: '#5c5850',
          700: '#45423c',
          800: '#2e2c28',
          900: '#1a1814',
        },
        // shadcn/ui semantic colors (using CSS variables)
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        chart: {
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        'terra': '0 4px 20px -4px rgba(26, 24, 20, 0.12)',
        'terra-lg': '0 8px 30px -6px rgba(26, 24, 20, 0.18)',
        'terra-xl': '0 12px 40px -8px rgba(26, 24, 20, 0.22)',
        'inset-terra': 'inset 0 2px 4px rgba(26, 24, 20, 0.06)',
        'gold-glow': '0 0 20px rgba(212, 160, 60, 0.3)',
      },
      backgroundImage: {
        'contour': "url('/patterns/contour-lines.svg')",
        'grid-paper': "url('/patterns/grid-paper.svg')",
        'terra-gradient': 'linear-gradient(135deg, #faf6ed 0%, #e8dcc4 100%)',
        'field-gradient': 'linear-gradient(135deg, #2d5016 0%, #4a7c23 100%)',
        'gold-gradient': 'linear-gradient(135deg, #d4a03c 0%, #f0c866 100%)',
      },
      fontSize: {
        'xs': ['0.6875rem', { lineHeight: '1rem' }],      // 11px
        'sm': ['0.8125rem', { lineHeight: '1.25rem' }],   // 13px
        'base': ['0.9375rem', { lineHeight: '1.5rem' }],  // 15px
        'lg': ['1.125rem', { lineHeight: '1.75rem' }],    // 18px
        'xl': ['1.5rem', { lineHeight: '2rem' }],         // 24px
        '2xl': ['2rem', { lineHeight: '2.5rem' }],        // 32px
        '3xl': ['2.75rem', { lineHeight: '3rem' }],       // 44px
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "contour-draw": {
          from: { strokeDashoffset: "1000" },
          to: { strokeDashoffset: "0" },
        },
        "pulse-gold": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(212, 160, 60, 0.4)" },
          "50%": { boxShadow: "0 0 0 8px rgba(212, 160, 60, 0)" },
        },
        "shimmer-terra": {
          "0%": { backgroundPosition: "-1000px 0" },
          "100%": { backgroundPosition: "1000px 0" },
        },
        "fade-up": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.95)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "contour-draw": "contour-draw 2s ease-out forwards",
        "pulse-gold": "pulse-gold 2s ease-in-out infinite",
        "shimmer-terra": "shimmer-terra 2s linear infinite",
        "fade-up": "fade-up 0.4s ease-out",
        "scale-in": "scale-in 0.3s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
} satisfies Config;
