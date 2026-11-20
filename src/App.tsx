import { useCallback, useEffect, useMemo, useState } from 'react';
import { AuthScreen } from './components/AuthScreen';
import { CreatePostScreen } from './components/CreatePostScreen';
import { HomeFeedScreen } from './components/HomeFeedScreen';
import { NavigationShell } from './components/NavigationShell';
import { OnboardingScreen } from './components/OnboardingScreen';
import { SettingsScreen } from './components/SettingsScreen';
import { SplashScreen } from './components/SplashScreen';
import { DEFAULT_API_META } from './data/seedPosts';
import { useTheme } from './hooks/useTheme';
import {
  ApiError,
  blockUser,
  fetchBlockedUsers,
  fetchCurrentUser,
  fetchMeta,
  fetchMyReports,
  fetchNotifications,
  fetchPostById,
  fetchPosts,
  logoutAccount,
  markNotificationRead,
  unblockUser,
  updateUserSettings,
} from './services/xpressitApi';
import {
  ApiBlockedUser,
  ApiMeta,
  ApiNotification,
  ApiPost,
  ApiReportItem,
  ApiUserSettings,
  FeedSortMode,
  LocalVoicePreferences,
  PostCategory,
  ScreenRoute,
  ThemeMode,
  UserSession,
} from './types/xpressit';

const SESSION_KEY = 'xpressit_api_session_v1';
const HANDLE_HINT_KEY = 'xpressit_handle_hint_v1';
const SAVED_IDS_KEY = 'xpressit_saved_ids_v1';
const LOCAL_PRIVACY_KEY = 'xpressit_local_privacy_v1';

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export default function App() {
  const { theme, setTheme, toggleQuickTheme } = useTheme();

  const [meta, setMeta] = useState<ApiMeta>(DEFAULT_API_META);
  const [session, setSession] = useState<UserSession | null>(() =>
    readJson<UserSession | null>(SESSION_KEY, null),
  );
  const [savedHandleHint, setSavedHandleHint] = useState<string | null>(() =>
    localStorage.getItem(HANDLE_HINT_KEY),
  );
  const [route, setRoute] = useState<ScreenRoute>('splash');

  // Feed & query state
  const [posts, setPosts] = useState<ApiPost[]>([]);
  const [feedMode, setFeedMode] = useState<FeedSortMode>('latest');
  const [savedOnly, setSavedOnly] = useState(false);
  const [activeCategory, setActiveCategory] = useState<PostCategory | ''>('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [highlightedPost, setHighlightedPost] = useState<ApiPost | null>(null);

  // Local device bookmarks & audio/EXIF guards
  const [savedIds, setSavedIds] = useState<string[]>(() =>
    readJson<string[]>(SAVED_IDS_KEY, []),
  );
  const [localPrivacy, setLocalPrivacy] = useState<LocalVoicePreferences>(() =>
    readJson<LocalVoicePreferences>(LOCAL_PRIVACY_KEY, {
      voiceMasking: true,
      metadataStripping: true,
    }),
  );

  // Account-linked data
  const [notifications, setNotifications] = useState<ApiNotification[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [blockedUsers, setBlockedUsers] = useState<ApiBlockedUser[]>([]);
  const [myReports, setMyReports] = useState<ApiReportItem[]>([]);
  const [createMode, setCreateMode] = useState<'text' | 'voice'>('text');

  // Persist session, bookmarks, local privacy
  useEffect(() => {
    try {
      if (session) {
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      } else {
        localStorage.removeItem(SESSION_KEY);
      }
    } catch {
      // ignore storage quota errors
    }
  }, [session]);

  useEffect(() => {
    try {
      localStorage.setItem(SAVED_IDS_KEY, JSON.stringify(savedIds));
    } catch {
      // ignore
    }
  }, [savedIds]);

  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_PRIVACY_KEY, JSON.stringify(localPrivacy));
    } catch {
      // ignore
    }
  }, [localPrivacy]);

  // Fetch public server meta on startup
  useEffect(() => {
    fetchMeta()
      .then((serverMeta) => setMeta(serverMeta))
      .catch(() => {
        // Keep DEFAULT_API_META fallback cleanly
      });
  }, []);

  const handleSessionExpired = useCallback(() => {
    setSession(null);
    setPosts([]);
    setNotifications([]);
    setBlockedUsers([]);
    setMyReports([]);
    setRoute('auth');
  }, []);

  // Load feed posts when authenticated and filters change
  const loadFeed = useCallback(
    async (
      token: string,
      targetMode: FeedSortMode,
      targetCategory: PostCategory | '',
      targetPage = 1,
      append = false,
    ) => {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoadingFeed(true);
      }
      try {
        const res = await fetchPosts(token, {
          feed: targetMode,
          category: targetCategory,
          page: targetPage,
          limit: 20,
        });
        setPosts((prev) => (append ? [...prev, ...res.data] : res.data));
        setPage(res.pagination.page);
        setHasMore(res.pagination.hasMore);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          handleSessionExpired();
        }
      } finally {
        setLoadingFeed(false);
        setLoadingMore(false);
      }
    },
    [handleSessionExpired],
  );

  // Sync user profile, theme, notifications, blocks, reports, and deep-linked post once confirmed
  useEffect(() => {
    if (!session || !session.user.confirmed) return;
    const token = session.token;

    fetchCurrentUser(token)
      .then((freshUser) => {
        setSession((prev) => (prev ? { ...prev, user: freshUser } : prev));
        if (freshUser.settings?.theme) {
          setTheme(freshUser.settings.theme);
        }
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          handleSessionExpired();
        }
      });

    fetchNotifications(token, 1, 20)
      .then((res) => {
        setNotifications(res.data);
        setUnreadNotifications(res.unreadCount);
      })
      .catch(() => {});

    fetchBlockedUsers(token)
      .then((list) => setBlockedUsers(list))
      .catch(() => {});

    fetchMyReports(token)
      .then((list) => setMyReports(list))
      .catch(() => {});

    const params = new URLSearchParams(window.location.search);
    const sharedPostId = params.get('post');
    if (sharedPostId) {
      fetchPostById(token, sharedPostId)
        .then((post) => setHighlightedPost(post))
        .catch(() => {});
    }
  }, [session?.token, session?.user.confirmed, setTheme, handleSessionExpired]);

  // Reload feed whenever feedMode or activeCategory changes on confirmed session
  useEffect(() => {
    if (!session || !session.user.confirmed) return;
    loadFeed(session.token, feedMode, activeCategory, 1, false);
  }, [session?.token, session?.user.confirmed, feedMode, activeCategory, loadFeed]);

  const savedPosts = useMemo(
    () => posts.filter((p) => savedIds.includes(p.id)),
    [posts, savedIds],
  );

  const handlePendingCreated = (pending: UserSession) => {
    setSession(pending);
    setSavedHandleHint(pending.user.username);
    try {
      localStorage.setItem(HANDLE_HINT_KEY, pending.user.username);
    } catch {
      // ignore
    }
  };

  const handleAuthenticated = (confirmedSession: UserSession) => {
    setSession(confirmedSession);
    setSavedHandleHint(confirmedSession.user.username);
    try {
      localStorage.setItem(HANDLE_HINT_KEY, confirmedSession.user.username);
    } catch {
      // ignore
    }
    if (confirmedSession.user.settings?.theme) {
      setTheme(confirmedSession.user.settings.theme);
    }
    setRoute('feed');
  };

  const handleSyncTheme = async (nextTheme: ThemeMode) => {
    setTheme(nextTheme);
    if (session?.user.confirmed) {
      try {
        const updatedUser = await updateUserSettings(session.token, { theme: nextTheme });
        setSession((prev) => (prev ? { ...prev, user: updatedUser } : prev));
      } catch {
        // Ignore network transient error after updating local UI theme
      }
    }
  };

  const handleToggleQuickThemeSync = () => {
    const isDark = document.documentElement.classList.contains('dark');
    const nextTheme: ThemeMode = isDark ? 'light' : 'dark';
    handleSyncTheme(nextTheme);
  };

  const handleUpdateServerSettings = async (patch: Partial<ApiUserSettings>) => {
    if (!session) return;
    try {
      const updatedUser = await updateUserSettings(session.token, patch);
      setSession((prev) => (prev ? { ...prev, user: updatedUser } : prev));
      if (patch.categories && feedMode === 'for-you') {
        loadFeed(session.token, 'for-you', activeCategory, 1, false);
      }
      return updatedUser;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleSessionExpired();
      }
    }
  };

  const handleBlockAuthor = async (userId: string, username: string) => {
    if (!session) return;
    await blockUser(session.token, userId);
    setBlockedUsers((prev) =>
      prev.some((b) => b.id === userId) ? prev : [...prev, { id: userId, username }],
    );
    setPosts((prev) => prev.filter((p) => p.author.id !== userId));
    if (highlightedPost?.author.id === userId) {
      setHighlightedPost(null);
    }
  };

  const handleUnblockUser = async (userId: string) => {
    if (!session) return;
    await unblockUser(session.token, userId);
    setBlockedUsers((prev) => prev.filter((b) => b.id !== userId));
    loadFeed(session.token, feedMode, activeCategory, 1, false);
  };

  const handleMarkNotificationRead = async (notificationId: string) => {
    if (!session) return;
    setNotifications((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n)),
    );
    setUnreadNotifications((c) => Math.max(0, c - 1));
    try {
      await markNotificationRead(session.token, notificationId);
    } catch {
      // ignore
    }
  };

  const handleLogout = async () => {
    if (session?.token) {
      await logoutAccount(session.token).catch(() => {});
    }
    setSession(null);
    setPosts([]);
    setNotifications([]);
    setBlockedUsers([]);
    setMyReports([]);
    setHighlightedPost(null);
    setRoute('auth');
  };

  const handleResetDeviceSession = async () => {
    if (session?.token) {
      await logoutAccount(session.token).catch(() => {});
    }
    setSession(null);
    setSavedHandleHint(null);
    setSavedIds([]);
    setPosts([]);
    setNotifications([]);
    setBlockedUsers([]);
    setMyReports([]);
    setHighlightedPost(null);
    try {
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(HANDLE_HINT_KEY);
      localStorage.removeItem(SAVED_IDS_KEY);
    } catch {
      // ignore
    }
    setRoute('splash');
  };

  const isConfirmed = Boolean(session && session.user.confirmed);

  if (route === 'splash') {
    return (
      <SplashScreen
        existingSession={session}
        meta={meta}
        onEnter={() =>
          setRoute(isConfirmed ? 'feed' : session ? 'auth' : 'onboarding')
        }
        onReplayOnboarding={() => setRoute('onboarding')}
        onToggleTheme={toggleQuickTheme}
      />
    );
  }

  if (route === 'onboarding') {
    return (
      <OnboardingScreen
        onSkip={() => setRoute(isConfirmed ? 'feed' : 'auth')}
        onComplete={() => setRoute(isConfirmed ? 'feed' : 'auth')}
        onToggleTheme={toggleQuickTheme}
      />
    );
  }

  if (route === 'auth' || !session || !session.user.confirmed) {
    return (
      <AuthScreen
        pendingSession={session && !session.user.confirmed ? session : null}
        savedHandleHint={savedHandleHint}
        onPendingCreated={handlePendingCreated}
        onAuthenticated={handleAuthenticated}
        onBack={() => setRoute('onboarding')}
        onToggleTheme={toggleQuickTheme}
      />
    );
  }

  return (
    <NavigationShell
      activeRoute={route}
      onNavigate={(next) => setRoute(next)}
      session={session}
      savedCount={savedIds.length}
      metadataStripping={localPrivacy.metadataStripping}
      voiceMasking={localPrivacy.voiceMasking}
      onSelectSavedFilter={() => {
        setSavedOnly(true);
        setRoute('feed');
      }}
    >
      {route === 'feed' && (
        <HomeFeedScreen
          token={session.token}
          meta={meta}
          posts={posts}
          loadingFeed={loadingFeed}
          loadingMore={loadingMore}
          hasMore={hasMore}
          feedMode={feedMode}
          savedOnly={savedOnly}
          activeCategory={activeCategory}
          savedIds={savedIds}
          notifications={notifications}
          unreadNotifications={unreadNotifications}
          highlightedPost={highlightedPost}
          onDismissHighlight={() => {
            setHighlightedPost(null);
            if (window.location.search) {
              window.history.replaceState({}, '', window.location.pathname);
            }
          }}
          onChangeFeedMode={(mode) => setFeedMode(mode)}
          onToggleSavedOnly={(enabled) => setSavedOnly(enabled)}
          onChangeCategory={(cat) => setActiveCategory(cat)}
          onRefreshFeed={() => loadFeed(session.token, feedMode, activeCategory, 1, false)}
          onLoadMore={() => loadFeed(session.token, feedMode, activeCategory, page + 1, true)}
          onPostCreated={(created) => {
            setPosts((prev) => [created, ...prev.filter((p) => p.id !== created.id)]);
          }}
          onPostUpdated={(updated) => {
            setPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
            if (highlightedPost?.id === updated.id) {
              setHighlightedPost(updated);
            }
          }}
          onPostDeleted={(postId) => {
            setPosts((prev) => prev.filter((p) => p.id !== postId));
            setSavedIds((prev) => prev.filter((id) => id !== postId));
            if (highlightedPost?.id === postId) {
              setHighlightedPost(null);
            }
          }}
          onToggleBookmark={(postId) => {
            setSavedIds((prev) =>
              prev.includes(postId) ? prev.filter((id) => id !== postId) : [...prev, postId],
            );
          }}
          onBlockAuthor={handleBlockAuthor}
          onMarkNotificationRead={handleMarkNotificationRead}
          onSessionExpired={handleSessionExpired}
          onToggleTheme={handleToggleQuickThemeSync}
          onOpenCreate={(mode = 'text') => {
            setCreateMode(mode);
            setRoute('create');
          }}
        />
      )}

      {route === 'create' && (
        <CreatePostScreen
          token={session.token}
          username={session.user.username}
          meta={meta}
          initialMode={createMode}
          defaultVoiceMasking={localPrivacy.voiceMasking}
          defaultMetadataStripping={localPrivacy.metadataStripping}
          onCancel={() => {
            setCreateMode('text');
            setRoute('feed');
          }}
          onCreated={(created) => {
            setCreateMode('text');
            setSavedOnly(false);
            setPosts((prev) => [created, ...prev.filter((p) => p.id !== created.id)]);
            setRoute('feed');
          }}
          onSessionExpired={handleSessionExpired}
          onToggleTheme={handleToggleQuickThemeSync}
        />
      )}

      {route === 'settings' && (
        <SettingsScreen
          meta={meta}
          theme={theme}
          onChangeTheme={handleSyncTheme}
          session={session}
          onSessionRotated={(rotated) => setSession(rotated)}
          onUpdateServerSettings={handleUpdateServerSettings}
          localPrivacy={localPrivacy}
          onUpdateLocalPrivacy={(patch) =>
            setLocalPrivacy((prev) => ({ ...prev, ...patch }))
          }
          savedPosts={savedPosts}
          onUnsavePost={(postId) =>
            setSavedIds((prev) => prev.filter((id) => id !== postId))
          }
          blockedUsers={blockedUsers}
          onUnblockUser={handleUnblockUser}
          myReports={myReports}
          onRefreshReports={async () => {
            try {
              const list = await fetchMyReports(session.token);
              setMyReports(list);
            } catch {
              // ignore
            }
          }}
          onLogout={handleLogout}
          onResetDeviceSession={handleResetDeviceSession}
          onSessionExpired={handleSessionExpired}
        />
      )}
    </NavigationShell>
  );
}
