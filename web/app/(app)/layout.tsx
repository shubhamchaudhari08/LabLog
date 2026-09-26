import { AppShell } from '@/components/shell/AppShell';
import { VoiceSessionProvider } from '@/components/voice/VoiceSession';

/**
 * Every signed-in screen. The voice provider sits outside the shell and the
 * pages so a live session survives moving between them.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <VoiceSessionProvider>
      <AppShell>{children}</AppShell>
    </VoiceSessionProvider>
  );
}
