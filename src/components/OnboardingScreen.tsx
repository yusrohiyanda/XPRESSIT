import { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Contrast,
  EyeOff,
  FileEdit,
  Heart,
  Mic,
} from 'lucide-react';

interface OnboardingScreenProps {
  onSkip: () => void;
  onComplete: () => void;
  onToggleTheme: () => void;
}

const STEPS = [
  {
    id: 1,
    kicker: 'Express Yourself',
    title: 'Your Story Deserves to Be Heard.',
    description:
      'Share raw secrets, personal reflections, and heartfelt experiences freely without ever revealing your real name or personal identity.',
    badge: '100% Anonymous',
    badgeClass: 'bg-accent text-dark-on-primary',
    frameClass: 'from-primary/20 to-secondary/30 border-secondary/40',
  },
  {
    id: 2,
    kicker: 'Share Your Way',
    title: 'Write It or Say It.',
    description:
      'Express your thoughts in deep long-form confessions or record short heartfelt voice notes with dynamic audio waveforms.',
    badge: 'Text or Voice',
    badgeClass: 'bg-primary text-white',
    frameClass: 'from-secondary/20 to-accent/30 border-accent/40',
  },
  {
    id: 3,
    kicker: 'No Judgement Zone',
    title: 'Speak Freely. Stay Anonymous.',
    description:
      'Discover thousands of authentic perspectives, connect over shared struggles, and support other anonymous souls safely.',
    badge: 'Safe Haven',
    badgeClass: 'bg-success text-white',
    frameClass: 'from-primary/30 to-accent/20 border-primary/40',
  },
];

export function OnboardingScreen({
  onSkip,
  onComplete,
  onToggleTheme,
}: OnboardingScreenProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const step = STEPS[currentStep];
  const isLast = currentStep === STEPS.length - 1;

  const handleNext = () => {
    if (!isLast) {
      setCurrentStep((s) => s + 1);
    } else {
      onComplete();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep((s) => s - 1);
    }
  };

  return (
    <div className="min-h-screen bg-light-surface dark:bg-dark-surface text-light-on-surface dark:text-dark-on-surface flex flex-col justify-between p-6 relative overflow-hidden font-body transition-colors duration-200">
      <div className="absolute -top-20 right-0 w-72 h-72 rounded-full bg-primary/15 blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 -left-20 w-72 h-72 rounded-full bg-accent/15 blur-3xl pointer-events-none" />

      {/* Top Navigation */}
      <header className="w-full max-w-md mx-auto flex justify-between items-center pt-1 z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-primary to-secondary flex items-center justify-center text-white text-xs font-headline font-extrabold shadow-sm">
            X
          </div>
          <span className="font-headline font-extrabold text-sm tracking-tight">XPRESSIT</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleTheme}
            className="min-h-[40px] min-w-[40px] rounded-full bg-light-surface-card dark:bg-dark-surface-card border border-light-outline dark:border-dark-outline text-primary dark:text-secondary flex items-center justify-center shadow-sm hover:border-primary transition-colors cursor-pointer"
            title="Toggle Theme"
            aria-label="Toggle Theme"
          >
            <Contrast className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="min-h-[40px] px-3 font-label text-sm font-semibold text-light-text-muted dark:text-dark-text-muted hover:text-primary dark:hover:text-secondary transition-colors cursor-pointer"
          >
            Skip
          </button>
        </div>
      </header>

      {/* Main Slide Card */}
      <main className="flex-1 flex flex-col items-center justify-center text-center my-6 z-10 max-w-md mx-auto w-full">
        <div
          className={`w-48 h-48 rounded-3xl bg-gradient-to-tr ${step.frameClass} border flex items-center justify-center relative mb-8 shadow-inner transition-all duration-300`}
        >
          <div className="w-32 h-32 rounded-2xl bg-light-surface-card dark:bg-dark-surface-card flex items-center justify-center shadow-lg gap-2">
            {currentStep === 0 && <EyeOff className="w-14 h-14 text-primary" />}
            {currentStep === 1 && (
              <>
                <FileEdit className="w-10 h-10 text-primary" />
                <span className="text-light-text-muted dark:text-dark-text-muted font-bold text-sm">
                  +
                </span>
                <Mic className="w-10 h-10 text-accent" />
              </>
            )}
            {currentStep === 2 && <Heart className="w-14 h-14 text-secondary fill-secondary/20" />}
          </div>

          <div
            className={`absolute -bottom-3 ${
              currentStep === 1 ? '-left-2' : '-right-2'
            } px-3.5 py-1 rounded-full ${step.badgeClass} text-xs font-bold font-label shadow`}
          >
            {step.badge}
          </div>
        </div>

        <span className="font-label text-xs uppercase tracking-wider text-accent font-bold mb-2">
          {step.kicker}
        </span>

        <h2 className="font-headline text-2xl sm:text-3xl text-light-on-surface dark:text-dark-on-surface font-extrabold mb-3 text-balance max-w-xs">
          {step.title}
        </h2>

        <p className="font-body text-sm text-light-text-muted dark:text-dark-text-muted max-w-xs leading-relaxed text-pretty">
          {step.description}
        </p>
      </main>

      {/* Pagination & Navigation Controls */}
      <footer className="w-full max-w-md mx-auto flex flex-col items-center gap-6 pb-4 z-10">
        <div className="flex items-center gap-2" role="tablist" aria-label="Onboarding steps">
          {STEPS.map((s, idx) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setCurrentStep(idx)}
              aria-label={`Go to step ${idx + 1}`}
              className={`h-2 rounded-full transition-all duration-300 cursor-pointer ${
                idx === currentStep
                  ? 'w-8 bg-primary'
                  : 'w-2 bg-light-outline dark:bg-dark-outline hover:bg-secondary/50'
              }`}
            />
          ))}
        </div>

        <div className="w-full flex items-center gap-3">
          {currentStep > 0 && (
            <button
              type="button"
              onClick={handlePrev}
              className="min-h-[52px] min-w-[52px] px-4 rounded-full border border-light-outline dark:border-dark-outline text-light-on-surface dark:text-dark-on-surface flex items-center justify-center hover:bg-light-surface-card-subtle dark:hover:bg-dark-surface-card transition-all cursor-pointer"
              aria-label="Previous step"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}

          <button
            type="button"
            onClick={handleNext}
            className="flex-1 min-h-[52px] py-3.5 px-6 rounded-full bg-primary hover:bg-primary-light text-white font-label text-base font-bold flex items-center justify-center gap-2 shadow-lg shadow-primary/25 active:scale-[0.98] transition-all cursor-pointer"
          >
            <span>{isLast ? 'Get Started' : 'Next'}</span>
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </footer>
    </div>
  );
}
