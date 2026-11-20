import { useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Contrast,
  Copy,
  Dices,
  Fingerprint,
  Loader2,
  Lock,
  LogIn,
  ShieldCheck,
  X,
} from 'lucide-react';
import { generateRandomHandle } from '../data/seedPosts';
import {
  ApiError,
  confirmPassphraseSaved,
  loginAccount,
  registerAccount,
} from '../services/xpressitApi';
import { UserSession } from '../types/xpressit';

interface AuthScreenProps {
  pendingSession: UserSession | null;
  savedHandleHint: string | null;
  onPendingCreated: (session: UserSession) => void;
  onAuthenticated: (session: UserSession) => void;
  onBack: () => void;
  onToggleTheme: () => void;
}

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,24}$/;

export function AuthScreen({
  pendingSession,
  savedHandleHint,
  onPendingCreated,
  onAuthenticated,
  onBack,
  onToggleTheme,
}: AuthScreenProps) {
  const [tab, setTab] = useState<'register' | 'login'>(
    pendingSession && !pendingSession.user.confirmed ? 'login' : 'register',
  );

  // Registration Step 1 & Step 2 state
  const [regUsername, setRegUsername] = useState(() => generateRandomHandle());
  const [pendingReg, setPendingReg] = useState<{
    session: UserSession;
    words: string[];
    passphrase: string;
    warning: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmedSaved, setConfirmedSaved] = useState(false);
  const [regLoading, setRegLoading] = useState(false);
  const [regError, setRegError] = useState('');

  // Login state
  const [loginUsername, setLoginUsername] = useState(savedHandleHint || '');
  const [loginPhrase, setLoginPhrase] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [unconfirmedLoginSession, setUnconfirmedLoginSession] = useState<UserSession | null>(
    pendingSession && !pendingSession.user.confirmed ? pendingSession : null,
  );
  const [loginConfirmChecked, setLoginConfirmChecked] = useState(false);

  const handleCopyPassphrase = async (phrase: string) => {
    try {
      await navigator.clipboard.writeText(phrase);
    } catch {
      // Ignore clipboard error if blocked
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // Step 1: Request pending account & 6-word passphrase from server
  const handleRegisterStart = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = regUsername.trim();
    if (!USERNAME_REGEX.test(cleaned)) {
      setRegError('Username must be 3–24 characters using only letters, numbers, or underscores.');
      return;
    }

    setRegError('');
    setRegLoading(true);
    try {
      const res = await registerAccount(cleaned);
      const nextSession: UserSession = {
        token: res.token,
        expiresAt: res.expiresAt,
        user: res.user,
      };
      onPendingCreated(nextSession);
      setPendingReg({
        session: nextSession,
        words: res.words,
        passphrase: res.passphrase,
        warning: res.warning,
      });
      setConfirmedSaved(false);
      setCopied(false);
    } catch (err) {
      setRegError(
        err instanceof ApiError
          ? err.message
          : 'Could not register handle. Please try again.',
      );
    } finally {
      setRegLoading(false);
    }
  };

  // Step 2: Confirm user saved the server-generated passphrase
  const handleRegisterConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingReg) return;
    if (!confirmedSaved) {
      setRegError('Please check the box confirming you saved your 6-word passphrase.');
      return;
    }

    setRegError('');
    setRegLoading(true);
    try {
      const confirmedUser = await confirmPassphraseSaved(pendingReg.session.token);
      onAuthenticated({
        ...pendingReg.session,
        user: confirmedUser,
      });
    } catch (err) {
      setRegError(
        err instanceof ApiError
          ? err.message
          : 'Could not confirm registration. Please retry.',
      );
    } finally {
      setRegLoading(false);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedUser = loginUsername.trim();
    const normalizedPhrase = loginPhrase.trim().toLowerCase().replace(/\s+/g, ' ');
    const words = normalizedPhrase.split(' ').filter(Boolean);

    if (!USERNAME_REGEX.test(cleanedUser)) {
      setLoginError('Enter a valid 3–24 character username (letters, numbers, underscores).');
      return;
    }
    if (words.length !== 6) {
      setLoginError('Please enter all 6 words of your secret passphrase.');
      return;
    }

    setLoginError('');
    setLoginLoading(true);
    try {
      const res = await loginAccount(cleanedUser, normalizedPhrase);
      const session: UserSession = {
        token: res.token,
        expiresAt: res.expiresAt,
        user: res.user,
      };
      if (res.user.confirmed) {
        onAuthenticated(session);
      } else {
        onPendingCreated(session);
        setUnconfirmedLoginSession(session);
        setLoginConfirmChecked(false);
      }
    } catch (err) {
      setLoginError(
        err instanceof ApiError
          ? err.message
          : 'Login failed. Check your username and 6-word passphrase.',
      );
    } finally {
      setLoginLoading(false);
    }
  };

  const handleConfirmPendingLogin = async () => {
    if (!unconfirmedLoginSession) return;
    if (!loginConfirmChecked) {
      setLoginError('Please confirm that your passphrase is saved before entering.');
      return;
    }
    setLoginError('');
    setLoginLoading(true);
    try {
      const confirmedUser = await confirmPassphraseSaved(unconfirmedLoginSession.token);
      onAuthenticated({
        ...unconfirmedLoginSession,
        user: confirmedUser,
      });
    } catch (err) {
      setLoginError(
        err instanceof ApiError
          ? err.message
          : 'Could not confirm account. It may have expired; try registering again.',
      );
    } finally {
      setLoginLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-light-surface dark:bg-dark-surface text-light-on-surface dark:text-dark-on-surface flex flex-col justify-between p-6 relative font-body transition-colors duration-200">
      {/* Header */}
      <header className="w-full max-w-md mx-auto flex justify-between items-center pt-1">
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
            onClick={onBack}
            className="min-h-[40px] min-w-[40px] rounded-full text-light-text-muted dark:text-dark-text-muted hover:text-primary flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Back to Onboarding"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Auth Form */}
      <main className="w-full max-w-sm mx-auto my-auto py-6">
        {/* Segmented Mode Selector */}
        <div className="w-full p-1 bg-light-surface-card-subtle dark:bg-dark-surface-card-subtle rounded-full flex items-center mb-6 border border-light-outline-subtle dark:border-dark-outline-subtle">
          <button
            type="button"
            onClick={() => {
              setTab('register');
              setLoginError('');
            }}
            className={`flex-1 py-2.5 rounded-full font-label text-xs font-bold transition-all cursor-pointer ${
              tab === 'register'
                ? 'bg-primary text-white shadow-sm'
                : 'text-light-text-muted dark:text-dark-text-muted hover:text-light-on-surface dark:hover:text-dark-on-surface'
            }`}
          >
            Create Account
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('login');
              setRegError('');
            }}
            className={`flex-1 py-2.5 rounded-full font-label text-xs font-bold transition-all cursor-pointer ${
              tab === 'login'
                ? 'bg-primary text-white shadow-sm'
                : 'text-light-text-muted dark:text-dark-text-muted hover:text-light-on-surface dark:hover:text-dark-on-surface'
            }`}
          >
            Login
          </button>
        </div>

        {tab === 'register' ? (
          pendingReg ? (
            /* Step 2: Server-Generated 6-Word Passphrase Confirmation */
            <form onSubmit={handleRegisterConfirm} className="flex flex-col gap-5">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-xs text-primary dark:text-secondary font-semibold">
                    Step 2 of 2 · Save Key
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setPendingReg(null);
                      setRegError('');
                    }}
                    className="text-xs font-label text-light-text-muted hover:text-primary flex items-center gap-1 cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Change Handle</span>
                  </button>
                </div>
                <h2 className="font-headline text-xl font-extrabold text-light-on-surface dark:text-dark-on-surface mb-1">
                  Save Your Passphrase
                </h2>
                <p className="font-body text-xs text-light-text-muted dark:text-dark-text-muted leading-relaxed">
                  Handle <span className="font-mono font-semibold text-primary dark:text-secondary">{pendingReg.session.user.username}</span> is reserved. Store these 6 words somewhere safe before entering.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-light-surface-card dark:bg-dark-surface-card border border-secondary/40 shadow-sm">
                <div className="grid grid-cols-3 gap-2 text-center">
                  {pendingReg.words.map((word, index) => (
                    <span
                      key={`${word}-${index}`}
                      className="py-2 px-2 rounded-lg bg-light-primary-container dark:bg-dark-primary-container text-primary dark:text-secondary font-mono text-xs font-semibold truncate"
                    >
                      {word}
                    </span>
                  ))}
                </div>

                <div className="mt-3 pt-3 border-t border-light-outline-subtle dark:border-dark-outline-subtle flex items-center justify-between gap-2">
                  <span className="text-xs text-light-text-muted dark:text-dark-text-muted">
                    {copied ? 'Passphrase copied!' : 'Copy all 6 words'}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopyPassphrase(pendingReg.passphrase)}
                    className={`px-3 py-1.5 rounded-lg text-white font-label text-xs font-semibold flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer ${
                      copied ? 'bg-success' : 'bg-primary hover:bg-primary-light'
                    }`}
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copied!' : 'Copy'}</span>
                  </button>
                </div>
              </div>

              <label className="flex items-start gap-3 cursor-pointer p-3 rounded-xl bg-warning/10 border border-warning/30">
                <input
                  type="checkbox"
                  checked={confirmedSaved}
                  onChange={(e) => setConfirmedSaved(e.target.checked)}
                  className="mt-0.5 rounded text-primary focus:ring-primary h-4 w-4 accent-primary shrink-0"
                />
                <span className="font-body text-xs text-light-on-surface dark:text-dark-on-surface leading-relaxed">
                  {pendingReg.warning ||
                    'I confirm that I have safely copied and stored my 6-word passphrase. It cannot be recovered if lost.'}
                </span>
              </label>

              {regError && (
                <p className="text-xs font-medium text-danger bg-danger/10 border border-danger/25 rounded-xl px-3 py-2">
                  {regError}
                </p>
              )}

              <button
                type="submit"
                disabled={regLoading}
                className="w-full min-h-[52px] py-3.5 rounded-full bg-primary hover:bg-primary-light disabled:opacity-60 text-white font-label text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-primary/25 active:scale-[0.98] transition-all cursor-pointer"
              >
                {regLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <ShieldCheck className="w-5 h-5" />
                )}
                <span>{regLoading ? 'Confirming Session...' : 'Confirm & Enter XPRESSIT'}</span>
              </button>
            </form>
          ) : (
            /* Step 1: Choose Handle */
            <form onSubmit={handleRegisterStart} className="flex flex-col gap-5">
              <div>
                <span className="font-mono text-xs text-primary dark:text-secondary font-semibold">
                  Step 1 of 2 · Anonymous Handle
                </span>
                <h2 className="font-headline text-xl font-extrabold text-light-on-surface dark:text-dark-on-surface mb-1 mt-0.5">
                  Zero-Identity Sign Up
                </h2>
                <p className="font-body text-xs text-light-text-muted dark:text-dark-text-muted leading-relaxed">
                  No email, no phone, no real name. Choose a handle and we will generate your 6-word secret recovery key.
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="regUsername"
                    className="font-label text-xs font-semibold text-light-on-surface dark:text-dark-on-surface"
                  >
                    Private Username
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setRegUsername(generateRandomHandle());
                      setRegError('');
                    }}
                    className="text-xs font-label text-primary dark:text-secondary flex items-center gap-1 hover:underline cursor-pointer"
                  >
                    <Dices className="w-3.5 h-3.5" />
                    <span>Randomize</span>
                  </button>
                </div>
                <div className="relative">
                  <input
                    id="regUsername"
                    type="text"
                    value={regUsername}
                    onChange={(e) => {
                      setRegUsername(e.target.value);
                      if (regError) setRegError('');
                    }}
                    maxLength={24}
                    className="w-full pl-4 pr-10 py-3 rounded-xl bg-light-surface-card dark:bg-dark-surface-card border border-light-outline dark:border-dark-outline text-light-on-surface dark:text-dark-on-surface placeholder:text-light-text-muted dark:placeholder:text-dark-text-muted focus:outline-none focus:border-primary font-mono text-sm"
                    placeholder="quiet_voice_101"
                  />
                  <Fingerprint className="w-4 h-4 absolute right-3.5 top-3.5 text-light-text-muted dark:text-dark-text-muted" />
                </div>
                <p className="text-[11px] text-light-text-muted dark:text-dark-text-muted">
                  3–24 characters: letters, numbers, or underscores only.
                </p>
              </div>

              {regError && (
                <p className="text-xs font-medium text-danger bg-danger/10 border border-danger/25 rounded-xl px-3 py-2">
                  {regError}
                </p>
              )}

              <button
                type="submit"
                disabled={regLoading}
                className="w-full min-h-[52px] py-3.5 rounded-full bg-primary hover:bg-primary-light disabled:opacity-60 text-white font-label text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-primary/25 active:scale-[0.98] transition-all cursor-pointer"
              >
                {regLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <ShieldCheck className="w-5 h-5" />
                )}
                <span>
                  {regLoading ? 'Generating Passphrase...' : 'Generate 6-Word Key'}
                </span>
              </button>
            </form>
          )
        ) : unconfirmedLoginSession ? (
          /* Pending unconfirmed login confirmation */
          <div className="flex flex-col gap-5">
            <div className="p-4 rounded-2xl bg-warning/10 border border-warning/30 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
              <div>
                <h2 className="font-headline text-base font-bold text-light-on-surface dark:text-dark-on-surface">
                  Finish Account Confirmation
                </h2>
                <p className="text-xs text-light-text-muted dark:text-dark-text-muted mt-1 leading-relaxed">
                  Your account <span className="font-mono font-semibold">{unconfirmedLoginSession.user.username}</span> was created but hasn&apos;t confirmed passphrase storage yet.
                </p>
              </div>
            </div>

            <label className="flex items-start gap-3 cursor-pointer p-3 rounded-xl bg-light-surface-card dark:bg-dark-surface-card border border-light-outline dark:border-dark-outline">
              <input
                type="checkbox"
                checked={loginConfirmChecked}
                onChange={(e) => setLoginConfirmChecked(e.target.checked)}
                className="mt-0.5 rounded text-primary focus:ring-primary h-4 w-4 accent-primary shrink-0"
              />
              <span className="font-body text-xs text-light-on-surface dark:text-dark-on-surface leading-relaxed">
                I have safely stored my 6-word passphrase and understand it is the only way to log back in.
              </span>
            </label>

            {loginError && (
              <p className="text-xs font-medium text-danger bg-danger/10 border border-danger/25 rounded-xl px-3 py-2">
                {loginError}
              </p>
            )}

            <button
              type="button"
              disabled={loginLoading}
              onClick={handleConfirmPendingLogin}
              className="w-full min-h-[52px] py-3.5 rounded-full bg-primary hover:bg-primary-light disabled:opacity-60 text-white font-label text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-primary/25 cursor-pointer"
            >
              {loginLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <ShieldCheck className="w-5 h-5" />
              )}
              <span>{loginLoading ? 'Confirming...' : 'Confirm & Enter Feed'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setUnconfirmedLoginSession(null);
                setLoginError('');
              }}
              className="text-xs font-label font-semibold text-light-text-muted hover:text-primary cursor-pointer"
            >
              Sign in with a different handle
            </button>
          </div>
        ) : (
          <form onSubmit={handleLoginSubmit} className="flex flex-col gap-5">
            <div>
              <h2 className="font-headline text-xl font-extrabold text-light-on-surface dark:text-dark-on-surface mb-1">
                Welcome Back
              </h2>
              <p className="font-body text-xs text-light-text-muted dark:text-dark-text-muted leading-relaxed">
                Enter your registered username and six secret words to unlock your session.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="loginUsername"
                className="font-label text-xs font-semibold text-light-on-surface dark:text-dark-on-surface"
              >
                Private Username
              </label>
              <input
                id="loginUsername"
                type="text"
                value={loginUsername}
                onChange={(e) => {
                  setLoginUsername(e.target.value);
                  if (loginError) setLoginError('');
                }}
                className="w-full px-4 py-3 rounded-xl bg-light-surface-card dark:bg-dark-surface-card border border-light-outline dark:border-dark-outline text-light-on-surface dark:text-dark-on-surface placeholder:text-light-text-muted dark:placeholder:text-dark-text-muted focus:outline-none focus:border-primary font-mono text-sm"
                placeholder="Enter username"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="loginPassphrase"
                className="font-label text-xs font-semibold text-light-on-surface dark:text-dark-on-surface"
              >
                6-Word Passphrase
              </label>
              <textarea
                id="loginPassphrase"
                rows={3}
                value={loginPhrase}
                onChange={(e) => {
                  setLoginPhrase(e.target.value);
                  if (loginError) setLoginError('');
                }}
                className="w-full px-4 py-3 rounded-xl bg-light-surface-card dark:bg-dark-surface-card border border-light-outline dark:border-dark-outline text-light-on-surface dark:text-dark-on-surface placeholder:text-light-text-muted dark:placeholder:text-dark-text-muted focus:outline-none focus:border-primary font-mono text-sm leading-relaxed resize-none"
                placeholder="word1 word2 word3 word4 word5 word6"
              />
            </div>

            {loginError && (
              <p className="text-xs font-medium text-danger bg-danger/10 border border-danger/25 rounded-xl px-3 py-2">
                {loginError}
              </p>
            )}

            <button
              type="submit"
              disabled={loginLoading}
              className="w-full min-h-[52px] py-3.5 rounded-full bg-primary hover:bg-primary-light disabled:opacity-60 text-white font-label text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-primary/25 active:scale-[0.98] transition-all cursor-pointer"
            >
              {loginLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <LogIn className="w-5 h-5" />
              )}
              <span>{loginLoading ? 'Verifying Credentials...' : 'Login to XPRESSIT'}</span>
            </button>
          </form>
        )}
      </main>

      {/* Footer security guarantee */}
      <footer className="w-full text-center py-2">
        <p className="font-body text-xs text-light-text-muted dark:text-dark-text-muted flex items-center justify-center gap-1.5">
          <Lock className="w-3.5 h-3.5 text-success" />
          <span>Scrypt-hashed passphrase · Zero tracking telemetry</span>
        </p>
      </footer>
    </div>
  );
}
