import { AppShell } from '@/components/shell/AppShell';
import { VoiceSessionProvider } from '@/components/voice/VoiceSession';
import { StepTimerProvider } from '@/components/timer/StepTimerProvider';

/**
 * Every signed-in screen. The voice provider sits outside the shell and the
 * pages so a live session survives moving between them; step timers sit just
 * inside it, for the same reason and because the alarm announces through it
 * (specs/004-step-timers).
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <VoiceSessionProvider>
      <StepTimerProvider>
        <AppShell>{children}</AppShell>
      </StepTimerProvider>
    </VoiceSessionProvider>
  );
}
