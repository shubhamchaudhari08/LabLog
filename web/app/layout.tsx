import type { Metadata } from 'next';
import { Instrument_Serif, JetBrains_Mono, Manrope } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

/**
 * The three faces DESIGN.md names: Instrument Serif for titles, run names and
 * big numerals (weight 400 only), Manrope for everything else, and JetBrains
 * Mono for codes, units, timers and captured values.
 */
const display = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-display',
  display: 'swap',
});

const sans = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'LabLog — voice-native laboratory notebook',
  description:
    'Speak a measurement and it lands in the record, validated and audited, while the agent confirms what was actually stored.',
  openGraph: {
    title: 'LabLog',
    description: 'Voice-native laboratory notebook and experiment copilot.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
