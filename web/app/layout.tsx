import type { Metadata } from 'next';
import { Instrument_Serif, JetBrains_Mono, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

/**
 * DESIGN.md calls for Copernicus/Tiempos display over StyreneB/Inter body.
 * Neither is licensed here, so these are the closest open substitutes:
 * Instrument Serif keeps the editorial, slightly condensed display voice, and
 * Plus Jakarta Sans is humanist rather than the default-feeling Inter.
 */
const display = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-display',
  display: 'swap',
});

const sans = Plus_Jakarta_Sans({
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
        {/* Fixed grain: breaks the flatness of large cream fields. */}
        <div aria-hidden className="grain" />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
