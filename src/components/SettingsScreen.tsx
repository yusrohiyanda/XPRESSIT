import { useState } from 'react';
import {
  AlertTriangle,
  Bell,
  Bookmark,
  Check,
  CheckCircle2,
  ChevronRight,
  Compass,
  Copy,
  Flag,
  HelpCircle,
  KeyRound,
  Loader2,
  LogOut,
  MonitorCog,
  Moon,
  Palette,
  RefreshCw,
  Shield,
  ShieldCheck,
  Slash,
  Sun,
  X,
} from 'lucide-react';
import { CATEGORY_LABELS, REPORT_REASONS, formatRelativeTime } from '../data/seedPosts';
import {
  ApiError,
  confirmPassphraseChange,
  preparePassphraseChange,
} from '../services/xpressitApi';
import {
  ApiBlockedUser,
  ApiMeta,
  ApiPost,
  ApiReportItem,
  ApiUser,
  ApiUserSettings,
  LocalVoicePreferences,
  PostCategory,
  ThemeMode,
  UserSession,
} from '../types/xpressit';

interface SettingsScreenProps {
  meta: ApiMeta;
  theme: ThemeMode;
  onChangeTheme: (theme: ThemeMode) => Promise<void>;
  session: UserSession;
  onSessionRotated: (session: UserSession) => void;
  onUpdateServerSettings: (patch: Partial<ApiUserSettings>) => Promise<ApiUser | void>;
  localPrivacy: LocalVoicePreferences;
  onUpdateLocalPrivacy: (patch: Partial<LocalVoicePreferences>) => void;
  savedPosts: ApiPost[];
  onUnsavePost: (postId: string) => void;
  blockedUsers: ApiBlockedUser[];
  onUnblockUser: (userId: string) => Promise<void>;
  myReports: ApiReportItem[];
  onRefreshReports: () => Promise<void>;
  onLogout: () => Promise<void>;
  onResetDeviceSession: () => Promise<void>;
  onSessionExpired: () => void;
}

type InfoTopic = 'guidelines' | 'policy' | 'about' | null;

export function SettingsScreen({
  meta,
  theme,
  onChangeTheme,
  session,
  onSessionRotated,
  onUpdateServerSettings,
  localPrivacy,
  onUpdateLocalPrivacy,
  savedPosts,
  onUnsavePost,
  blockedUsers,
  onUnblockUser,
  myReports,
  onRefreshReports,
  onLogout,
  onResetDeviceSession,
  onSessionExpired,
}: SettingsScreenProps) {
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [passphraseModalOpen, setPassphraseModalOpen] = useState(false);
  const [savedModalOpen, setSavedModalOpen] = useState(false);
  const [blockedModalOpen, setBlockedModalOpen] = useState(false);
  const [reportsModalOpen, setReportsModalOpen] = useState(false);
  const [infoTopic, setInfoTopic] = useState<InfoTopic>(null);

  // Passphrase rotation flow state
  const [currentPhraseInput, setCurrentPhraseInput] = useState('');
  const [preparedRotation, setPreparedRotation] = useState<{
    passphrase: string;
    words: string[];
    expiresAt: string;
  } | null>(null);
  const [confirmNewSaved, setConfirmNewSaved] = useState(false);
  const [copiedNew, setCopiedNew] = useState(false);
  const [passphraseLoading, setPassphraseLoading] = useState(false);
  const [passphraseError, setPassphraseError] = useState('');
  const [passphraseSuccess, setPassphraseSuccess] = useState(false);

  const [savingSettings, setSavingSettings] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const userSettings = session.user.settings;

  const openPassphraseModal = () => {
    setPassphraseModalOpen(true);
    setCurrentPhraseInput('');
    setPreparedRotation(null);
    setConfirmNewSaved(false);
    setCopiedNew(false);
    setPassphraseError('');
    setPassphraseSuccess(false);
  };

  const handlePrepareRotation = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = currentPhraseInput.trim().toLowerCase().replace(/\s+/g, ' ');
    if (cleaned.split(' ').filter(Boolean).length !== 6) {
      setPassphraseError('Enter all 6 words of your current passphrase.');
      return;
    }

    setPassphraseError('');
    setPassphraseLoading(true);
    try {
      const res = await preparePassphraseChange(session.token, cleaned);
      setPreparedRotation(res);
      setConfirmNewSaved(false);
      setCopiedNew(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onSessionExpired();
        return;
      }
      setPassphraseError(
        err instanceof ApiError ? err.message : 'Could not verify current passphrase.',
      );
    } finally {
      setPassphraseLoading(false);
    }
  };

  const handleConfirmRotation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!preparedRotation) return;
    if (!confirmNewSaved) {
      setPassphraseError('Please confirm that you saved the new 6-word passphrase.');
      return;
    }

    setPassphraseError('');
    setPassphraseLoading(true);
    try {
      const res = await confirmPassphraseChange(session.token, preparedRotation.passphrase);
      onSessionRotated({
        token: res.token,
        expiresAt: res.expiresAt,
        user: res.user,
      });
      setPassphraseSuccess(true);
      setPreparedRotation(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onSessionExpired();
        return;
      }
      setPassphraseError(
        err instanceof ApiError ? err.message : 'Could not activate new passphrase.',
      );
    } finally {
      setPassphraseLoading(false);
    }
  };

  const handleToggleCategoryPref = async (cat: PostCategory) => {
    const current = userSettings.categories || [];
    const next = current.includes(cat) ? current.filter((c) => c !== cat) : [...current, cat];
    setSavingSettings(true);
    try {
      await onUpdateServerSettings({ categories: next });
    } finally {
      setSavingSettings(false);
    }
  };

  const handleToggleNotificationPref = async (key: 'reactions' | 'comments', val: boolean) => {
    setSavingSettings(true);
    try {
      await onUpdateServerSettings({
        notifications: {
          ...userSettings.notifications,
          [key]: val,
        },
      });
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 w-full">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-light-surface/90 dark:bg-dark-surface/90 backdrop-blur-md border-b border-light-outline-subtle dark:border-dark-outline-subtle px-4 py-3 flex items-center justify-between">
        <h1 className="font-headline font-extrabold text-base tracking-tight">
          Settings & Privacy
        </h1>
        <span className="px-2.5 py-1 rounded-full bg-primary/10 text-primary dark:text-secondary text-xs font-label font-bold flex items-center gap-1">
          {savingSettings ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <ShieldCheck className="w-3.5 h-3.5" />
          )}
          <span>{savingSettings ? 'Syncing...' : 'Synced Session'}</span>
        </span>
      </header>

      <main className="flex-1 px-4 py-4 pb-28 lg:pb-10 w-full flex flex-col gap-5">
        {/* Section 1: Appearance */}
        <section className="bg-light-surface-card dark:bg-dark-surface-card rounded-2xl p-4 border border-light-outline dark:border-dark-outline shadow-sm">
          <div className="flex items-center gap-2.5 mb-2">
            <Palette className="w-5 h-5 text-primary dark:text-secondary" />
            <h2 className="font-headline text-base font-bold text-light-on-surface dark:text-dark-on-surface">
              Appearance
            </h2>
          </div>
          <p className="font-body text-xs text-light-text-muted dark:text-dark-text-muted mb-4">
            Synced with your account preferences across sessions.
          </p>

          <div className="grid grid-cols-3 gap-2.5">
            <button
              type="button"
              onClick={() => onChangeTheme('light')}
              className={`flex flex-col items-center justify-center p-3 rounded-xl transition-all cursor-pointer ${
                theme === 'light'
                  ? 'border-2 border-primary bg-primary/10'
                  : 'border border-light-outline dark:border-dark-outline bg-light-surface dark:bg-dark-surface hover:border-primary'
              }`}
            >
              <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mb-1.5 shadow-sm">
                <Sun className="w-4 h-4" />
              </div>
              <span
                className={`font-label text-xs ${
                  theme === 'light'
                    ? 'font-bold text-primary dark:text-secondary'
                    : 'font-semibold text-light-on-surface dark:text-dark-on-surface'
                }`}
              >
                Light
              </span>
            </button>

            <button
              type="button"
              onClick={() => onChangeTheme('dark')}
              className={`flex flex-col items-center justify-center p-3 rounded-xl transition-all cursor-pointer ${
                theme === 'dark'
                  ? 'border-2 border-primary bg-primary/10'
                  : 'border border-light-outline dark:border-dark-outline bg-light-surface dark:bg-dark-surface hover:border-primary'
              }`}
            >
              <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center mb-1.5 shadow-sm">
                <Moon className="w-4 h-4" />
              </div>
              <span
                className={`font-label text-xs ${
                  theme === 'dark'
                    ? 'font-bold text-primary dark:text-secondary'
                    : 'font-semibold text-light-on-surface dark:text-dark-on-surface'
                }`}
              >
                Dark
              </span>
            </button>

            <button
              type="button"
              onClick={() => onChangeTheme('system')}
              className={`flex flex-col items-center justify-center p-3 rounded-xl transition-all cursor-pointer ${
                theme === 'system'
                  ? 'border-2 border-primary bg-primary/10'
                  : 'border border-light-outline dark:border-dark-outline bg-light-surface dark:bg-dark-surface hover:border-primary'
              }`}
            >
              <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-950 text-primary dark:text-secondary flex items-center justify-center mb-1.5 shadow-sm">
                <MonitorCog className="w-4 h-4" />
              </div>
              <span
                className={`font-label text-xs ${
                  theme === 'system'
                    ? 'font-bold text-primary dark:text-secondary'
                    : 'font-semibold text-light-on-surface dark:text-dark-on-surface'
                }`}
              >
                System
              </span>
            </button>
          </div>
        </section>

        {/* Section 2: Account Credentials */}
        <section className="bg-light-surface-card dark:bg-dark-surface-card rounded-2xl p-4 border border-light-outline dark:border-dark-outline shadow-sm">
          <div className="flex items-center gap-2.5 mb-3">
            <KeyRound className="w-5 h-5 text-primary dark:text-secondary" />
            <h2 className="font-headline text-base font-bold text-light-on-surface dark:text-dark-on-surface">
              Account Credentials
            </h2>
          </div>

          <div className="flex items-center justify-between py-2.5 border-b border-light-outline-subtle dark:border-dark-outline-subtle">
            <div>
              <p className="font-label text-xs font-semibold text-light-on-surface dark:text-dark-on-surface">
                Pseudonymous Handle
              </p>
              <p className="text-xs text-light-text-muted dark:text-dark-text-muted font-mono">
                {session.user.username}
              </p>
            </div>
            <span className="text-[11px] font-label text-light-text-muted dark:text-dark-text-muted">
              Immutable
            </span>
          </div>

          <div className="flex items-center justify-between py-2.5 border-b border-light-outline-subtle dark:border-dark-outline-subtle">
            <div>
              <p className="font-label text-xs font-semibold text-light-on-surface dark:text-dark-on-surface">
                Passphrase Status
              </p>
              <p className="text-xs text-success font-medium flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Confirmed & Hashed</span>
              </p>
            </div>
            <button
              type="button"
              onClick={openPassphraseModal}
              className="text-xs font-label text-primary dark:text-secondary font-bold hover:underline py-1 px-2 cursor-pointer"
            >
              Change Key
            </button>
          </div>

          <div className="flex items-center justify-between pt-2.5">
            <div>
              <p className="font-label text-xs font-semibold text-light-on-surface dark:text-dark-on-surface">
                Active Session
              </p>
              <p className="text-xs text-light-text-muted dark:text-dark-text-muted">
                Expires {new Date(session.expiresAt).toLocaleDateString()}
              </p>
            </div>
            <button
              type="button"
              disabled={loggingOut}
              onClick={async () => {
                setLoggingOut(true);
                await onLogout();
                setLoggingOut(false);
              }}
              className="text-xs font-label text-danger font-bold hover:underline py-1 px-2 flex items-center gap-1 cursor-pointer"
            >
              {loggingOut ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <LogOut className="w-3.5 h-3.5" />
              )}
              <span>Logout</span>
            </button>
          </div>
        </section>

        {/* Section 3: For You Feed Topics */}
        <section className="bg-light-surface-card dark:bg-dark-surface-card rounded-2xl p-4 border border-light-outline dark:border-dark-outline shadow-sm">
          <div className="flex items-center gap-2.5 mb-2">
            <Compass className="w-5 h-5 text-primary dark:text-secondary" />
            <h2 className="font-headline text-base font-bold text-light-on-surface dark:text-dark-on-surface">
              For You Feed Topics
            </h2>
          </div>
          <p className="font-body text-xs text-light-text-muted dark:text-dark-text-muted mb-3">
            Select topics to prioritize in your &ldquo;For You&rdquo; feed. Leaving none selected shows all latest stories.
          </p>

          <div className="flex flex-wrap gap-2">
            {meta.categories.map((cat) => {
              const selected = userSettings.categories.includes(cat);
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => handleToggleCategoryPref(cat)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-label transition-all cursor-pointer border ${
                    selected
                      ? 'bg-primary text-white border-primary font-bold shadow-sm'
                      : 'bg-light-surface dark:bg-dark-surface border-light-outline dark:border-dark-outline text-light-text-muted dark:text-dark-text-muted hover:border-primary'
                  }`}
                >
                  {CATEGORY_LABELS[cat] || cat}
                </button>
              );
            })}
          </div>
        </section>

        {/* Section 4: Privacy, Moderation & Saved */}
        <section className="bg-light-surface-card dark:bg-dark-surface-card rounded-2xl p-4 border border-light-outline dark:border-dark-outline shadow-sm">
          <div className="flex items-center gap-2.5 mb-3">
            <Shield className="w-5 h-5 text-primary dark:text-secondary" />
            <h2 className="font-headline text-base font-bold text-light-on-surface dark:text-dark-on-surface">
              Privacy & Moderation
            </h2>
          </div>

          <label className="flex items-center justify-between gap-3 py-2.5 border-b border-light-outline-subtle dark:border-dark-outline-subtle cursor-pointer">
            <div>
              <p className="font-label text-xs font-semibold text-light-on-surface dark:text-dark-on-surface">
                Automatic EXIF & GPS Stripping
              </p>
              <p className="text-xs text-light-text-muted dark:text-dark-text-muted">
                Re-encode uploaded photos on-device before sending to server
              </p>
            </div>
            <input
              type="checkbox"
              checked={localPrivacy.metadataStripping}
              onChange={(e) => onUpdateLocalPrivacy({ metadataStripping: e.target.checked })}
              className="h-5 w-5 accent-primary rounded shrink-0"
            />
          </label>

          <label className="flex items-center justify-between gap-3 py-2.5 border-b border-light-outline-subtle dark:border-dark-outline-subtle cursor-pointer">
            <div>
              <p className="font-label text-xs font-semibold text-light-on-surface dark:text-dark-on-surface">
                Default Voice Pitch Mask
              </p>
              <p className="text-xs text-light-text-muted dark:text-dark-text-muted">
                Enable voice disguise by default in the Voice Post studio
              </p>
            </div>
            <input
              type="checkbox"
              checked={localPrivacy.voiceMasking}
              onChange={(e) => onUpdateLocalPrivacy({ voiceMasking: e.target.checked })}
              className="h-5 w-5 accent-primary rounded shrink-0"
            />
          </label>

          <button
            type="button"
            onClick={() => setSavedModalOpen(true)}
            className="w-full flex items-center justify-between py-2.5 border-b border-light-outline-subtle dark:border-dark-outline-subtle hover:text-primary transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Bookmark className="w-4 h-4 text-primary dark:text-secondary" />
              <span className="font-label text-xs font-semibold">Saved Posts</span>
            </div>
            <span className="text-xs font-mono tabular-nums text-light-text-muted dark:text-dark-text-muted">
              {savedPosts.length} saved
            </span>
          </button>

          <button
            type="button"
            onClick={() => setBlockedModalOpen(true)}
            className="w-full flex items-center justify-between py-2.5 border-b border-light-outline-subtle dark:border-dark-outline-subtle hover:text-primary transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Slash className="w-4 h-4 text-light-text-muted dark:text-dark-text-muted" />
              <span className="font-label text-xs font-semibold">Blocked Users</span>
            </div>
            <span className="text-xs font-mono tabular-nums text-light-text-muted dark:text-dark-text-muted">
              {blockedUsers.length} blocked
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              onRefreshReports();
              setReportsModalOpen(true);
            }}
            className="w-full flex items-center justify-between pt-2.5 hover:text-primary transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Flag className="w-4 h-4 text-warning" />
              <span className="font-label text-xs font-semibold">My Submitted Reports</span>
            </div>
            <span className="text-xs font-mono tabular-nums text-light-text-muted dark:text-dark-text-muted">
              {myReports.length} reports
            </span>
          </button>
        </section>

        {/* Section 5: Notifications */}
        <section className="bg-light-surface-card dark:bg-dark-surface-card rounded-2xl p-4 border border-light-outline dark:border-dark-outline shadow-sm">
          <div className="flex items-center gap-2.5 mb-3">
            <Bell className="w-5 h-5 text-primary dark:text-secondary" />
            <h2 className="font-headline text-base font-bold text-light-on-surface dark:text-dark-on-surface">
              Notifications
            </h2>
          </div>

          <label className="flex items-center justify-between py-2 border-b border-light-outline-subtle dark:border-dark-outline-subtle cursor-pointer">
            <span className="font-label text-xs font-semibold text-light-on-surface dark:text-dark-on-surface">
              Reaction Notifications
            </span>
            <input
              type="checkbox"
              checked={userSettings.notifications.reactions}
              onChange={(e) => handleToggleNotificationPref('reactions', e.target.checked)}
              className="h-4 w-4 accent-primary rounded"
            />
          </label>

          <label className="flex items-center justify-between pt-2 cursor-pointer">
            <span className="font-label text-xs font-semibold text-light-on-surface dark:text-dark-on-surface">
              Comment Notifications
            </span>
            <input
              type="checkbox"
              checked={userSettings.notifications.comments}
              onChange={(e) => handleToggleNotificationPref('comments', e.target.checked)}
              className="h-4 w-4 accent-primary rounded"
            />
          </label>
        </section>

        {/* Section 6: Safety & Support */}
        <section className="bg-light-surface-card dark:bg-dark-surface-card rounded-2xl p-4 border border-light-outline dark:border-dark-outline shadow-sm">
          <div className="flex items-center gap-2.5 mb-3">
            <HelpCircle className="w-5 h-5 text-primary dark:text-secondary" />
            <h2 className="font-headline text-base font-bold text-light-on-surface dark:text-dark-on-surface">
              Safety & Support
            </h2>
          </div>

          <div className="flex flex-col text-xs sm:text-sm">
            <button
              type="button"
              onClick={() => setInfoTopic('guidelines')}
              className="py-2.5 border-b border-light-outline-subtle dark:border-dark-outline-subtle flex items-center justify-between hover:text-primary transition-colors cursor-pointer"
            >
              <span>Community Guidelines</span>
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setInfoTopic('policy')}
              className="py-2.5 border-b border-light-outline-subtle dark:border-dark-outline-subtle flex items-center justify-between hover:text-primary transition-colors cursor-pointer"
            >
              <span>Zero-Knowledge Privacy Policy</span>
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setInfoTopic('about')}
              className="pt-2.5 flex items-center justify-between hover:text-primary transition-colors cursor-pointer"
            >
              <span>About {meta.name}</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </section>

        {/* Section 7: Session Reset */}
        <section className="p-4 rounded-2xl bg-danger/10 border border-danger/30 flex flex-col gap-3">
          <div>
            <h3 className="font-headline text-base text-danger font-bold mb-1">
              Session & Device Cache
            </h3>
            <p className="text-xs text-light-text-muted dark:text-dark-text-muted leading-relaxed">
              Revoke your active Bearer token and wipe locally cached bookmarks and preferences on this browser. Your remote posts remain untouched unless you delete them individually.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setResetModalOpen(true)}
            className="w-full min-h-[46px] py-2.5 rounded-full bg-danger hover:bg-red-600 text-white font-label text-xs sm:text-sm font-bold shadow-md shadow-danger/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out & Clear Device Data</span>
          </button>
        </section>
      </main>

      {/* 2-Step Passphrase Change Modal */}
      {passphraseModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-sm p-5 rounded-2xl bg-light-surface-card dark:bg-dark-surface-card border border-light-outline dark:border-dark-outline shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-headline text-base font-bold">Change 6-Word Passphrase</h3>
              <button
                type="button"
                onClick={() => setPassphraseModalOpen(false)}
                className="text-light-text-muted hover:text-primary cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {passphraseSuccess ? (
              <div className="flex flex-col gap-4">
                <div className="p-3 rounded-xl bg-success/10 border border-success/30 text-xs text-success font-medium">
                  Your new passphrase is active and previous sessions have been revoked.
                </div>
                <button
                  type="button"
                  onClick={() => setPassphraseModalOpen(false)}
                  className="w-full py-2.5 rounded-full bg-primary text-white text-xs font-label font-bold cursor-pointer"
                >
                  Done
                </button>
              </div>
            ) : preparedRotation ? (
              <form onSubmit={handleConfirmRotation} className="flex flex-col gap-3">
                <p className="text-xs text-light-text-muted dark:text-dark-text-muted">
                  Copy and save these 6 new words within 15 minutes, then confirm below:
                </p>

                <div className="grid grid-cols-3 gap-2 text-center">
                  {preparedRotation.words.map((w, i) => (
                    <span
                      key={`${w}-${i}`}
                      className="py-1.5 px-2 rounded-lg bg-light-primary-container dark:bg-dark-primary-container text-primary dark:text-secondary font-mono text-xs font-semibold truncate"
                    >
                      {w}
                    </span>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(preparedRotation.passphrase);
                    } catch {
                      // ignore
                    }
                    setCopiedNew(true);
                  }}
                  className={`py-2 rounded-xl text-xs font-label font-bold flex items-center justify-center gap-1.5 text-white cursor-pointer ${
                    copiedNew ? 'bg-success' : 'bg-primary hover:bg-primary-light'
                  }`}
                >
                  {copiedNew ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedNew ? 'Copied New Words!' : 'Copy New Passphrase'}</span>
                </button>

                <label className="flex items-start gap-2.5 p-2.5 rounded-xl bg-warning/10 border border-warning/30 cursor-pointer text-xs">
                  <input
                    type="checkbox"
                    checked={confirmNewSaved}
                    onChange={(e) => setConfirmNewSaved(e.target.checked)}
                    className="mt-0.5 accent-primary"
                  />
                  <span>I saved these 6 new words. My old passphrase will stop working.</span>
                </label>

                {passphraseError && (
                  <p className="text-xs text-danger bg-danger/10 rounded-xl px-3 py-2">
                    {passphraseError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={passphraseLoading}
                  className="w-full py-2.5 rounded-full bg-primary hover:bg-primary-light disabled:opacity-60 text-white text-xs font-label font-bold flex items-center justify-center gap-2 cursor-pointer"
                >
                  {passphraseLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Activate New Passphrase</span>
                </button>
              </form>
            ) : (
              <form onSubmit={handlePrepareRotation} className="flex flex-col gap-3">
                <p className="text-xs text-light-text-muted dark:text-dark-text-muted leading-relaxed">
                  Enter your current 6-word passphrase to generate a replacement key.
                </p>
                <textarea
                  rows={3}
                  value={currentPhraseInput}
                  onChange={(e) => setCurrentPhraseInput(e.target.value)}
                  placeholder="Enter your current 6 words..."
                  className="w-full p-3 rounded-xl bg-light-surface dark:bg-dark-surface border border-light-outline dark:border-dark-outline font-mono text-xs resize-none focus:outline-none focus:border-primary"
                />
                {passphraseError && (
                  <p className="text-xs text-danger bg-danger/10 rounded-xl px-3 py-2">
                    {passphraseError}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={passphraseLoading}
                  className="w-full py-2.5 rounded-full bg-primary hover:bg-primary-light disabled:opacity-60 text-white text-xs font-label font-bold flex items-center justify-center gap-2 cursor-pointer"
                >
                  {passphraseLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  <span>Generate Replacement Key</span>
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Saved Posts Modal */}
      {savedModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md p-5 rounded-2xl bg-light-surface-card dark:bg-dark-surface-card border border-light-outline dark:border-dark-outline shadow-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-headline text-base font-bold">
                Saved Reflections ({savedPosts.length})
              </h3>
              <button
                type="button"
                onClick={() => setSavedModalOpen(false)}
                className="text-light-text-muted hover:text-primary cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto flex flex-col gap-2.5">
              {savedPosts.length === 0 ? (
                <p className="text-xs text-light-text-muted dark:text-dark-text-muted py-6 text-center">
                  No saved posts loaded in your current feed.
                </p>
              ) : (
                savedPosts.map((p) => (
                  <div
                    key={p.id}
                    className="p-3 rounded-xl bg-light-surface-card-subtle dark:bg-dark-surface-card-subtle border border-light-outline-subtle dark:border-dark-outline-subtle flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="font-label text-xs font-bold text-primary dark:text-secondary">
                        {p.author.username} · {CATEGORY_LABELS[p.category] || p.category}
                      </p>
                      <p className="text-xs text-light-on-surface dark:text-dark-on-surface line-clamp-2 mt-1">
                        {p.content || p.title || 'Voice Experience'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onUnsavePost(p.id)}
                      className="text-xs font-label font-semibold text-danger hover:underline shrink-0 cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Blocked Users Modal */}
      {blockedModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-sm p-5 rounded-2xl bg-light-surface-card dark:bg-dark-surface-card border border-light-outline dark:border-dark-outline shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-headline text-base font-bold">Blocked Users</h3>
              <button
                type="button"
                onClick={() => setBlockedModalOpen(false)}
                className="text-light-text-muted hover:text-primary cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {blockedUsers.length === 0 ? (
              <p className="text-xs text-light-text-muted dark:text-dark-text-muted py-4 text-center">
                You have not blocked any accounts.
              </p>
            ) : (
              <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
                {blockedUsers.map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-light-surface-card-subtle dark:bg-dark-surface-card-subtle"
                  >
                    <span className="font-mono text-xs font-semibold">{u.username}</span>
                    <button
                      type="button"
                      onClick={() => onUnblockUser(u.id)}
                      className="text-xs font-label font-bold text-primary dark:text-secondary hover:underline cursor-pointer"
                    >
                      Unblock
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* My Submitted Reports Modal */}
      {reportsModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md p-5 rounded-2xl bg-light-surface-card dark:bg-dark-surface-card border border-light-outline dark:border-dark-outline shadow-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-headline text-base font-bold">My Submitted Reports</h3>
              <button
                type="button"
                onClick={() => setReportsModalOpen(false)}
                className="text-light-text-muted hover:text-primary cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto flex flex-col gap-2.5">
              {myReports.length === 0 ? (
                <p className="text-xs text-light-text-muted dark:text-dark-text-muted py-6 text-center">
                  No reports submitted yet.
                </p>
              ) : (
                myReports.map((rep) => {
                  const reasonLabel =
                    REPORT_REASONS.find((r) => r.id === rep.reason)?.label || rep.reason;
                  return (
                    <div
                      key={rep.id}
                      className="p-3 rounded-xl bg-light-surface-card-subtle dark:bg-dark-surface-card-subtle border border-light-outline-subtle dark:border-dark-outline-subtle"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="font-label text-xs font-bold text-warning">
                          {reasonLabel}
                        </span>
                        <span className="font-mono text-[11px] uppercase text-light-text-muted">
                          {rep.status}
                        </span>
                      </div>
                      {rep.details && (
                        <p className="text-xs text-light-on-surface dark:text-dark-on-surface mb-1">
                          {rep.details}
                        </p>
                      )}
                      <p className="text-[11px] text-light-text-muted">
                        Submitted {formatRelativeTime(rep.createdAt)}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Info Modal */}
      {infoTopic && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md p-5 rounded-2xl bg-light-surface-card dark:bg-dark-surface-card border border-light-outline dark:border-dark-outline shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-headline text-base font-bold">
                {infoTopic === 'guidelines'
                  ? 'Community Guidelines'
                  : infoTopic === 'policy'
                  ? 'Zero-Knowledge Privacy Policy'
                  : `About ${meta.name}`}
              </h3>
              <button
                type="button"
                onClick={() => setInfoTopic(null)}
                className="text-light-text-muted hover:text-primary cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {infoTopic === 'guidelines' && (
              <p className="text-xs text-light-text-muted dark:text-dark-text-muted leading-relaxed mb-4">
                Speak honestly without exposing real names, addresses, or private identifying details of others. Harassment, hate speech, doxxing, and spam are blocked and reported to keep this sanctuary safe.
              </p>
            )}

            {infoTopic === 'policy' && (
              <p className="text-xs text-light-text-muted dark:text-dark-text-muted leading-relaxed mb-4">
                XPRESSIT never requests an email address or phone number. Passphrases use scrypt hashing, evidence images strip EXIF/GPS metadata before upload, and voice posts can be pitch/formant masked locally before leaving your device.
              </p>
            )}

            {infoTopic === 'about' && (
              <p className="text-xs text-light-text-muted dark:text-dark-text-muted leading-relaxed mb-4">
                {meta.name} — {meta.tagline} Built for heartfelt text reflections, masked voice expressions, and safe anonymous support.
              </p>
            )}

            <button
              type="button"
              onClick={() => setInfoTopic(null)}
              className="w-full py-2.5 rounded-full border border-light-outline dark:border-dark-outline text-xs font-label font-semibold hover:border-primary cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Clear Device Session Modal */}
      {resetModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="w-full max-w-sm p-6 rounded-2xl bg-light-surface-card dark:bg-dark-surface-card border border-light-outline dark:border-dark-outline shadow-2xl">
            <div className="w-12 h-12 rounded-full bg-danger/10 text-danger flex items-center justify-center mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="font-headline text-lg text-light-on-surface dark:text-dark-on-surface mb-2 font-bold">
              Sign Out & Clear Cache?
            </h3>
            <p className="font-body text-xs text-light-text-muted dark:text-dark-text-muted mb-6 leading-relaxed">
              This revokes your active session token and clears locally saved bookmarks on this browser. Make sure you have your 6-word passphrase saved to log back in later.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setResetModalOpen(false)}
                className="px-4 py-2.5 rounded-full border border-light-outline dark:border-dark-outline text-light-on-surface dark:text-dark-on-surface font-label text-xs font-semibold hover:bg-light-surface-card-subtle cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setResetModalOpen(false);
                  onResetDeviceSession();
                }}
                className="px-5 py-2.5 rounded-full bg-danger hover:bg-red-600 text-white font-label text-xs font-bold shadow-md shadow-danger/25 transition-all cursor-pointer"
              >
                Confirm Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
