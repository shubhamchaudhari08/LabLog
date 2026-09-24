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
      },
      animation: {
        'cell-land': 'cell-land 1.2s ease-out forwards',
        'pulse-soft': 'pulse-soft 1.6s ease-in-out infinite',
        rise: 'rise 420ms cubic-bezier(0.16, 1, 0.3, 1) both',
        shimmer: 'shimmer 1.6s infinite',
      },
    },
  },
  plugins: [],
};

export default config;
