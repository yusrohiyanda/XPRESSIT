import { useEffect, useState } from 'react';
import { Download, Share, Smartphone, WifiOff, X } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { usePWAInstall } from '../hooks/usePWAInstall';

const VISIT_DISMISS_KEY = 'xpressit_pwa_visit_dismissed_v1';

interface InstallGuideModalProps {
  isIOS: boolean;
  onClose: () => void;
}

function InstallGuideModal({ isIOS, onClose }: InstallGuideModalProps) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-2xl bg-light-surface-card dark:bg-dark-surface-card border border-light-outline dark:border-dark-outline p-5 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <img
              src="/pwa-192x192.png"
              alt="XPRESSIT"
              className="w-9 h-9 rounded-xl shadow-sm"
            />
            <div>
              <h3 className="font-headline text-base font-bold text-light-on-surface dark:text-dark-on-surface">
                Install XPRESSIT App
              </h3>
              <p className="text-[11px] text-light-text-muted dark:text-dark-text-muted">
                Standalone &bull; Fast Launch
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[36px] min-w-[36px] rounded-full flex items-center justify-center text-light-text-muted hover:text-primary cursor-pointer"
            aria-label="Close install instructions"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {isIOS ? (
          <ol className="flex flex-col gap-2.5 text-xs text-light-on-surface dark:text-dark-on-surface leading-relaxed mb-4">
            <li className="p-2.5 rounded-xl bg-light-surface-card-subtle dark:bg-dark-surface-card-subtle border border-light-outline-subtle dark:border-dark-outline-subtle flex items-center gap-2.5">
              <span className="w-5 h-5 rounded-full bg-primary text-white font-mono text-[11px] font-bold flex items-center justify-center shrink-0">
                1
              </span>
              <span>
                Tap the <strong className="inline-flex items-center gap-1">Share <Share className="w-3.5 h-3.5 inline text-primary dark:text-secondary" /></strong> button in Safari&apos;s toolbar.
              </span>
            </li>
            <li className="p-2.5 rounded-xl bg-light-surface-card-subtle dark:bg-dark-surface-card-subtle border border-light-outline-subtle dark:border-dark-outline-subtle flex items-center gap-2.5">
              <span className="w-5 h-5 rounded-full bg-primary text-white font-mono text-[11px] font-bold flex items-center justify-center shrink-0">
                2
              </span>
              <span>
                Scroll down and tap <strong>Add to Home Screen</strong>.
              </span>
            </li>
          </ol>
        ) : (
          <div className="p-3 rounded-xl bg-light-surface-card-subtle dark:bg-dark-surface-card-subtle border border-light-outline-subtle dark:border-dark-outline-subtle text-xs text-light-on-surface dark:text-dark-on-surface leading-relaxed mb-4">
            <p className="mb-1.5 font-semibold">Install from your browser menu:</p>
            <p className="text-light-text-muted dark:text-dark-text-muted">
              Open your browser address bar or menu (<span className="font-mono">&#8942;</span>) and select{' '}
              <strong className="text-light-on-surface dark:text-dark-on-surface">
                Install XPRESSIT
              </strong>{' '}
              or <strong className="text-light-on-surface dark:text-dark-on-surface">Add to Home screen</strong>.
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className="w-full py-2.5 rounded-full bg-primary hover:bg-primary-light text-white font-label text-xs font-bold cursor-pointer"
        >
          Got It
        </button>
      </div>
    </div>
  );
}

/**
 * Prompts visitors to install XPRESSIT on initial visit unless already running standalone
 * or previously dismissed during the current session.
 */
export function PWAVisitPrompt() {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(VISIT_DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [visible, setVisible] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    if (isInstalled || dismissed) {
      setVisible(false);
      return;
    }
    if (isInstallable || isIOS) {
      setVisible(true);
      return;
    }
    // Give Chromium 900ms to fire beforeinstallprompt on first load before showing visit prompt
    const timer = setTimeout(() => {
      setVisible(true);
    }, 900);
    return () => clearTimeout(timer);
  }, [isInstallable, isInstalled, isIOS, dismissed]);

  const handleDismiss = () => {
    setDismissed(true);
    setVisible(false);
    try {
      sessionStorage.setItem(VISIT_DISMISS_KEY, '1');
    } catch {
      // ignore
    }
  };

  const handleInstallAction = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (accepted) {
        setVisible(false);
      }
      return;
    }
    setShowGuide(true);
  };

  if (isInstalled) return null;

  return (
    <>
      {visible && (
        <aside
          role="dialog"
          aria-label="Install XPRESSIT App"
          className="fixed top-3 left-1/2 -translate-x-1/2 z-[60] w-[calc(100%-1.5rem)] max-w-md rounded-2xl bg-light-surface-card/95 dark:bg-dark-surface-card/95 backdrop-blur-md border border-primary/40 shadow-2xl p-3.5 flex items-center gap-3 animate-fade-in"
        >
          <img
            src="/pwa-192x192.png"
            alt="XPRESSIT App Icon"
            className="w-11 h-11 rounded-xl shrink-0 shadow-md"
          />

          <div className="flex-1 min-w-0">
            <h2 className="font-headline text-xs sm:text-sm font-extrabold text-light-on-surface dark:text-dark-on-surface truncate">
              Install XPRESSIT App
            </h2>
            <p className="text-[11px] text-light-text-muted dark:text-dark-text-muted leading-snug">
              Private full-screen sanctuary on your home screen
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleInstallAction}
              className="px-3.5 py-2 rounded-full bg-primary hover:bg-primary-light text-white font-label text-xs font-bold flex items-center gap-1.5 shadow-md shadow-primary/25 active:scale-95 transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Install</span>
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="w-8 h-8 rounded-full flex items-center justify-center text-light-text-muted hover:text-light-on-surface dark:hover:text-dark-on-surface transition-colors cursor-pointer"
              aria-label="Dismiss install prompt"
              title="Not now"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </aside>
      )}

      {showGuide && (
        <InstallGuideModal isIOS={isIOS} onClose={() => setShowGuide(false)} />
      )}
    </>
  );
}

/**
 * Compact install CTA button for mounting inside navigation rails and settings.
 */
export function PWAInstallButton({ fullWidth = false }: { fullWidth?: boolean }) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) return null;

  const handleClick = async () => {
    if (isInstallable) {
      await install();
      return;
    }
    setShowGuide(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={`${
          fullWidth ? 'w-full justify-center' : ''
        } px-3.5 py-2 rounded-xl bg-light-primary-container dark:bg-dark-primary-container text-primary dark:text-secondary border border-primary/25 hover:border-primary font-label text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer`}
      >
        {isIOS ? <Smartphone className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5" />}
        <span>{isInstallable ? 'Install App' : isIOS ? 'Install on iOS' : 'Install App'}</span>
      </button>

      {showGuide && (
        <InstallGuideModal isIOS={isIOS} onClose={() => setShowGuide(false)} />
      )}
    </>
  );
}

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-20 lg:bottom-4 left-4 z-50 flex items-center gap-2 rounded-full bg-warning px-3.5 py-1.5 text-xs font-label font-bold text-black shadow-lg">
      <WifiOff className="w-3.5 h-3.5" />
      <span>Offline Mode — Cached shell active</span>
    </div>
  );
}
