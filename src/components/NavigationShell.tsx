import { ReactNode } from 'react';
import {
  AudioWaveform,
  Bookmark,
  Home,
  Plus,
  Settings,
  ShieldCheck,
} from 'lucide-react';
import { ScreenRoute, UserSession } from '../types/xpressit';
import { PWAInstallButton } from './PWAInstallPrompt';

interface NavigationShellProps {
  activeRoute: Extract<ScreenRoute, 'feed' | 'create' | 'settings'>;
  onNavigate: (route: ScreenRoute) => void;
  session: UserSession;
  savedCount: number;
  metadataStripping: boolean;
  voiceMasking: boolean;
  onSelectSavedFilter?: () => void;
  children: ReactNode;
}

export function NavigationShell({
  activeRoute,
  onNavigate,
  session,
  savedCount,
  metadataStripping,
  voiceMasking,
  onSelectSavedFilter,
  children,
}: NavigationShellProps) {
  return (
    <div className="min-h-screen bg-light-surface dark:bg-dark-surface text-light-on-surface dark:text-dark-on-surface font-body transition-colors duration-200">
      <div className="max-w-6xl mx-auto flex justify-center lg:gap-8 lg:px-6">
        {/* Desktop Left Navigation Rail */}
        <aside className="hidden lg:flex flex-col justify-between w-64 shrink-0 sticky top-0 h-screen py-6">
          <div className="flex flex-col gap-6">
            <button
              type="button"
              onClick={() => onNavigate('feed')}
              className="flex items-center gap-3 px-3 py-2 text-left cursor-pointer group"
            >
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-primary to-secondary flex items-center justify-center text-white shadow-md">
                <AudioWaveform className="w-5 h-5" />
              </div>
              <div>
                <div className="font-headline font-extrabold text-lg tracking-tight leading-none">
                  XPRESS<span className="text-accent">IT</span>
                </div>
                <p className="text-[11px] text-light-text-muted dark:text-dark-text-muted font-label mt-0.5">
                  Anonymous Realm
                </p>
              </div>
            </button>

            <nav className="flex flex-col gap-1.5" aria-label="Primary Navigation">
              <button
                type="button"
                onClick={() => onNavigate('feed')}
                className={`flex items-center gap-3 px-4 py-3 rounded-2xl font-label text-sm font-semibold transition-all cursor-pointer ${
                  activeRoute === 'feed'
                    ? 'bg-primary text-white shadow-md shadow-primary/25'
                    : 'text-light-text-muted dark:text-dark-text-muted hover:bg-light-surface-card dark:hover:bg-dark-surface-card hover:text-light-on-surface dark:hover:text-dark-on-surface'
                }`}
              >
                <Home className="w-5 h-5" />
                <span>Home Feed</span>
              </button>

              <button
                type="button"
                onClick={() => onNavigate('create')}
                className={`flex items-center gap-3 px-4 py-3 rounded-2xl font-label text-sm font-semibold transition-all cursor-pointer ${
                  activeRoute === 'create'
                    ? 'bg-primary text-white shadow-md shadow-primary/25'
                    : 'text-light-text-muted dark:text-dark-text-muted hover:bg-light-surface-card dark:hover:bg-dark-surface-card hover:text-light-on-surface dark:hover:text-dark-on-surface'
                }`}
              >
                <Plus className="w-5 h-5" />
                <span>Create Post</span>
              </button>

              <button
                type="button"
                onClick={() => onNavigate('settings')}
                className={`flex items-center gap-3 px-4 py-3 rounded-2xl font-label text-sm font-semibold transition-all cursor-pointer ${
                  activeRoute === 'settings'
                    ? 'bg-primary text-white shadow-md shadow-primary/25'
                    : 'text-light-text-muted dark:text-dark-text-muted hover:bg-light-surface-card dark:hover:bg-dark-surface-card hover:text-light-on-surface dark:hover:text-dark-on-surface'
                }`}
              >
                <Settings className="w-5 h-5" />
                <span>Settings & Privacy</span>
              </button>
            </nav>
          </div>

          <div className="p-4 rounded-2xl bg-light-surface-card dark:bg-dark-surface-card border border-light-outline dark:border-dark-outline shadow-sm">
            <div className="flex items-center gap-2 text-success text-xs font-label font-semibold mb-1.5">
              <ShieldCheck className="w-4 h-4" />
              <span>Authenticated Session</span>
            </div>
            <p className="font-mono text-xs font-semibold text-light-on-surface dark:text-dark-on-surface truncate">
              {session.user.username}
            </p>
            <p className="text-[11px] text-light-text-muted dark:text-dark-text-muted mt-1">
              Bearer session · {session.user.settings.categories.length} For You topics
            </p>
          </div>
        </aside>

        {/* Center Main Column */}
        <div className="flex-1 max-w-xl w-full min-h-screen flex flex-col">
          {children}
        </div>

        {/* Desktop Right Context Rail */}
        <aside className="hidden xl:flex flex-col gap-4 w-72 shrink-0 sticky top-0 h-screen py-6">
          <div className="p-4 rounded-2xl bg-light-surface-card dark:bg-dark-surface-card border border-light-outline dark:border-dark-outline shadow-sm">
            <h2 className="font-headline text-sm font-bold text-light-on-surface dark:text-dark-on-surface mb-2">
              Privacy Sanctuary
            </h2>
            <div className="flex flex-col gap-2.5 text-xs text-light-text-muted dark:text-dark-text-muted">
              <div className="flex items-center justify-between">
                <span>EXIF & GPS Scrubbing</span>
                <span
                  className={`font-label font-semibold ${
                    metadataStripping ? 'text-success' : 'text-warning'
                  }`}
                >
                  {metadataStripping ? 'Active' : 'Paused'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Voice Pitch Mask</span>
                <span
                  className={`font-label font-semibold ${
                    voiceMasking ? 'text-success' : 'text-warning'
                  }`}
                >
                  {voiceMasking ? 'Active' : 'Off'}
                </span>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-light-surface-card dark:bg-dark-surface-card border border-light-outline dark:border-dark-outline shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-headline text-sm font-bold text-light-on-surface dark:text-dark-on-surface">
                Saved Reflections
              </h2>
              <span className="font-mono text-xs font-semibold text-primary dark:text-secondary tabular-nums">
                {savedCount}
              </span>
            </div>
            <p className="text-xs text-light-text-muted dark:text-dark-text-muted leading-relaxed mb-3">
              Bookmark stories you want to revisit privately on this device.
            </p>
            {onSelectSavedFilter && (
              <button
                type="button"
                onClick={onSelectSavedFilter}
                className="w-full py-2 px-3 rounded-xl bg-light-surface-card-subtle dark:bg-dark-surface-card-subtle border border-light-outline-subtle dark:border-dark-outline-subtle hover:border-primary text-xs font-label font-semibold text-primary dark:text-secondary flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Bookmark className="w-3.5 h-3.5" />
                <span>View Saved Posts</span>
              </button>
            )}
          </div>

          <PWAInstallButton fullWidth />
        </aside>
      </div>

      {/* Mobile / Tablet Persistent 3-Tab Bottom Navigation Bar */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 max-w-lg mx-auto bg-light-surface-card/95 dark:bg-dark-surface-card/95 backdrop-blur-md border-t border-light-outline dark:border-dark-outline px-6 py-2 flex items-center justify-between z-40"
        aria-label="Mobile Navigation"
      >
        <button
          type="button"
          onClick={() => onNavigate('feed')}
          className={`flex flex-col items-center gap-0.5 min-w-[56px] py-1 transition-colors cursor-pointer ${
            activeRoute === 'feed'
              ? 'text-primary dark:text-secondary'
              : 'text-light-text-muted dark:text-dark-text-muted hover:text-primary'
          }`}
        >
          <Home className="w-6 h-6" strokeWidth={activeRoute === 'feed' ? 2.5 : 2} />
          <span className="font-label text-[11px] font-bold tracking-tight">HOME</span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('create')}
          className="flex flex-col items-center gap-0.5 -translate-y-3 group cursor-pointer"
        >
          <div className="w-13 h-13 rounded-full bg-primary group-hover:bg-primary-light text-white shadow-xl shadow-primary/30 flex items-center justify-center transition-transform active:scale-95 border-2 border-light-surface-card dark:border-dark-surface-card">
            <Plus className="w-6 h-6" strokeWidth={2.75} />
          </div>
          <span className="font-label text-[11px] font-bold text-primary dark:text-secondary tracking-tight whitespace-nowrap">
            CREATE POST
          </span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('settings')}
          className={`flex flex-col items-center gap-0.5 min-w-[56px] py-1 transition-colors cursor-pointer ${
            activeRoute === 'settings'
              ? 'text-primary dark:text-secondary'
              : 'text-light-text-muted dark:text-dark-text-muted hover:text-primary'
          }`}
        >
          <Settings className="w-6 h-6" strokeWidth={activeRoute === 'settings' ? 2.5 : 2} />
          <span className="font-label text-[11px] font-bold tracking-tight">SETTINGS</span>
        </button>
      </nav>
    </div>
  );
}
