import type { Config } from 'tailwindcss';

/**
 * Design tokens, transcribed from DESIGN.md at the repository root: the
 * v1 Warm Notebook system plus the extensions in its "Implementation
 * decisions" section (specs/005-warm-notebook-redesign).
 *
 * DESIGN.md is the one declaration. tests/design/tokens.parity.test.ts fails
 * if a colour here differs from it, and tests/design/tokens.retired.test.ts
 * fails if a class from the previous palette is used anywhere.
 *
 * Do not add a colour here that DESIGN.md does not declare. Where a type
 * token in DESIGN.md gives a range (38–40px), the upper bound is used.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'primary': '#b4553a',
        'primary-active': '#963f28',
        'primary-glow': '#e07b5a',
        'primary-on-dark': '#e8876a',
        'primary-text': '#a24c33',
        'primary-text-active': '#7f3a26',
        'primary-tint': '#f6e5dd',
        'primary-tint-soft': '#fbeee8',
        'primary-tint-faint': '#fdf3ee',
        'primary-border-soft': '#e3b5a3',
        'on-primary': '#ffffff',
        'canvas': '#f6f3ee',
        'surface-card': '#fffdf9',
        'surface-white': '#ffffff',
        'surface-rail': '#fbf8f3',
        'surface-chip': '#f8f4ee',
        'surface-muted': '#f1ebe2',
        'surface-muted-strong': '#efe9df',
        'surface-segmented': '#ece5da',
        'surface-note': '#efe8de',
        'hairline': '#e6dfd4',
        'hairline-soft': '#efe9df',
        'border-control': '#e2d9cc',
        'border-strong': '#ddd3c5',
        'border-hover': '#c9b9a6',
        'ink': '#1d1a16',
        'body': '#5c564d',
        'muted': '#6b655b',
        'sidebar': '#171512',
        'sidebar-hover': '#231f1b',
        'sidebar-active': '#2b2622',
        'sidebar-card': '#201d19',
        'sidebar-border': '#2e2a25',
        'sidebar-text': '#cfc8bc',
        'sidebar-muted': '#9d968b',
        'sidebar-label': '#8a8378',
        'sidebar-icon-active': '#e48d6d',
        'dark-surface': '#1a1714',
        'dark-bench': '#13110e',
        'dark-panel': '#1b1814',
        'dark-raised': '#221e1a',
        'dark-line': '#2c2823',
        'dark-border': '#3a342c',
        'dark-muted-fill': '#35302a',
        'on-dark': '#f3eee6',
        'on-dark-strong': '#ffffff',
        'on-dark-body': '#cfc7bb',
        'on-dark-muted': '#a39b8f',
        'status-running-text': '#2d6e4c',
        'status-running-bg': '#e3efe7',
        'status-running-on-dark': '#7fd1a3',
        'status-running-bg-dark': '#1f2d24',
        'status-running-border-dark': '#2d4535',
        'status-done-text': '#5c564d',
        'status-done-bg': '#efe9df',
        'status-done-dot': '#4f9483',
        'deviation-text': '#9a5a14',
        'deviation-on-dark': '#f0b36a',
        'deviation-bg-dark': '#3a2a17',
        'deviation-border-dark': '#5c4424',
        'unit-on-dark': '#8fc9b8',
        'avatar-bg': '#1f3a30',
        'avatar-text': '#9fe0bf',
        'danger-text': '#a3372a',
        'danger-bg': '#f8e3de',
        'danger-on-dark': '#f19a8c',
        'danger-bg-dark': '#3a1f1a',
      },

      fontFamily: {
        // Loaded by next/font in app/layout.tsx. Naming a family Tailwind never
        // loads is how the whole interface once ended up rendering in Times.
        display: ['var(--font-display)', 'Georgia', 'serif'],
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },

      fontSize: {
        // Serif display: always weight 400 (DESIGN.md: "Don't bold the serif").
        'display-xl': ['60px', { lineHeight: '1', letterSpacing: '-0.01em', fontWeight: '400' }],
        'display-lg': ['56px', { lineHeight: '1', fontWeight: '400' }],
        'display-bench': ['54px', { lineHeight: '1', fontWeight: '400' }],
        'display-md': ['44px', { lineHeight: '1', fontWeight: '400' }],
        'display-sm': ['40px', { lineHeight: '1.05', fontWeight: '400' }],
        numeral: ['44px', { lineHeight: '1', fontWeight: '400' }],
        'numeral-sm': ['30px', { lineHeight: '1', fontWeight: '400' }],
        wordmark: ['27px', { lineHeight: '1', fontWeight: '400' }],
        // Manrope
        'title-lg': ['26px', { lineHeight: '1.25', fontWeight: '600' }],
        'title-md': ['18px', { lineHeight: '1.3', fontWeight: '600' }],
        'title-sm': ['15px', { lineHeight: '1.35', fontWeight: '600' }],
        'body-lg': ['16px', { lineHeight: '1.5' }],
        'body-md': ['15px', { lineHeight: '1.5' }],
        caption: ['13px', { lineHeight: '1.4' }],
        eyebrow: ['12px', { lineHeight: '1.3', letterSpacing: '0.12em', fontWeight: '600' }],
        transcript: ['20px', { lineHeight: '1.35' }],
        'transcript-bench': ['22px', { lineHeight: '1.35' }],
        button: ['15px', { lineHeight: '1', fontWeight: '600' }],
        nav: ['14.5px', { lineHeight: '1.3' }],
        // JetBrains Mono
        code: ['13px', { lineHeight: '1.4' }],
        readout: ['30px', { lineHeight: '1.1' }],
      },

      borderRadius: {
        xs: '6px',
        sm: '8px',
        md: '10px',
        lg: '12px',
        xl: '14px',
        card: '16px',
        panel: '18px',
        hero: '20px',
        feature: '22px',
        pill: '9999px',
      },

      spacing: {
        xxs: '4px',
        xs: '8px',
        sm: '12px',
        md: '16px',
        lg: '22px',
        xl: '28px',
        xxl: '48px',
        'page-x': '48px',
        'page-top': '36px',
        // Bottom padding under the floating voice dock, so it never covers a
        // primary action (DESIGN.md Do's and Don'ts).
        dock: '140px',
      },

      // Warm-tinted shadows, verbatim from DESIGN.md. Never neutral grey.
      boxShadow: {
        'start-voice': '0 8px 20px -10px rgba(180,85,58,0.8)',
        'tile-lift': '0 14px 28px -20px rgba(50,32,18,0.45)',
        'dark-feature': '0 30px 60px -36px rgba(30,18,8,0.7)',
        dock: '0 28px 60px -28px rgba(20,14,8,0.6)',
        segment: '0 1px 3px rgba(40,30,20,0.12)',
        // list-row-selected: the 3px clay inset marker on the left edge.
        'selected-row': 'inset 3px 0 0 #b4553a',
      },

      backgroundImage: {
        // hero-run-card.glow / bench mic: one corner, never a page wash.
        'glow-clay': 'radial-gradient(circle, rgba(224,123,90,0.28), transparent 65%)',
        // protocol-detail-card.headerFade
        'protocol-fade': 'linear-gradient(180deg, #fbf5ef, #fffdf9)',
      },

      keyframes: {
        // Voice rings (dock, bench): leave the orb and fade.
        'ring-out': {
          '0%': { transform: 'scale(0.62)', opacity: '0.55' },
          '100%': { transform: 'scale(1.3)', opacity: '0' },
        },
        // Waveform bars.
        wave: {
          '0%, 100%': { transform: 'scaleY(0.18)' },
          '50%': { transform: 'scaleY(1)' },
        },
        // Sidebar agent dot and live status dots.
        'pulse-dot': {
          '0%': { transform: 'scale(1)', opacity: '0.6' },
          '100%': { transform: 'scale(2.4)', opacity: '0' },
        },
        // New card / chip.
        rise: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'none' },
        },
        caret: {
          '0%, 49%': { opacity: '1' },
          '50%, 100%': { opacity: '0' },
        },
        // A value arriving in the record: a clay-tint wash that recedes.
        'cell-land': {
          '0%': { backgroundColor: '#fbeee8' },
          '100%': { backgroundColor: 'transparent' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(12px) scale(0.985)' },
          to: { opacity: '1', transform: 'none' },
        },
        'slide-in-left': {
          from: { transform: 'translateX(-100%)' },
          to: { transform: 'none' },
        },
        'step-in': {
          '0%': { opacity: '0.4', transform: 'translateX(-6px) scale(0.98)' },
          '60%': { opacity: '1', transform: 'translateX(2px) scale(1.005)' },
          '100%': { opacity: '1', transform: 'none' },
        },
        'check-draw': {
          from: { strokeDashoffset: '16' },
          to: { strokeDashoffset: '0' },
        },
      },
      animation: {
        'ring-out': 'ring-out 2.1s cubic-bezier(0.16, 1, 0.3, 1) infinite',
        wave: 'wave 1.15s ease-in-out infinite',
        'pulse-dot': 'pulse-dot 1.8s cubic-bezier(0.16, 1, 0.3, 1) infinite',
        rise: 'rise 350ms cubic-bezier(0.16, 1, 0.3, 1) both',
        caret: 'caret 1s steps(1) infinite',
        'cell-land': 'cell-land 1.2s ease-out forwards',
        'fade-in': 'fade-in 240ms ease-out both',
        'slide-up': 'slide-up 360ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'slide-in-left': 'slide-in-left 320ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'step-in': 'step-in 620ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'check-draw': 'check-draw 420ms 120ms cubic-bezier(0.65, 0, 0.35, 1) both',
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
