import { ArrowRight, AudioWaveform, Contrast, ShieldCheck, VenetianMask } from 'lucide-react';
import { ApiMeta, UserSession } from '../types/xpressit';

interface SplashScreenProps {
  existingSession: UserSession | null;
  meta: ApiMeta;
  onEnter: () => void;
  onReplayOnboarding: () => void;
  onToggleTheme: () => void;
}

export function SplashScreen({
  existingSession,
  meta,
  onEnter,
  onReplayOnboarding,
  onToggleTheme,
}: SplashScreenProps) {
  const isConfirmedSession = Boolean(existingSession?.user?.confirmed);

  return (
    <div className="min-h-screen bg-light-surface dark:bg-dark-surface text-light-on-surface dark:text-dark-on-surface flex flex-col justify-between p-6 relative overflow-hidden font-body transition-colors duration-200">
      {/* Ambient background glow elements */}
      <div className="absolute -top-24 -left-24 w-80 h-80 rounded-full bg-primary/20 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -right-24 w-80 h-80 rounded-full bg-accent/20 blur-3xl pointer-events-none" />

      {/* Top utility bar */}
      <header className="w-full max-w-4xl mx-auto flex items-center justify-between pt-2 z-10">
        <span className="font-label text-xs font-semibold text-light-text-muted dark:text-dark-text-muted tracking-wide">
          Zero-Knowledge Sanctuary
        </span>
        <button
          type="button"
          onClick={onToggleTheme}
          className="min-h-[44px] min-w-[44px] rounded-full bg-light-surface-card/90 dark:bg-dark-surface-card/90 border border-light-outline dark:border-dark-outline text-primary dark:text-secondary flex items-center justify-center shadow-sm hover:border-primary transition-colors cursor-pointer"
          title="Toggle Light/Dark Theme"
          aria-label="Toggle Light/Dark Theme"
        >
          <Contrast className="w-5 h-5" />
        </button>
      </header>

      {/* Center Brand Hero */}
      <main className="flex-1 flex flex-col items-center justify-center text-center z-10 my-auto px-4 py-8">
        <div className="relative mb-8">
          <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-primary to-accent blur-xl opacity-55 animate-pulse-ring" />
          <div className="relative w-28 h-28 rounded-3xl bg-gradient-to-tr from-primary to-secondary flex items-center justify-center shadow-2xl border border-secondary/30 animate-float">
            <div className="w-20 h-20 rounded-2xl bg-light-surface-card dark:bg-dark-surface-card flex items-center justify-center relative shadow-inner">
              <AudioWaveform className="w-10 h-10 text-accent" />
              <div className="absolute -bottom-1.5 -right-1.5 w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white border-2 border-light-surface-card dark:border-dark-surface-card shadow-md">
                <VenetianMask className="w-4 h-4" />
              </div>
            </div>
          </div>
        </div>

        <h1 className="font-headline text-4xl sm:text-5xl font-extrabold text-light-on-surface dark:text-dark-on-surface tracking-tight mb-3">
          XPRESS<span className="text-accent">IT</span>
        </h1>

        <p className="font-label text-xs sm:text-sm font-semibold text-primary dark:text-secondary tracking-wider uppercase mb-3">
          {meta.tagline}
        </p>

        <p className="font-body text-sm sm:text-base text-light-text-muted dark:text-dark-text-muted max-w-sm leading-relaxed text-balance">
          A judgment-free space to speak your mind freely and completely anonymously.
        </p>

        {existingSession && (
          <p className="mt-4 text-xs font-mono text-primary dark:text-secondary bg-light-primary-container dark:bg-dark-primary-container px-3.5 py-1.5 rounded-full">
            {isConfirmedSession ? 'Active session: ' : 'Pending confirmation: '}
            {existingSession.user.username}
          </p>
        )}
      </main>

      {/* Footer Actions */}
      <footer className="w-full max-w-md mx-auto flex flex-col items-center gap-4 pb-6 z-10">
        <button
          type="button"
          onClick={onEnter}
          className="w-full min-h-[52px] py-3.5 px-6 rounded-full bg-primary hover:bg-primary-light text-white font-label text-base font-bold flex items-center justify-center gap-2 shadow-lg shadow-primary/30 active:scale-[0.98] transition-all cursor-pointer"
        >
          <span>
            {isConfirmedSession
              ? 'Resume Anonymous Space'
              : existingSession
              ? 'Finish Passphrase Confirmation'
              : 'Enter Anonymous Space'}
          </span>
          <ArrowRight className="w-5 h-5" />
        </button>

        {existingSession && (
          <button
            type="button"
            onClick={onReplayOnboarding}
            className="text-xs font-label font-semibold text-light-text-muted dark:text-dark-text-muted hover:text-primary dark:hover:text-secondary transition-colors py-1 cursor-pointer"
          >
            View Introduction Tour
          </button>
        )}

        <div className="flex items-center gap-2 text-xs text-light-text-muted dark:text-dark-text-muted">
          <ShieldCheck className="w-4 h-4 text-success shrink-0" />
          <span>100% Anonymous · No Phone or Email Required</span>
        </div>
      </footer>
    </div>
  );
}
