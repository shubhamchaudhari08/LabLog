---
version: alpha
name: LabLog-v1-warm-notebook
description: A warm, editorial lab-notebook interface for LabLog, a voice-native lab notebook and experiment copilot. The system sits on a warm ivory ground with a near-black espresso sidebar, clay-orange calls to action, and a condensed serif display face (Instrument Serif) over a clean geometric-humanist sans (Manrope). Voice is the hero. A dark "bench" surface, used for the hero run card, the floating voice dock and the full-screen hands-free Bench mode, carries pulsing mic orbs, animated waveforms and live transcripts. The rest of the app stays calm, paper-like and readable. The feeling is a well-kept paper notebook that listens.

colors:
  primary: "#b4553a"
  primary-active: "#963f28"
  primary-glow: "#e07b5a"
  primary-on-dark: "#e8876a"
  primary-text: "#a24c33"
  primary-text-active: "#7f3a26"
  primary-tint: "#f6e5dd"
  primary-tint-soft: "#fbeee8"
  primary-tint-faint: "#fdf3ee"
  primary-border-soft: "#e3b5a3"
  on-primary: "#ffffff"
  canvas: "#f6f3ee"
  surface-card: "#fffdf9"
  surface-white: "#ffffff"
  surface-rail: "#fbf8f3"
  surface-chip: "#f8f4ee"
  surface-muted: "#f1ebe2"
  surface-muted-strong: "#efe9df"
  surface-segmented: "#ece5da"
  surface-note: "#efe8de"
  hairline: "#e6dfd4"
  hairline-soft: "#efe9df"
  border-control: "#e2d9cc"
  border-strong: "#ddd3c5"
  border-hover: "#c9b9a6"
  ink: "#1d1a16"
  body: "#5c564d"
  muted: "#6b655b"
  sidebar: "#171512"
  sidebar-hover: "#231f1b"
  sidebar-active: "#2b2622"
  sidebar-card: "#201d19"
  sidebar-border: "#2e2a25"
  sidebar-text: "#cfc8bc"
  sidebar-muted: "#9d968b"
  sidebar-label: "#8a8378"
  sidebar-icon-active: "#e48d6d"
  dark-surface: "#1a1714"
  dark-bench: "#13110e"
  dark-panel: "#1b1814"
  dark-raised: "#221e1a"
  dark-line: "#2c2823"
  dark-border: "#3a342c"
  dark-muted-fill: "#35302a"
  on-dark: "#f3eee6"
  on-dark-strong: "#ffffff"
  on-dark-body: "#cfc7bb"
  on-dark-muted: "#a39b8f"
  status-running-text: "#2d6e4c"
  status-running-bg: "#e3efe7"
  status-running-on-dark: "#7fd1a3"
  status-running-bg-dark: "#1f2d24"
  status-running-border-dark: "#2d4535"
  status-done-text: "#5c564d"
  status-done-bg: "#efe9df"
  status-done-dot: "#4f9483"
  deviation-text: "#9a5a14"
  deviation-on-dark: "#f0b36a"
  deviation-bg-dark: "#3a2a17"
  deviation-border-dark: "#5c4424"
  unit-on-dark: "#8fc9b8"
  avatar-bg: "#1f3a30"
  avatar-text: "#9fe0bf"
  danger-text: "#a3372a"
  danger-bg: "#f8e3de"
  danger-on-dark: "#f19a8c"
  danger-bg-dark: "#3a1f1a"

typography:
  display-xl:
    fontFamily: "Instrument Serif, Georgia, serif"
    fontSize: 60px
    fontWeight: 400
    lineHeight: 1
    letterSpacing: -0.01em
  display-lg:
    fontFamily: "Instrument Serif, Georgia, serif"
    fontSize: 56px
    fontWeight: 400
    lineHeight: 1
    letterSpacing: 0
  display-bench:
    fontFamily: "Instrument Serif, Georgia, serif"
    fontSize: 54px
    fontWeight: 400
    lineHeight: 1
    letterSpacing: 0
  display-md:
    fontFamily: "Instrument Serif, Georgia, serif"
    fontSize: 44px
    fontWeight: 400
    lineHeight: 1
    letterSpacing: 0
  display-sm:
    fontFamily: "Instrument Serif, Georgia, serif"
    fontSize: 38-40px
    fontWeight: 400
    lineHeight: 1.05
    letterSpacing: 0
  numeral:
    fontFamily: "Instrument Serif, Georgia, serif"
    fontSize: 44px
    fontWeight: 400
    lineHeight: 1
    letterSpacing: 0
  numeral-sm:
    fontFamily: "Instrument Serif, Georgia, serif"
    fontSize: 30px
    fontWeight: 400
    lineHeight: 1
    letterSpacing: 0
  wordmark:
    fontFamily: "Instrument Serif, Georgia, serif"
    fontSize: 27px
    fontWeight: 400
    lineHeight: 1
    letterSpacing: 0
  title-lg:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: 22-26px
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: 0
  title-md:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: 16-18px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: 0
  title-sm:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: 14-15px
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: 0
  body-lg:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0
  body-md:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: 14-15px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0
  caption:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: 12-13px
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: 0
  eyebrow:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: 11-12px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: 0.1-0.12em
    textTransform: uppercase
  transcript:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: 20px
    fontWeight: 400
    lineHeight: 1.35
    letterSpacing: 0
  transcript-bench:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: 22px
    fontWeight: 400
    lineHeight: 1.35
    letterSpacing: 0
  code:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: 12-13px
    fontWeight: 400-500
    lineHeight: 1.4
    letterSpacing: 0
  readout:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: 30px
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: 0
  button:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: 14-15px
    fontWeight: 600
    lineHeight: 1
    letterSpacing: 0
  nav-link:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: 14.5px
    fontWeight: 400
    lineHeight: 1.3
    letterSpacing: 0

rounded:
  xs: 6px
  sm: 8px
  md: 10px
  lg: 12px
  xl: 14px
  card: 16px
  panel: 18px
  hero: 20px
  feature: 22px
  pill: 9999px
  full: 50%

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 22px
  xl: 28px
  xxl: 48px
  page-x: 48px
  page-top: 36px

layout:
  desktop-frame: 1440x960
  sidebar-width: 248px
  header-height: 68px
  content-padding: 36px 48px
  right-rail-width: 340-420px
  voice-dock: 760x168 floating, bottom 28px, centered in the main area
  bench-frame: 1440x960 full-screen dark
  bench-columns: 280px | 1fr | 380px

components:
  sidebar:
    backgroundColor: "{colors.sidebar}"
    textColor: "{colors.sidebar-text}"
    width: 248px
    padding: 20px 14px 16px
  nav-item:
    backgroundColor: transparent
    textColor: "{colors.sidebar-text}"
    typography: "{typography.nav-link}"
    rounded: "{rounded.md}"
    height: 44px
    padding: 0 12px
  nav-item-active:
    backgroundColor: "{colors.sidebar-active}"
    textColor: "{colors.on-dark-strong}"
    iconColor: "{colors.sidebar-icon-active}"
  nav-badge-live:
    backgroundColor: "{colors.status-running-bg-dark}"
    textColor: "{colors.status-running-on-dark}"
    rounded: "{rounded.pill}"
    padding: 2px 7px
  agent-status-card:
    backgroundColor: "{colors.sidebar-card}"
    borderColor: "{colors.sidebar-border}"
    rounded: "{rounded.lg}"
    padding: 12px
  top-header:
    backgroundColor: "{colors.canvas}"
    borderColor: "{colors.hairline}"
    height: 68px
    padding: 0 32px
  command-bar:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.muted}"
    borderColor: "{colors.border-control}"
    rounded: "{rounded.pill}"
    width: 440px
    height: 42px
  button-start-voice:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    height: 42px
    padding: 0 18px
    shadow: "0 8px 20px -10px rgba(180,85,58,0.8)"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.lg}"
    height: 46-52px
    padding: 0 18px
  button-primary-active:
    backgroundColor: "{colors.primary-active}"
    textColor: "{colors.on-primary}"
  button-secondary:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    borderColor: "{colors.border-strong}"
    typography: "{typography.button}"
    rounded: "{rounded.lg}"
    height: 44-46px
  button-secondary-on-dark:
    backgroundColor: "{colors.dark-panel}"
    textColor: "{colors.on-dark}"
    borderColor: "{colors.dark-border}"
    rounded: "{rounded.lg}"
    height: 44px
  button-danger:
    backgroundColor: "{colors.danger-bg}"
    textColor: "{colors.danger-text}"
    typography: "{typography.button}"
    rounded: "{rounded.lg}"
    height: 44px
  avatar-tile:
    backgroundColor: "#efe9df"
    textColor: "{colors.ink}"
    borderColor: "{colors.border-control}"
    rounded: "{rounded.lg}"
    size: 42px
  hero-run-card:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.on-dark}"
    rounded: "{rounded.feature}"
    padding: 28px 32px
    glow: "radial-gradient(circle, rgba(224,123,90,0.28), transparent 65%)"
  progress-ring:
    size: 120px
    track: "#302b25"
    stroke: "{colors.primary-glow}"
    strokeWidth: 8px
  stat-tile:
    backgroundColor: "{colors.surface-card}"
    borderColor: "{colors.hairline}"
    typography: "{typography.numeral}"
    rounded: "{rounded.card}"
    padding: 18px
  stat-tile-selected:
    backgroundColor: "{colors.surface-white}"
    borderColor: "{colors.primary}"
    numeralColor: "{colors.primary-text}"
  list-panel:
    backgroundColor: "{colors.surface-card}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.card}"
  list-row:
    height: 58-62px
    borderColor: "{colors.hairline-soft}"
    padding: 0 18px
  list-row-selected:
    backgroundColor: "{colors.primary-tint-soft}"
    insetMarker: 3px "{colors.primary}"
  status-pill-running:
    backgroundColor: "{colors.status-running-bg}"
    textColor: "{colors.status-running-text}"
    rounded: "{rounded.pill}"
    padding: 4px 10px
  status-pill-completed:
    backgroundColor: "{colors.status-done-bg}"
    textColor: "{colors.status-done-text}"
    rounded: "{rounded.pill}"
    padding: 4px 10px
  status-pill-ready:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    borderColor: "{colors.border-strong}"
    rounded: "{rounded.pill}"
    padding: 4px 10px
  status-pill-draft:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.muted}"
    borderColor: "{colors.border-strong} dashed"
    rounded: "{rounded.pill}"
    padding: 4px 10px
  status-pill-paused:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.body}"
    rounded: "{rounded.pill}"
    padding: 4px 10px
  status-pill-cancelled:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.muted}"
    rounded: "{rounded.pill}"
    padding: 4px 10px
  progress-dots:
    dotSize: 12x5px
    current: "#c8623f"
    upcoming: "#e3dbcf"
    done: "{colors.status-done-dot}"
  try-saying-chip:
    backgroundColor: "{colors.surface-chip}"
    textColor: "{colors.ink}"
    borderColor: "#ebe3d8"
    rounded: "{rounded.lg}"
    padding: 10px 12px
  protocol-tile:
    backgroundColor: "{colors.surface-card}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.xl}"
    padding: 12px 14px
    iconTile: "{colors.primary-tint}"
  voice-dock:
    backgroundColor: "{colors.dark-panel}"
    textColor: "{colors.on-dark}"
    borderColor: "#332d26"
    rounded: "{rounded.feature}"
    size: 760x168px
    shadow: "0 28px 60px -28px rgba(20,14,8,0.6)"
  voice-orb:
    size: 88px
    coreSize: 62px
    coreColor: "{colors.primary}"
    ringColor: "{colors.primary}"
  intent-chip-on-dark:
    backgroundColor: "#2a2520"
    textColor: "{colors.on-dark-body}"
    borderColor: "{colors.dark-border}"
    rounded: "{rounded.sm}"
    height: 28px
  segmented-tabs:
    backgroundColor: "{colors.surface-segmented}"
    rounded: "{rounded.lg}"
    padding: 4px
  segmented-tab-active:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    rounded: 9px
    shadow: "0 1px 3px rgba(40,30,20,0.12)"
  text-input:
    backgroundColor: "{colors.surface-white}"
    textColor: "{colors.ink}"
    borderColor: "{colors.border-strong}"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    height: 44-46px
  text-input-focused:
    outline: 2px "{colors.primary-border-soft}"
  text-input-error:
    borderColor: "{colors.danger-text}"
    helperColor: "{colors.danger-text}"
  preview-drawer:
    backgroundColor: "{colors.surface-rail}"
    borderColor: "{colors.hairline}"
    width: 360px
    padding: 34px 28px
  protocol-list-item-selected:
    backgroundColor: "{colors.surface-white}"
    borderColor: "{colors.primary-border-soft}"
    rounded: "{rounded.card}"
    iconTile: "{colors.primary}"
  protocol-detail-card:
    backgroundColor: "{colors.surface-card}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.hero}"
    headerFade: "linear-gradient(180deg, #fbf5ef, #fffdf9)"
  lock-pill:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.body}"
    rounded: "{rounded.pill}"
    padding: 5px 10px
  dictation-panel:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.on-dark}"
    rounded: "{rounded.hero}"
  measurement-row:
    height: 72px
    abbreviationTile: 44px "{colors.surface-muted}"
    abbreviationTileSelected: "{colors.primary}"
  unit-chip:
    backgroundColor: "#f4efe7"
    textColor: "#3d3832"
    borderColor: "#e7dfd3"
    typography: "{typography.code}"
    rounded: "{rounded.sm}"
  unit-chip-default:
    backgroundColor: "{colors.primary-tint-soft}"
    textColor: "{colors.primary-text}"
    borderColor: "#ebc6b6"
    prefix: "★"
  parse-card-dark:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.on-dark}"
    rounded: "{rounded.panel}"
    padding: 22px
  token-value:
    backgroundColor: "#3b2820"
    textColor: "#ffd9c9"
    underline: 2px "{colors.primary-glow}"
  token-unit:
    backgroundColor: "#1f2f2b"
    textColor: "#cdeee3"
    underline: 2px "#6fb8a4"
  info-card:
    backgroundColor: "{colors.surface-card}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.panel}"
    padding: 20px
  note-card:
    backgroundColor: "{colors.surface-note}"
    rounded: "{rounded.panel}"
    padding: 20px
  account-card:
    backgroundColor: "{colors.surface-card}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.feature}"
  switch:
    width: 52px
    height: 30px
    rounded: "{rounded.pill}"
    trackOn: "{colors.primary}"
    trackOff: "#cfc5b7"
  bench-step-rail-item:
    minHeight: 56px
    rounded: "{rounded.xl}"
    currentBackground: "#241f1b"
    currentBorder: "#5a3a2d"
  bench-mic-orb:
    size: 120px
    ringArea: 250px
    backgroundColor: "{colors.primary}"
    pausedColor: "{colors.dark-border}"
  bench-transcript-box:
    backgroundColor: "{colors.dark-panel}"
    borderColor: "{colors.dark-line}"
    rounded: "{rounded.card}"
    padding: 16px 20px
  bench-confirm-card:
    backgroundColor: "{colors.dark-raised}"
    borderColor: "{colors.dark-border}"
    rounded: "{rounded.panel}"
    padding: 18px 20px
  bench-confirm-card-deviation:
    borderColor: "{colors.deviation-border-dark}"
    accent: "{colors.deviation-on-dark}"
  bench-command-button:
    backgroundColor: "{colors.dark-panel}"
    textColor: "{colors.on-dark}"
    borderColor: "{colors.dark-border}"
    rounded: "{rounded.xl}"
    height: 52px
  bench-say-only-chip:
    backgroundColor: transparent
    textColor: "{colors.on-dark-muted}"
    borderColor: "{colors.dark-border} dashed"
    rounded: "{rounded.xl}"
    height: 52px
  capture-log-card:
    backgroundColor: "{colors.dark-panel}"
    borderColor: "{colors.dark-line}"
    rounded: "{rounded.xl}"
    padding: 14px 16px
  error-strip-on-dark:
    backgroundColor: "{colors.danger-bg-dark}"
    textColor: "{colors.danger-on-dark}"
    rounded: "{rounded.lg}"
    padding: 8px 14px
  toast:
    backgroundColor: "{colors.on-dark}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: 10px 16px
---

> **Reading order.** The sections below, from *Overview* to *Known Gaps*, are the v1 Warm Notebook design as supplied. **Implementation decisions (LabLog)**, at the end, records how that design is adapted to what LabLog actually does. **Where the two disagree, the Implementation decisions govern.** Tokens marked *extension* in that section are additions the source design did not define. Planning record: `specs/005-warm-notebook-redesign/`.

## Overview

LabLog v1 is designed as **a paper notebook that listens**. The base atmosphere is a **warm ivory ground** (`{colors.canvas}` #f6f3ee) with cream cards (`{colors.surface-card}` #fffdf9). Headlines are set in **Instrument Serif**, a condensed editorial serif, over **Manrope** body text. Codes and readings use **JetBrains Mono**. The result reads like a well-designed field notebook rather than a SaaS dashboard.

The app's energy comes from the **clay + espresso pairing**. **Clay orange** (`{colors.primary}` #b4553a) marks every primary action: *Start voice*, *Resume at the bench*, *Save*, *Dictate a protocol*. The **near-black espresso** (`{colors.sidebar}` #171512) holds the sidebar. A family of **dark "bench" surfaces** (`{colors.dark-surface}` #1a1714, `{colors.dark-bench}` #13110e) is reserved for moments when the **voice agent is active**:

1. **Hero run card** on the Overview: the running experiment, progress ring and live waveform.
2. **Voice dock**: the floating panel that listens, transcribes and shows what it understood.
3. **Bench mode**: a full-screen, hands-free dark layout for working at the bench.
4. **Dictation and "Hear it parsed" panels**: dark insets inside light pages.

The rule is simple: **light and paper-like for reading and managing, dark and glowing for listening.** When the screen goes dark, the user knows the microphone matters.

**Key Characteristics:**
- Warm ivory canvas and cream cards. Never cool grey or pure white as the page floor.
- Clay orange is the single brand accent, scarce on individual controls and generous as glow on dark voice surfaces (`{colors.primary-glow}` #e07b5a).
- Condensed serif display at weight 400 for page titles, run names, step names and big numerals.
- A dark espresso sidebar anchors the frame, with a live **agent status card** that pulses green (ready) or clay (listening).
- Motion is purposeful and tied to voice: pulsing rings, bouncing waveform bars, a blinking caret, streaming transcripts and a save countdown bar.
- Rounded, soft geometry: 10–12px controls, 16px cards, 20–22px feature surfaces, pill-shaped voice controls.

## Colors

### Brand & Accent
- **Clay / Primary** (`{colors.primary}` #b4553a): Primary buttons, *Start voice* pill, mic core, selected-tile border, switch-on track and selected icon tiles. Darkened from a lighter clay so white labels pass 4.5:1.
- **Clay Active** (`{colors.primary-active}` #963f28): Hover or press on primary buttons.
- **Clay Glow** (`{colors.primary-glow}` #e07b5a): Only on dark surfaces. Waveform bars, progress-ring stroke, orb rings, the transcript caret and the hero radial glow.
- **Clay on Dark** (`{colors.primary-on-dark}` #e8876a): Text-weight clay on dark, such as eyebrows ("STEP 1 OF 6"), links and the "Bench mode · hands-free" badge.
- **Clay Text** (`{colors.primary-text}` #a24c33) / **Clay Text Active** (`{colors.primary-text-active}` #7f3a26): Links and selected numerals on light surfaces.
- **Clay Tints** (`{colors.primary-tint}` #f6e5dd, `{colors.primary-tint-soft}` #fbeee8, `{colors.primary-tint-faint}` #fdf3ee): Icon tiles, selected rows, chip hover and draft cards.
- **Clay Border Soft** (`{colors.primary-border-soft}` #e3b5a3): Selected list items and focus outlines.

### Surface: Light
- **Canvas** (`{colors.canvas}` #f6f3ee): Page floor and header.
- **Card** (`{colors.surface-card}` #fffdf9): Default card, list panel, input-adjacent surfaces.
- **White** (`{colors.surface-white}` #ffffff): Selected tile, selected protocol item and text inputs. White is a "lifted" state, not the floor.
- **Rail** (`{colors.surface-rail}` #fbf8f3): Right-hand preview drawers and "Hear it parsed" columns.
- **Chip** (`{colors.surface-chip}` #f8f4ee), **Muted** (`{colors.surface-muted}` #f1ebe2), **Muted Strong** (`{colors.surface-muted-strong}` #efe9df), **Segmented** (`{colors.surface-segmented}` #ece5da) and **Note** (`{colors.surface-note}` #efe8de): Suggestion chips, unit chips, lock pills, tab troughs and the "Adding a type" note.

### Surface: Dark (voice)
- **Sidebar** (`{colors.sidebar}` #171512), with hover `#231f1b`, active `#2b2622`, and card `#201d19` / border `#2e2a25`.
- **Dark Surface** (`{colors.dark-surface}` #1a1714): Hero run card, dictation panel and parse card.
- **Bench** (`{colors.dark-bench}` #13110e): Full-screen Bench mode floor.
- **Dark Panel** (`{colors.dark-panel}` #1b1814) and **Dark Raised** (`{colors.dark-raised}` #221e1a): Voice dock, transcript box, command buttons, log cards and the confirm card.
- **Dark Line** (`{colors.dark-line}` #2c2823) and **Dark Border** (`{colors.dark-border}` #3a342c): Dividers and outlines on dark surfaces.

### Text
- **Ink** (`{colors.ink}` #1d1a16): Headlines and primary text on light.
- **Body** (`{colors.body}` #5c564d): Descriptions and secondary labels.
- **Muted** (`{colors.muted}` #6b655b): Captions, metadata and placeholders. Passes 4.5:1 on canvas.
- **On Dark** (`{colors.on-dark}` #f3eee6), **On Dark Body** (`{colors.on-dark-body}` #cfc7bb), **On Dark Muted** (`{colors.on-dark-muted}` #a39b8f): Text tiers on dark surfaces.
- **Sidebar Text** (`{colors.sidebar-text}` #cfc8bc), **Sidebar Muted** (`{colors.sidebar-muted}` #9d968b), **Sidebar Label** (`{colors.sidebar-label}` #8a8378).

### Status
- **Running**: `{colors.status-running-text}` #2d6e4c on `{colors.status-running-bg}` #e3efe7 (light), and `{colors.status-running-on-dark}` #7fd1a3 on #1f2d24 (dark). Also used for "Understood" on the voice dock and the "Saved" confirmation.
- **Completed**: `{colors.status-done-text}` #5c564d on #efe9df. Completed progress dots use teal `{colors.status-done-dot}` #4f9483.
- **Deviation**: `{colors.deviation-text}` #9a5a14 on light, `{colors.deviation-on-dark}` #f0b36a on #3a2a17 on dark.
- **Unit (dark)**: `{colors.unit-on-dark}` #8fc9b8, the unit field label in the parse card.

## Typography

### Font Family
- **Instrument Serif** (Google Fonts, 400): Page titles, run names, step names, the wordmark and **big numerals** (stat tiles, progress ring, protocol stats). The condensed serif gives the app its notebook character.
- **Manrope** (Google Fonts, 400–700): Body, navigation, buttons, labels, transcripts and eyebrows.
- **JetBrains Mono** (Google Fonts, 400–500): Run codes (STAB-105), protocol codes, units in chips, timers and captured values in Bench mode.

Fallbacks: `Georgia, serif` for display, `system-ui, sans-serif` for body and `ui-monospace, monospace` for mono.

### Hierarchy

| Token | Face | Size | Weight | Use |
|---|---|---|---|---|
| `{typography.display-xl}` | Serif | 60px | 400 | Overview greeting ("Good morning, Demo.") |
| `{typography.display-lg}` | Serif | 56px | 400 | Page titles (Experiments, Protocols, Measurement types, Account) |
| `{typography.display-bench}` | Serif | 54px | 400 | Current step name in Bench mode |
| `{typography.display-md}` | Serif | 44px | 400 | Hero run name ("Test02"), stat-tile numerals |
| `{typography.display-sm}` | Serif | 38–40px | 400 | Drawer run name, protocol detail title |
| `{typography.numeral-sm}` | Serif | 30px | 400 | Protocol stats (Steps · Runs · Readings) |
| `{typography.wordmark}` | Serif | 27px | 400 | "LabLog" in the sidebar |
| `{typography.title-lg}` | Sans | 22–26px | 600 | Section headings ("Recent runs"), account name |
| `{typography.title-md}` | Sans | 16–18px | 600 | Card and type names |
| `{typography.title-sm}` | Sans | 14–15px | 600 | Row titles, card headers |
| `{typography.body-lg}` | Sans | 16px | 400 | Page intros |
| `{typography.body-md}` | Sans | 14–15px | 400 | Default text |
| `{typography.caption}` | Sans | 12–13px | 400 | Metadata, hints |
| `{typography.eyebrow}` | Sans caps | 11–12px | 600 | "SETTINGS", "WORKSPACE", "LIVE TRANSCRIPT", "STEP 1 OF 6" |
| `{typography.transcript}` | Sans | 20px | 400 | Voice-dock transcript |
| `{typography.transcript-bench}` | Sans | 22px | 400 | Bench live transcript |
| `{typography.readout}` | Mono | 30px | 400 | Heard value in the confirm card |
| `{typography.code}` | Mono | 12–13px | 400–500 | Codes, units, timers |

### Principles
- Serif display is always weight 400. The condensed face provides the emphasis, and bolding it breaks the notebook feel.
- Big numbers are serif (44px), not sans. On the Overview, the counts read like handwritten tallies.
- Mono is reserved for machine-like identifiers: codes, units and captured values.
- Eyebrows sit above titles in small caps-tracked sans, echoing notebook section headers.

## Layout

### Spacing System
- **Base unit:** 4px.
- **Tokens:** `{spacing.xxs}` 4 · `{spacing.xs}` 8 · `{spacing.sm}` 12 · `{spacing.md}` 16 · `{spacing.lg}` 22 · `{spacing.xl}` 28 · `{spacing.xxl}` 48.
- **Page padding:** 36px top, 48px sides, with 140px bottom padding on pages that host the floating voice dock.
- **Section gap:** 22–28px between major blocks.

### Desktop Frame (1440 × 960)
```
┌────────────┬───────────────────────────────────────────────┐
│            │ Header 68px — breadcrumb · command bar · Start │
│  Sidebar   │                          voice · avatar         │
│  248px     ├───────────────────────────────────────────────┤
│  espresso  │ Content (scrolls) — padding 36 / 48            │
│            │                                   ┌──────────┐ │
│  nav       │                                   │ right    │ │
│  groups    │                                   │ rail     │ │
│            │     ┌───────────────────────┐     │ 340–420  │ │
│  agent     │     │ Voice dock 760×168    │     └──────────┘ │
│  status    │     │ (floats, bottom 28px) │                  │
│  user      └─────┴───────────────────────┴──────────────────┘
```

### Bench Frame (1440 × 960, full-screen dark)
```
┌──────────────────────────────────────────────────────────────┐
│ LabLog · BENCH MODE · STAB-105 Test02 …   Session · Captured · Exit │ 76px
├───────────┬──────────────────────────────────┬───────────────┤
│ Step rail │ STEP 1 OF 6 / step name (serif)   │ Captured this │
│ 280px     │ ◎ mic orb 120px in 250px rings    │ session 380px │
│ 6 steps   │ status + waveform                 │ log cards     │
│           │ Live transcript box               │               │
│           │ Confirm card  OR  Say-or-tap grid │ Finish run    │
└───────────┴──────────────────────────────────┴───────────────┘
```

### Grids
- **Overview:** header row → hero run card (grid `120px | 1fr | 300px`) → 6-up stat tiles → two columns (`1fr | 340px`: Recent runs | Try saying + Protocol library).
- **Experiments:** `1fr | 360px` (table | preview drawer).
- **Protocols:** `330px | 1fr` (list | detail or dictation panel). The detail splits into `1fr | 260px` (steps | used-by).
- **Measurements:** `1fr | 420px` (types list | Hear-it-parsed + info cards).
- **Account:** single centred column, 920px wide, one card with 260px label column + content.

## Elevation & Depth

| Level | Treatment | Use |
|---|---|---|
| Floor | `{colors.canvas}` | Page background |
| Card | `{colors.surface-card}` + 1px `{colors.hairline}` | Panels, lists, tiles |
| Lifted | `translateY(-2px)` + `0 14px 28px -20px rgba(50,32,18,.45)` on hover | Stat tiles, protocol tiles, "New experiment" |
| Selected | White fill + clay border, or clay tint + 3px inset marker | Selected tile, row or list item |
| Dark feature | `{colors.dark-surface}` + `0 30px 60px -36px rgba(30,18,8,.7)` | Hero card, dictation panel |
| Floating | Voice dock shadow `0 28px 60px -28px rgba(20,14,8,.6)` | Voice dock |
| Glow | Clay radial gradient, 28% at the centre | Hero card corner, bench mic |

Depth comes mostly from **light vs dark surface contrast** and soft warm shadows. Shadows are always warm-tinted (brown), never neutral grey.

## Shapes

| Token | Value | Use |
|---|---|---|
| `{rounded.xs}` | 6px | Keyboard hint, small tags |
| `{rounded.sm}` | 8px | Unit chips, intent chips |
| `{rounded.md}` | 10px | Nav items, icon tiles, avatar |
| `{rounded.lg}` | 12px | Buttons, inputs, segmented troughs, chips |
| `{rounded.xl}` | 14px | Protocol tiles, bench command buttons, log cards |
| `{rounded.card}` | 16px | Stat tiles, list panels, protocol list items |
| `{rounded.panel}` | 18px | Confirm card, info cards, parse card |
| `{rounded.hero}` | 20px | Protocol detail card, dictation panel |
| `{rounded.feature}` | 22px | Hero run card, voice dock, account card |
| `{rounded.pill}` | 9999px | Command bar, Start voice, status pills, switch |
| `{rounded.full}` | 50% | Mic orbs, live dots |

Icons are inline stroke SVGs (1.7–1.8px, round caps), 16–18px. The logo is a flask glyph in a 38px dark tile with a clay stroke. No emoji.

## Components

### Navigation
**`sidebar`**: espresso, 248px. From top to bottom: logo tile + serif wordmark + "Voice notebook"; three nav groups with caps labels (*Workspace*: Overview, Experiments, Protocols · *Quality*: Reliability · *Settings*: Measurements, Account); the **agent status card**; then the user row with a sign-out icon button.

**`nav-item`** / **`nav-item-active`**: 40px rows with a clay icon when active on `{colors.sidebar-active}`. Experiments carries a green **"2 live"** badge.

**`agent-status-card`**: a pulsing dot + title + subtitle. Idle: green dot, "Voice agent ready · Mic idle". Listening: clay dot, "Listening · Streaming to STAB-105".

**`top-header`**: 68px, with the breadcrumb on the left and, on the right, the **command bar**, **Start voice** and the **avatar tile**.

### Voice Entry Points
**`command-bar`**: a 440px pill in the header ("Say a command — 'log pH 7.4 for sample B'") with a mic icon and a `Space` key hint. Clicking it opens the voice dock.

**`button-start-voice`**: a clay pill with a mic icon and a soft clay drop shadow. Its label flips to "Listening…" while the dock is open.

**`voice-dock`**: a 760 × 168 dark floating panel, centred at the bottom of the content area.
- **Orb** (88px): a clay core with two expanding clay rings. The core turns grey when paused.
- **Status line**: LISTENING (clay) → UNDERSTOOD (green) → PAUSED (grey), plus run context in mono and an 18-bar waveform.
- **Transcript**: 20px, streamed character by character, with a clay block caret.
- **Intent chips** (appear after understanding): `Intent · Log reading`, `Temperature · 37.2 °C`, `Sample · A`, `Run · STAB-105`.
- **Controls**: Pause/Resume and Close (44px icon buttons with aria-labels).

**`try-saying-chip`**: example phrases on the Overview that open the dock pre-loaded with that phrase.

### Overview
**`hero-run-card`**: the running experiment on a dark surface with a clay corner glow. It contains:
- a **progress ring** (120px, "1 of 6 steps");
- a Running pill, code and protocol, the serif run name and the current step;
- a 6-segment step bar;
- on the right, an animated waveform, the **Resume at the bench** primary button and the hint "or just say 'resume STAB-105'".

**`stat-tile`** / **`stat-tile-selected`**: 6-up tiles with a caption, serif numeral and sub-label. The first four act as filters for Recent runs (This week, Running, Completed, With deviations); the selected tile lifts to white with a clay border and clay numeral. Measurements links to its page, and Voice-recorded is informational.

**`list-row`** (Recent runs): code (mono) · name + protocol · **progress dots** · date · status pill · an arrow that slides right on hover.

**`protocol-tile`**: a clay-tint icon tile + name + mono meta.

### Experiments
**`segmented-tabs`**: All / Running / Completed with counts. The active tab is a raised cream pill.

Protocol **select**, **search input** and a sortable **Date** header (▲/▼).

**`list-row-selected`**: clay tint + 3px clay inset on the left edge.

**`preview-drawer`**: code + status pill, the serif run name, a progress bar, a definition list (Protocol, Started, Deviations), and then one action: **Resume at the bench** (running) or **Open record** (completed). Below that, a dashed "Ask about this run by voice" button.

### Protocols
**`protocol-list-item`**: when selected it is white with a soft clay border, a clay icon tile and a small shadow. A dictated draft appears as a dashed clay card.

**`protocol-detail-card`**: a header with a warm fade, the mono code, a **lock pill** ("In use by a run — locked"), the serif title and serif stats. The body splits into Steps (numbered circles) and **Used by** (run links with status pills).

**`dictation-panel`**: dark. The header has an orb, the "Listening · dictating steps" status, a waveform, and Pause / Save draft / Discard. The body splits into **You said** (streaming text) and **LabLog wrote** (numbered steps rising in, each tagged with the reading it expects, e.g. "expects Mass · 5.84 g").

### Measurements
**`measurement-row`**: a 44px abbreviation tile (clay when selected), the type name, a "no unit needed" pill where relevant, a mic-icon line ("listens for Celsius, Fahrenheit"), usage (green when used), and **unit chips** (the default is starred and tinted clay).

**`parse-card-dark`** ("Hear it parsed"): example phrases are selectable. The chosen phrase renders as **tokens**: the value is highlighted clay (`{component.token-value}`) and the unit teal (`{component.token-unit}`). Below it is a Type / Value / Unit readout grid and a note (e.g. "No scale heard — used the starred unit, °C.").

**`info-card`** ("How the agent uses this") and **`note-card`** ("Adding a type", with a code path).

### Account
**`account-card`**: a header (dark 76px avatar tile with clay serif initials, name, email, Sign out), then three label | content sections:
- **Profile:** display name input + Save. Save is disabled until the name changes, then shows a green "Saved".
- **Sign-in:** email and member since.
- **Preferences:** "Reduce motion" with a live waveform preview that freezes when the **switch** is on.

### Bench Mode
**`bench-step-rail-item`**: 56px buttons with a numbered circle. Done steps show a ✓ on green, the current step is clay, and upcoming steps are outlined. Tapping a step jumps to it.

**`bench-mic-orb`**: a 120px clay button inside three expanding clay rings and a soft radial glow. When paused it turns grey and the rings fade.

**`bench-transcript-box`**: the "LIVE TRANSCRIPT" eyebrow + 22px streamed text.

**`bench-confirm-card`**: appears once a phrase is understood. It shows a kicker ("Heard a reading" / "Deviation flagged" / "Step change"), a note (e.g. "No unit heard — used the starred unit, °C"), the label, the value in 30px mono, and **Undo** / **Save now**. A **countdown bar** reads "Saving in 3s — say 'undo' to discard". The deviation variant switches to amber.

**`bench-command-button`**: a 4-up grid of 52px buttons, "next step", "undo that", "repeat", "flag deviation", each shown in quotes to signal that it can be spoken.

**`capture-log-card`**: newest first, rising in. A tag (Reading clay / Deviation amber / Step green) + timestamp, then label + mono value + meta, then the quoted words that produced it.

**`toast`**: an ivory pill near the bottom of the centre column ("Discarded — nothing was saved").

## Motion

| Moment | Animation | Timing |
|---|---|---|
| Voice rings (dock, bench, dictation) | Scale 0.62–1 → 1.25–1.35, fade out | 1.8–2.4s loop, staggered |
| Waveform bars | scaleY 0.18 → 1 | 1–1.3s ease-in-out, staggered 50–70ms |
| Sidebar agent dot | Pulse ring scale 1 → 2.4 | 1.8s loop |
| Transcript | Streams character by character + blinking caret | ~45ms/char, 1s blink |
| New card / chip | Rise 6–10px + fade | 0.3–0.4s |
| Tile / tile hover | Lift 2px + warm shadow | 0.18s |
| Row arrow | Opacity 0.35 → 1, slide 3px | 0.15s |
| Auto-save countdown | Width 0 → 100% | 3s linear |

**Reduce motion** (Account › Preferences) pauses the rings, waveforms and pulses. Every state is also expressed in text and colour.

## Accessibility

- White on clay `#b4553a` ≈ 4.7:1. Muted `#6b655b` on canvas ≥ 4.5:1. Clay text `#a24c33` is used for links on light surfaces.
- Real `<button>`, `<a href>`, `<input>` + `<label>`. Icon-only buttons carry `aria-label`, toggles use `role="switch"`, and tabs use `role="tab"`.
- Transcripts and results use `aria-live="polite"`. `aria-pressed` and `aria-current` mark selected tiles, rows and steps.
- Touch targets ≥ 44px. Bench buttons are 52px and the bench mic is 120px.

## Do's and Don'ts

### Do
- Keep light pages warm: ivory canvas, cream cards, warm shadows.
- Switch to dark surfaces only when the voice agent is active or central.
- Use Instrument Serif for titles, run names, step names and big numbers.
- Put clay on the one primary action per view and use clay glow only on dark.
- Show the spoken form next to tappable commands ("or just say 'resume STAB-105'").
- Give every heard value a visible undo window before it is saved.

### Don't
- Don't use pure white as the page floor or cool greys anywhere.
- Don't bold the serif. Don't set body text in the serif.
- Don't use clay for status. Status is green (running), neutral (completed) or amber (deviation).
- Don't use gradient washes across whole pages. Glow is limited to one corner of dark feature cards and the bench mic.
- Don't place the voice dock over primary actions. Pages hosting it keep 140px bottom padding.
- Don't use emoji or filled illustration icons.

## Responsive Behavior

| Name | Width | Key Changes |
|---|---|---|
| Mobile | < 768px | Sidebar becomes a bottom tab bar; header command bar collapses to a mic icon; voice dock becomes a full-width bottom sheet; stat tiles 2-up; drawers become full-screen sheets |
| Tablet | 768–1199px | Sidebar collapses to an icon rail; stat tiles 3-up; the right rail stacks under content; Bench mode drops the step rail into a top stepper |
| Desktop | 1200–1599px | Full layout as designed |
| Wide | ≥ 1600px | Content caps at ~1280px; extra space goes to rails |

## Iteration Guide

1. Change one component at a time and refer to it by key (`{component.voice-dock}`, `{component.hero-run-card}`).
2. Variants (`-selected`, `-active`, `-deviation`) live as separate component entries.
3. Use token refs, never inline hex.
4. Headings, run names and big numerals are serif. Everything else is Manrope, and codes are mono.
5. Light = manage, dark = listen. If a new surface involves the microphone, it goes dark.
6. Every new voice command needs a spoken phrase, a tappable equivalent, and an "Understood" chip set.
7. Source of truth: the "v1 · Warm notebook" page of the LabLog design canvas (Main, Bench, Experiments, Protocols, Measurements, Account, VoiceDock).

## Known Gaps

*As supplied with the design. For the current status of each gap, see **Implementation decisions → Status of the known gaps** below.*

- **Scripted voice:** the voice dock, Bench mode and dictation run on a scripted demo, and their readings (37.2 °C, etc.) are sample data. Real streaming latency, partial-transcript corrections and low-confidence states still need treatments.
- **Placeholder step names:** step names not visible in the source app appear as `[Step n name]`, and protocol reading counts as `[n]`.
- **Measurements list:** only 7 of the 11 known measurement types were visible, so the list shows those 7.
- **Keyboard hint:** the `Space` hint on the command bar is visual only. No global keyboard shortcut is wired.
- **Not designed:** Reliability page, run record / review screen, dark theme for light pages, error and empty states for mic permission, and mobile layouts.

---

## Implementation decisions (LabLog)

The v1 design was drawn against a scripted demo. LabLog is a real, audited notebook, governed by `.specify/memory/constitution.md`: the model is never trusted, the record is append-only, and claims need evidence. The decisions below adapt the design to that. **They take precedence over the sections above.** Each one cites its planning record in `specs/005-warm-notebook-redesign/research.md` (R-numbers).

### D-1 Tokens are declared here, once
- The front matter of this file is the single declaration of colour, radius, spacing and type. `web/tailwind.config.ts` transcribes it, and a test fails if the two differ or if a retired token is used (R-502).
- Where a type token gives a range (for example `38-40px`), the implementation uses the upper bound.
- **Extensions** (not in the source design): `danger-text` #a3372a, `danger-bg` #f8e3de, `danger-on-dark` #f19a8c, `danger-bg-dark` #3a1f1a. These give errors a colour of their own: clay means action and amber means deviation, so neither may signal an error.
- **Component extensions**: `button-danger`, `text-input-error`, `error-strip-on-dark`, `status-pill-ready | draft | paused | cancelled` and `bench-say-only-chip` (R-504, R-505).
- Disabled primary buttons use `surface-muted-strong` fill with `muted` text, as drawn for Account › Save.

### D-2 Measured contrast replaces asserted contrast
White on clay measures **4.88:1** (the text above says ≈ 4.7). Every text/background pair in use is measured by a unit test and must be ≥ 4.5:1. All 29 current pairs pass, and the lowest is `muted` on `surface-muted` at 4.87 (`contracts/ui-components.md` §5; R-523). `primary-glow` is never used for text.

### D-3 Status pills for every run state
The design draws Running and Completed only. The other states are neutral, so clay stays off status and green keeps meaning "live":
- Ready: outlined
- Draft: dashed
- Paused: muted fill with a two-bar glyph
- Cancelled: muted fill

(R-505.)

### D-4 Nothing is shown as saved before it is saved, and nothing saved is undone
This replaces the `bench-confirm-card` Undo / Save now / 3 s countdown, the "Auto-save countdown" motion, the "Give every heard value a visible undo window" Do, and the "Discarded — nothing was saved" `toast`.
- The confirm card and the dock's UNDERSTOOD chips appear **after** the record system accepts a value, and show the **stored** values. The kicker reads **Saved · Reading** (green), or amber for a deviation.
- A wrong value is corrected by voice ("correct that to 37.4"). That supersedes the old value, and the correction appears as its own card.
- The `toast` component remains available for other confirmations, such as "Protocol deleted".

**Why**: a stored reading can't be deleted, because the record is append-only. A confirmation built from what was *heard* rather than what was *stored* can disagree with the record. And "nothing was saved" must never be said about a write that happened (R-506).

### D-5 Say or tap: only where tapping is real
- **"next step"** and **"flag deviation"** are buttons. They call the same record system the voice agent uses. Flag deviation asks for a one-line description first. Next step asks for confirmation if a step timer is still running.
- **"correct that to …"** (which replaces "undo that") and **"repeat"** are **say-only** chips (`bench-say-only-chip`). They have a dashed outline, are not focusable, and are announced as "Say: …".
- **Iteration Guide rule 6** is amended to: *a spoken phrase, a tappable equivalent* **where one can act without the agent**, *and an "Understood" chip set.*

(R-507.)

### D-6 The capture log is the record, not the conversation
- "Captured this session" lists the experiment's stored audit events from the live voice session, newest first. Values come from the stored event.
- The quoted words come from the user's last finished sentence before the agent acted. They are shown when known, and omitted otherwise.
- A refused request never produces a card.
- Times are session-elapsed (`00:05:52`).

(R-508.)

### D-7 One voice dock, honest states
- The dock is the only voice surface on light pages. It replaces the old desk bar and the in-page workspace dock, and it keeps the transcript history behind a transcript button.
- Status labels: CONNECTING, LISTENING, WORKING (the agent is thinking), REPLYING (the agent is speaking), UNDERSTOOD (2.5 s after a stored result), PAUSED (muted), and RECONNECTING · nothing is being recorded. Errors appear in `error-strip-on-dark`.
- Intent chips exist only for actions that changed the record. Questions ("what's next?") get an answer in the transcript, not chips.
- The per-tool chip table is in `contracts/ui-voice-surfaces.md` §2 (R-509, R-510).

### D-8 Motion shows hearing, never pretends
- Rings and waveforms move only while the agent is listening or replying, and never when paused, idle, errored or with reduce motion on.
- The waveform is decorative. It is not an audio-level meter.
- The transcript shows the real partial text as it arrives, with the blinking caret. It is not re-typed character by character.
- The Overview hero's waveform is still unless a session is live.

(R-511.)

### D-9 The command bar opens voice; there is no `Space` hint
The command bar is a button that starts voice. Its example phrase fits the page:
- a workspace: "log pH 7.4 for sample B"
- Experiments: "start a new run of PCR-01"
- elsewhere: "resume STAB-105"

The `Space` key hint is removed until a real shortcut exists (R-512).

### D-10 "Try saying" fits what the agent can do there
With no experiment open, the agent can list protocols and create, start or resume runs. So Overview offers those phrases, such as "Start a new run of PCR-01", "Resume STAB-105" and "What protocols can I run?". Recording phrases ("Log temperature 37.2 °C for sample A") appear only in Bench mode. Tapping a chip starts voice and shows "Say: …". It does not simulate a parse (R-513).

### D-11 "Hear it parsed" is labelled Example
The Measurements parse card is a worked example built from each type's real units and starred default. It carries an **Example** label, because the agent's model, not a fixed parser, interprets speech. It shows every known type (not only 7) (R-514, R-519).

### D-12 Bench mode is its own screen; the workspace stays
- **Bench mode** is a full-screen route (`/dashboard/experiments/{id}/bench`). It is reached from **Resume at the bench** (Overview hero, Experiments drawer) and from **Open bench mode** on the workspace.
- **Exit bench** returns to the light **workspace**: the samples board, readings ledger, timeline and protocol rail, which the PDF does not draw. The voice session and any step timer carry on across the switch.
- A finished run's bench link opens its read-only record.

(R-515, R-516.)

### D-13 Bench details the PDF leaves open
- **Step rail items** are a list, not buttons. Steps only move forward through "next step"; jumping to an arbitrary step is not something the record allows.
- **Step timers** (feature 004) show under the step name and in the bench header.
- **Finish run** prompts "Say 'finish the run'". Finishing needs the agent's completeness check and a spoken confirmation. Once the run is finished, the button becomes **Open record**.
- **READY runs** show **Start experiment** in place of the orb.

(ui-voice-surfaces §6.)

### D-14 Experiments keeps its date filters
- The date range filter (From / To) sits in a **Dates** popover next to the protocol select.
- Status tabs appear for every status that has runs, not only All / Running / Completed.
- Clicking a row selects it and fills the drawer. Enter or double-click opens it.
- The drawer's action is **Resume at the bench** (running), **Open workspace** (ready, draft, paused) or **Open record** (finished).

(R-517.)

### D-15 Protocols: no library dictation yet
- The **Dictate a protocol** button and the dark **dictation panel** are not built. Protocols can be dictated today only during a run. A dictation session from the library would need new agent capabilities. This is known gap K-1.
- The page's one primary action is **New protocol**.
- The creator's **Edit** and **Delete** sit in the detail card header, and are hidden once a run uses the protocol ("In use by a run — locked").

(R-518.)

### D-16 Screens the design did not draw
- **Reliability, the run record, New experiment, New protocol, login and not-found** keep their layouts and adopt these tokens and components. The run record carries a **Read-only record** lock pill and no voice surface.
- **Reliability charts**: `status-done-dot` (teal) for passes and task completion, `deviation-text` (amber) for failures and the false-record rate. Clay is kept off pass/fail, which is status. Measured on `canvas`: 3.22:1 and 4.93:1; simulated colour-blind separation ΔE76 44.7 (protan) and 48.8 (deutan). The previous coral series measured 2.96:1, under the 3:1 needed for chart marks.
- **Microphone blocked**: shown in the dock's `error-strip-on-dark`, with how to allow it.

(R-520.)

### D-17 Responsive: tablet as designed, mobile simplified
- **Tablet (768–1199 px)** follows the design: icon rail, 3-up tiles, stacked rails and a top stepper on the bench.
- **Mobile (under 768 px)** keeps the existing slide-in navigation drawer instead of a bottom tab bar. The dock becomes a full-width bottom sheet and drawers become full-screen sheets. LabLog targets desktop Chromium, so the bottom tab bar is deferred (K-2).

(R-521.)

### D-18 Removed from the previous design
The paper **grain** overlay and the coral/teal **bloom** header washes are removed ("no gradient washes"). The previous Claude-derived `DESIGN.md` is superseded in full; it remains in git history.

### D-19 Settled while building (specs/005 implementation)
- **Nav items are 44px, not 40px**, so they meet this document's own ≥ 44px touch-target rule.
- **Recent runs** is captioned "Most recent" with no tile selected (it lists the latest runs of any date, not only this week), and the tile's name when one is.
- **The bench confirm card** follows spoken results. A tapped "next step" or "flag deviation" shows up in the capture log and the step rail instead.
- **Opening a finished run's bench link** shows its record. A run finished *from* the bench stays on the bench, with **Open record** in the log's footer.
- **"Ask about this run by voice"** (Experiments drawer) opens the run's workspace and starts voice once the microphone is pointed at that run.
- **Type names**: a plain lower-case name is capitalised ("Temperature"), a short one reads as an acronym ("RPM"), and one with its own casing is left alone ("pH").
- **The command bar** shows from 1280px; narrower headers keep the Start voice button, timer chip and avatar, which do the same job.
- **Try-saying chips** are disabled while a session is live, since the phrase would go to a session that is already running.
- **The login illustration's waveform is still** (D-8): nothing there is listening.

### D-20 "Ready" means the microphone works
The agent status card is green only when voice can actually start: microphone permission granted and a microphone present.
- **Otherwise it is red**, with the one thing to fix: *Microphone access needed · Tap to allow*, *Microphone blocked · Allow it in the address bar*, *No microphone found*, or *Microphone unavailable* (switched off in the OS, or in use). Where a tap can fix it, the card is the button that asks.
- **Every way of starting voice checks first.** When the microphone cannot be used, the dock or the bench says what to fix and offers **Try again**, instead of opening a session that cannot hear. The header's Start voice button reads **Enable mic** until then.
- **It turns green by itself** as soon as the browser reports the fix (site unblocked, microphone plugged in). No reload is needed.

(contracts/ui-voice-surfaces.md §7 changelog, 2026-09-28.)

### Status of the known gaps

| Gap (as supplied) | Status |
|---|---|
| Scripted voice | **Resolved.** Every surface shows stored data (D-4, D-6, D-7). Low-confidence states come through as the agent's clarifying question in the transcript. |
| Placeholder step names | **Resolved.** Real step names and reading counts are used. |
| Measurements list (7 of 11) | **Resolved.** All types from the vocabulary are listed (D-11). |
| Keyboard hint | **Open, as K-3.** The hint is removed until a shortcut is designed (D-9). |
| Not designed: Reliability, run record | **Re-skinned** (D-16). A layout redesign is still open. |
| Not designed: mic permission error and empty states | **Resolved** (D-16). Empty states use `info-card` with one action. |
| Not designed: dark theme for light pages | **Open.** Not planned. |
| Not designed: mobile layouts | **Partly resolved**. See D-17. The bottom tab bar is **K-2**. |
| — | **K-1** Library-level protocol dictation (D-15). |
| — | **K-4** Audio-level-driven waveform (D-8). |
