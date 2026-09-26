import type { Config } from 'tailwindcss';

/**
 * Design tokens transcribed from DESIGN.md at the repository root.
 *
 * The system is a warm cream canvas with coral accent and dark navy product
 * surfaces — deliberately warm where most instrument software is cool grey.
 * For LabLog the dark surfaces earn their place on the voice panel and the
 * transcript, which are the "product chrome" of this application.
 *
 * Do not introduce colours outside this scale. If something needs a colour that
 * is not here, that is a design decision, not an implementation one.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // brand + accent
        primary: '#cc785c',
        'primary-active': '#a9583e',
        'primary-disabled': '#e6dfd8',
        'accent-teal': '#5db8a6',
        'accent-amber': '#e8a55a',

        // text
        ink: '#141413',
        body: '#3d3d3a',
        'body-strong': '#252523',
        muted: '#6c6a64',
        'muted-soft': '#8e8b82',
        'on-primary': '#ffffff',
        'on-dark': '#faf9f5',
        'on-dark-soft': '#a09d96',

        // surfaces
        canvas: '#faf9f5',
        'surface-soft': '#f5f0e8',
        'surface-card': '#efe9de',
        'surface-cream-strong': '#e8e0d2',
        'surface-dark': '#181715',
        'surface-dark-elevated': '#252320',
        'surface-dark-soft': '#1f1e1b',

        // hairlines — same tone family as surfaces, so borders read as one
        // elevation step rather than as ink lines
        hairline: '#e6dfd8',
        'hairline-soft': '#ebe6df',

        // semantic
        success: '#5db872',
        warning: '#d4a017',
        error: '#c64545',
      },

      fontFamily: {
        // Loaded by next/font in app/layout.tsx. Naming a family Tailwind never
        // loads is how the whole interface ended up rendering in Times.
        display: ['var(--font-display)', 'Tiempos Headline', 'Garamond', 'serif'],
        sans: ['var(--font-sans)', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },

      fontSize: {
        'display-xl': ['64px', { lineHeight: '1.05', letterSpacing: '-1.5px', fontWeight: '400' }],
        'display-lg': ['48px', { lineHeight: '1.1', letterSpacing: '-1px', fontWeight: '400' }],
        'display-md': ['36px', { lineHeight: '1.15', letterSpacing: '-0.5px', fontWeight: '400' }],
        'display-sm': ['28px', { lineHeight: '1.2', letterSpacing: '-0.3px', fontWeight: '400' }],
        'title-lg': ['22px', { lineHeight: '1.3', fontWeight: '500' }],
        'title-md': ['18px', { lineHeight: '1.4', fontWeight: '500' }],
        'title-sm': ['16px', { lineHeight: '1.4', fontWeight: '500' }],
        'body-md': ['16px', { lineHeight: '1.55', fontWeight: '400' }],
        'body-sm': ['14px', { lineHeight: '1.55', fontWeight: '400' }],
        caption: ['13px', { lineHeight: '1.4', fontWeight: '500' }],
        'caption-upper': ['12px', { lineHeight: '1.4', letterSpacing: '1.5px', fontWeight: '500' }],
        code: ['14px', { lineHeight: '1.6', fontWeight: '400' }],
      },

      // Warm, tinted shadows — black at low opacity turns cream grey and muddy.
      boxShadow: {
        panel: '0 1px 2px rgba(20,20,19,0.04), 0 10px 28px -18px rgba(20,20,19,0.18)',
        lift: '0 2px 4px rgba(20,20,19,0.05), 0 18px 40px -22px rgba(20,20,19,0.28)',
        dark: '0 2px 6px rgba(0,0,0,0.30), 0 28px 60px -28px rgba(0,0,0,0.55)',
        inset: 'inset 0 1px 0 rgba(255,255,255,0.06)',
      },

      borderRadius: {
        xs: '4px',
        sm: '6px',
        md: '8px',
        lg: '12px',
        xl: '16px',
        pill: '9999px',
      },

      spacing: {
        xxs: '4px',
        xs: '8px',
        sm: '12px',
        md: '16px',
        lg: '24px',
        xl: '32px',
        xxl: '48px',
        section: '96px',
      },

      keyframes: {
        // The hero moment: a measurement cell arriving the instant it is spoken.
        // A coral wash that recedes rather than a flash that blinks — the value
        // should feel placed, not alarmed.
        'cell-land': {
          '0%': { backgroundColor: 'rgba(204, 120, 92, 0.22)' },
          '100%': { backgroundColor: 'transparent' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.45' },
        },
        // Staggered entry: rows cascade rather than all appearing at once.
        rise: {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'none' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        // Sheets and docks arrive from the edge they belong to.
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(12px) scale(0.985)' },
          to: { opacity: '1', transform: 'none' },
        },
        'slide-in-left': {
          from: { transform: 'translateX(-100%)' },
          to: { transform: 'none' },
        },
        // A step becoming current: it settles into place rather than snapping.
        'step-in': {
          '0%': { opacity: '0.4', transform: 'translateX(-6px) scale(0.98)' },
          '60%': { opacity: '1', transform: 'translateX(2px) scale(1.005)' },
          '100%': { opacity: '1', transform: 'none' },
        },
        'check-draw': {
          from: { strokeDashoffset: '16' },
          to: { strokeDashoffset: '0' },
        },
        // The current-step beacon: a ring that leaves the node and fades.
        beacon: {
          '0%': { transform: 'scale(1)', opacity: '0.55' },
          '100%': { transform: 'scale(2.3)', opacity: '0' },
        },
        // Listening orb: slow breathing, never a blink.
        breathe: {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.35' },
          '50%': { transform: 'scale(1.18)', opacity: '0.08' },
        },
        bar: {
          '0%, 100%': { transform: 'scaleY(0.35)' },
          '50%': { transform: 'scaleY(1)' },
        },
      },
      animation: {
        'cell-land': 'cell-land 1.2s ease-out forwards',
        'pulse-soft': 'pulse-soft 1.6s ease-in-out infinite',
        rise: 'rise 420ms cubic-bezier(0.16, 1, 0.3, 1) both',
        shimmer: 'shimmer 1.6s infinite',
        'fade-in': 'fade-in 240ms ease-out both',
        'slide-up': 'slide-up 360ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'slide-in-left': 'slide-in-left 320ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'step-in': 'step-in 620ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'check-draw': 'check-draw 420ms 120ms cubic-bezier(0.65, 0, 0.35, 1) both',
        beacon: 'beacon 1.8s cubic-bezier(0.16, 1, 0.3, 1) infinite',
        breathe: 'breathe 2.4s ease-in-out infinite',
        bar: 'bar 1s ease-in-out infinite',
      },

      // One scale, so nothing reaches for 9999.
      zIndex: {
        dock: '20',
        header: '30',
        sidebar: '40',
        overlay: '50',
      },
    },
  },
  plugins: [],
};

export default config;
