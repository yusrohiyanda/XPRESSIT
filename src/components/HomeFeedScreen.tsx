import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AudioWaveform,
  Bell,
  Bookmark,
  Check,
  Contrast,
  Copy,
  Download,
  Edit3,
  Eye,
  Feather,
  FileText,
  Film,
  Flag,
  HandHeart,
  Heart,
  Image as ImageIcon,
  Loader2,
  LockOpen,
  MessageCircle,
  Mic,
  MoreHorizontal,
  Paperclip,
  Pause,
  Play,
  RefreshCw,
  Repeat2,
  Search,
  Send,
  Share2,
  ShieldAlert,
  Sparkles,
  Trash2,
  VenetianMask,
  X,
} from 'lucide-react';
import {
  CATEGORY_LABELS,
  REACTION_META,
  REPORT_REASONS,
  formatFileSize,
  formatRelativeTime,
} from '../data/seedPosts';
import {
  ApiError,
  addComment,
  createPost,
  deleteComment,
  deletePost,
  fetchAuthenticatedMediaBlobUrl,
  fetchComments,
  removePostReaction,
  reportPost,
  setPostReaction,
  updatePost,
} from '../services/xpressitApi';
import {
  ApiComment,
  ApiMediaItem,
  ApiMeta,
  ApiNotification,
  ApiPost,
  ApiVoiceInfo,
  FeedSortMode,
  PostCategory,
  ReactionType,
  ReportReason,
} from '../types/xpressit';

interface HomeFeedScreenProps {
  token: string;
  meta: ApiMeta;
  posts: ApiPost[];
  loadingFeed: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  feedMode: FeedSortMode;
  savedOnly: boolean;
  activeCategory: PostCategory | '';
  savedIds: string[];
  notifications: ApiNotification[];
  unreadNotifications: number;
  highlightedPost: ApiPost | null;
  onDismissHighlight: () => void;
  onChangeFeedMode: (mode: FeedSortMode) => void;
  onToggleSavedOnly: (enabled: boolean) => void;
  onChangeCategory: (category: PostCategory | '') => void;
  onRefreshFeed: () => void;
  onLoadMore: () => void;
  onPostCreated: (post: ApiPost) => void;
  onPostUpdated: (post: ApiPost) => void;
  onPostDeleted: (postId: string) => void;
  onToggleBookmark: (postId: string) => void;
  onBlockAuthor: (userId: string, username: string) => Promise<void>;
  onMarkNotificationRead: (notificationId: string) => Promise<void>;
  onSessionExpired: () => void;
  onToggleTheme: () => void;
  onOpenCreate: (mode?: 'text' | 'voice') => void;
}

const DEFAULT_WAVE_BARS = [
  38, 66, 90, 52, 80, 94, 46, 72, 88, 42, 64, 90, 74, 46, 68, 82, 50, 34, 62, 44,
];

function formatSeconds(sec: number): string {
  const safe = Math.max(0, Math.floor(sec));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function getVoiceMediaRef(voice: ApiVoiceInfo | null): string | null {
  if (!voice) return null;
  if (voice.url) return voice.url;
  if (typeof voice.media === 'string') return voice.media;
  return voice.media?.url || voice.media?.id || null;
}

function renderAuthorAvatar(post: ApiPost) {
  const hash = post.author.username
    .split('')
    .reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const tones = [
    'from-secondary to-accent',
    'from-primary to-purple-600',
    'from-indigo-500 to-primary',
    'from-accent to-pink-500',
  ];
  const toneClass = tones[hash % tones.length];
  const Icon =
    post.mode === 'voice'
      ? Mic
      : hash % 3 === 0
      ? VenetianMask
      : hash % 3 === 1
      ? Feather
      : Sparkles;

  return (
    <div
      className={`w-10 h-10 rounded-full bg-gradient-to-tr ${toneClass} flex items-center justify-center text-white shadow-sm shrink-0`}
    >
      <Icon className="w-5 h-5" />
    </div>
  );
}

export function HomeFeedScreen({
  token,
  meta,
  posts,
  loadingFeed,
  loadingMore,
  hasMore,
  feedMode,
  savedOnly,
  activeCategory,
  savedIds,
  notifications,
  unreadNotifications,
  highlightedPost,
  onDismissHighlight,
  onChangeFeedMode,
  onToggleSavedOnly,
  onChangeCategory,
  onRefreshFeed,
  onLoadMore,
  onPostCreated,
  onPostUpdated,
  onPostDeleted,
  onToggleBookmark,
  onBlockAuthor,
  onMarkNotificationRead,
  onSessionExpired,
  onToggleTheme,
  onOpenCreate,
}: HomeFeedScreenProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Quick Home Feed Post Composer
  const [quickTitle, setQuickTitle] = useState('');
  const [quickDraft, setQuickDraft] = useState('');
  const [quickCategory, setQuickCategory] = useState<PostCategory>(
    meta.categories.includes('confessions') ? 'confessions' : meta.categories[0] || 'life',
  );
  const [quickExpanded, setQuickExpanded] = useState(false);
  const [quickSubmitting, setQuickSubmitting] = useState(false);

  // Voice playback state (real authenticated streaming via blob URL)
  const [playingPostId, setPlayingPostId] = useState<string | null>(null);
  const [loadingAudioPostId, setLoadingAudioPostId] = useState<string | null>(null);
  const [playbackElapsed, setPlaybackElapsed] = useState<Record<string, number>>({});
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Attachment viewer modal
  const [mediaModal, setMediaModal] = useState<{
    item: ApiMediaItem;
    blobUrl: string | null;
    loading: boolean;
    error: string | null;
  } | null>(null);

  // Comments modal
  const [commentPost, setCommentPost] = useState<ApiPost | null>(null);
  const [comments, setComments] = useState<ApiComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsPage, setCommentsPage] = useState(1);
  const [commentsHasMore, setCommentsHasMore] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);

  // Share modal
  const [sharePost, setSharePost] = useState<ApiPost | null>(null);
  const [repostNote, setRepostNote] = useState('');
  const [repostSubmitting, setRepostSubmitting] = useState(false);
  const [copiedShare, setCopiedShare] = useState(false);

  // Report modal
  const [reportTarget, setReportTarget] = useState<ApiPost | null>(null);
  const [reportReason, setReportReason] = useState<ReportReason>('harassment');
  const [reportDetails, setReportDetails] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);

  // Edit own post modal
  const [editTarget, setEditTarget] = useState<ApiPost | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editCategory, setEditCategory] = useState<PostCategory>('life');
  const [editSubmitting, setEditSubmitting] = useState(false);

  // Delete own post confirmation
  const [deleteTarget, setDeleteTarget] = useState<ApiPost | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  const [menuPostId, setMenuPostId] = useState<string | null>(null);

  const showToast = (msg: string) => setToastMsg(msg);

  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(null), 2800);
    return () => clearTimeout(t);
  }, [toastMsg]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const handleApiError = (err: unknown, fallback: string) => {
    if (err instanceof ApiError && err.status === 401) {
      onSessionExpired();
      return;
    }
    showToast(err instanceof ApiError ? err.message : fallback);
  };

  // Real authenticated audio playback
  const handleTogglePlay = async (post: ApiPost) => {
    const mediaRef = getVoiceMediaRef(post.voice);
    if (!mediaRef) {
      showToast('Voice clip unavailable.');
      return;
    }

    if (playingPostId === post.id) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setPlayingPostId(null);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    setLoadingAudioPostId(post.id);
    try {
      const blobUrl = await fetchAuthenticatedMediaBlobUrl(token, mediaRef);
      const audio = new Audio(blobUrl);
      audioRef.current = audio;

      audio.ontimeupdate = () => {
        setPlaybackElapsed((prev) => ({ ...prev, [post.id]: Math.floor(audio.currentTime) }));
      };
      audio.onended = () => {
        setPlayingPostId(null);
        setPlaybackElapsed((prev) => ({ ...prev, [post.id]: 0 }));
      };
      audio.onerror = () => {
        setPlayingPostId(null);
        showToast('Could not play voice audio format in this browser.');
      };

      await audio.play();
      setPlayingPostId(post.id);
    } catch (err) {
      handleApiError(err, 'Unable to stream encrypted voice audio.');
    } finally {
      setLoadingAudioPostId(null);
    }
  };

  // Open evidence attachment with Bearer auth
  const handleOpenAttachment = async (item: ApiMediaItem) => {
    setMediaModal({ item, blobUrl: null, loading: true, error: null });
    try {
      const blobUrl = await fetchAuthenticatedMediaBlobUrl(token, item.url || item.id);
      setMediaModal({ item, blobUrl, loading: false, error: null });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onSessionExpired();
        return;
      }
      setMediaModal({
        item,
        blobUrl: null,
        loading: false,
        error: err instanceof ApiError ? err.message : 'Unable to load evidence file.',
      });
    }
  };

  // Toggle reaction (`support`, `resonate`, `love`)
  const handleToggleReaction = async (post: ApiPost, type: ReactionType) => {
    const removing = post.myReaction === type;
    try {
      const updated = removing
        ? await removePostReaction(token, post.id)
        : await setPostReaction(token, post.id, type);
      onPostUpdated(updated);
    } catch (err) {
      handleApiError(err, 'Could not update reaction.');
    }
  };

  // Quick Share post to live feed
  const handleQuickPublish = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = quickDraft.trim();
    if (!cleaned || quickSubmitting) return;

    setQuickSubmitting(true);
    try {
      const created = await createPost(token, {
        mode: 'text',
        category: quickCategory,
        ...(quickTitle.trim() ? { title: quickTitle.trim() } : {}),
        content: cleaned,
        attachments: [],
      });
      onPostCreated(created);
      setQuickDraft('');
      setQuickTitle('');
      setQuickExpanded(false);
      showToast('Published anonymously to Home Feed');
    } catch (err) {
      handleApiError(err, 'Failed to publish post.');
    } finally {
      setQuickSubmitting(false);
    }
  };

  // Open & load comments
  const handleOpenComments = async (post: ApiPost) => {
    setCommentPost(post);
    setComments([]);
    setCommentsPage(1);
    setCommentsHasMore(false);
    setCommentDraft('');
    setCommentsLoading(true);
    try {
      const res = await fetchComments(token, post.id, 1, 20);
      setComments(res.data);
      setCommentsHasMore(res.pagination.hasMore);
    } catch (err) {
      handleApiError(err, 'Could not load replies.');
    } finally {
      setCommentsLoading(false);
    }
  };

  const handleLoadMoreComments = async () => {
    if (!commentPost || commentsLoading || !commentsHasMore) return;
    const nextPage = commentsPage + 1;
    setCommentsLoading(true);
    try {
      const res = await fetchComments(token, commentPost.id, nextPage, 20);
      setComments((prev) => [...prev, ...res.data]);
      setCommentsPage(nextPage);
      setCommentsHasMore(res.pagination.hasMore);
    } catch (err) {
      handleApiError(err, 'Could not load older replies.');
    } finally {
      setCommentsLoading(false);
    }
  };

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentPost || !commentDraft.trim() || commentSubmitting) return;
    setCommentSubmitting(true);
    try {
      const created = await addComment(token, commentPost.id, commentDraft.trim());
      setComments((prev) => [created, ...prev]);
      setCommentDraft('');
      const updatedCount = commentPost.commentCount + 1;
      const updated = { ...commentPost, commentCount: updatedCount };
      setCommentPost(updated);
      onPostUpdated(updated);
    } catch (err) {
      handleApiError(err, 'Could not post comment.');
    } finally {
      setCommentSubmitting(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!commentPost) return;
    try {
      await deleteComment(token, commentPost.id, commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      const updated = {
        ...commentPost,
        commentCount: Math.max(0, commentPost.commentCount - 1),
      };
      setCommentPost(updated);
      onPostUpdated(updated);
      showToast('Reply deleted');
    } catch (err) {
      handleApiError(err, 'Could not delete reply.');
    }
  };

  // Share helpers
  const buildShareLink = (post: ApiPost) => {
    return `${window.location.origin}/?post=${encodeURIComponent(post.id)}`;
  };

  const handleCopyShareQuote = async (post: ApiPost) => {
    const snippet = post.content || post.title || 'Voice expression on XPRESSIT';
    const shareText = `${post.author.username} (${CATEGORY_LABELS[post.category] || post.category}) on XPRESSIT:\n"${snippet}"\n${buildShareLink(post)}`;
    try {
      await navigator.clipboard.writeText(shareText);
    } catch {
      // Ignore if clipboard permission blocked
    }
    setCopiedShare(true);
    showToast('Share link & excerpt copied');
  };

  const handleNativeShare = async (post: ApiPost) => {
    const snippet = post.content || post.title || 'Listen to an anonymous voice note';
    if (navigator.share) {
      try {
        await navigator.share({
          title: `XPRESSIT · ${post.author.username}`,
          text: `${post.author.username}: "${snippet}"`,
          url: buildShareLink(post),
        });
        setSharePost(null);
        showToast('Shared');
        return;
      } catch {
        // User canceled or unsupported
      }
    }
    await handleCopyShareQuote(post);
  };

  const handleRepostToFeed = async (post: ApiPost) => {
    if (repostSubmitting) return;
    setRepostSubmitting(true);
    try {
      const note = repostNote.trim();
      const sourceText = post.content || post.title || '[Voice Experience]';
      const quotedBlock = `Shared from @${post.author.username} (${CATEGORY_LABELS[post.category] || post.category}):\n"${sourceText}"`;
      const fullContent = note ? `${note}\n\n— ${quotedBlock}` : quotedBlock;

      const created = await createPost(token, {
        mode: 'text',
        category: post.category,
        ...(post.title ? { title: `Re: ${post.title}`.slice(0, meta.limits.titleCharacters) } : {}),
        content: fullContent.slice(0, meta.limits.textCharacters),
        attachments: [],
      });
      onPostCreated(created);
      setSharePost(null);
      setRepostNote('');
      showToast('Shared anonymously to Home Feed');
    } catch (err) {
      handleApiError(err, 'Could not share to Home Feed.');
    } finally {
      setRepostSubmitting(false);
    }
  };

  // Report post
  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportTarget || reportSubmitting) return;
    setReportSubmitting(true);
    try {
      await reportPost(token, reportTarget.id, reportReason, reportDetails.trim() || undefined);
      setReportTarget(null);
      setReportDetails('');
      showToast('Report submitted for review');
    } catch (err) {
      handleApiError(err, 'Could not submit report.');
    } finally {
      setReportSubmitting(false);
    }
  };

  // Edit own post
  const openEditModal = (post: ApiPost) => {
    setEditTarget(post);
    setEditTitle(post.title || '');
    setEditContent(post.content || '');
    setEditCategory(post.category);
    setMenuPostId(null);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget || editSubmitting) return;
    if (editTarget.mode === 'text' && !editContent.trim()) {
      showToast('Text post content cannot be empty.');
      return;
    }

    setEditSubmitting(true);
    try {
      const attachmentIds = editTarget.attachments.map((a) => a.id);
      const voiceId =
        editTarget.voice &&
        (typeof editTarget.voice.media === 'string'
          ? editTarget.voice.media
          : editTarget.voice.media.id);

      const updated = await updatePost(token, editTarget.id, {
        mode: editTarget.mode,
        category: editCategory,
        ...(editTitle.trim() ? { title: editTitle.trim() } : {}),
        ...(editContent.trim() ? { content: editContent.trim() } : {}),
        ...(editTarget.mode === 'voice' && voiceId && editTarget.voice
          ? { voice: { media: voiceId, duration: editTarget.voice.duration } }
          : {}),
        attachments: attachmentIds,
      });
      onPostUpdated(updated);
      setEditTarget(null);
      showToast('Post updated');
    } catch (err) {
      handleApiError(err, 'Could not update post.');
    } finally {
      setEditSubmitting(false);
    }
  };

  // Delete own post
  const handleConfirmDelete = async () => {
    if (!deleteTarget || deleteSubmitting) return;
    setDeleteSubmitting(true);
    try {
      await deletePost(token, deleteTarget.id);
      onPostDeleted(deleteTarget.id);
      setDeleteTarget(null);
      showToast('Post permanently deleted');
    } catch (err) {
      handleApiError(err, 'Could not delete post.');
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const filteredPosts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return posts.filter((post) => {
      if (savedOnly && !savedIds.includes(post.id)) return false;
      if (!q) return true;
      return (
        (post.content || '').toLowerCase().includes(q) ||
        (post.title || '').toLowerCase().includes(q) ||
        post.author.username.toLowerCase().includes(q) ||
        post.category.toLowerCase().includes(q)
      );
    });
  }, [posts, savedOnly, savedIds, searchQuery]);

  const renderPostCard = (post: ApiPost, isHighlighted = false) => {
    const isPlaying = playingPostId === post.id;
    const isAudioLoading = loadingAudioPostId === post.id;
    const elapsed = playbackElapsed[post.id] ?? 0;
    const duration = post.voice?.duration ?? 0;
    const progressRatio = duration > 0 ? Math.min(1, elapsed / duration) : 0;
    const bookmarked = savedIds.includes(post.id);

    return (
      <article
        key={post.id}
        className={`bg-light-surface-card dark:bg-dark-surface-card rounded-2xl p-4 border shadow-sm relative ${
          isHighlighted
            ? 'border-primary ring-2 ring-primary/25'
            : 'border-light-outline dark:border-dark-outline'
        }`}
      >
        {isHighlighted && (
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-light-outline-subtle dark:border-dark-outline-subtle">
            <span className="text-xs font-label font-bold text-primary dark:text-secondary">
              Shared Reflection Link
            </span>
            <button
              type="button"
              onClick={onDismissHighlight}
              className="text-xs font-label text-light-text-muted hover:text-primary cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Card Header */}
        <header className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3 min-w-0">
            {renderAuthorAvatar(post)}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-label text-sm font-bold text-light-on-surface dark:text-dark-on-surface truncate">
                  {post.author.username}
                </span>
                {post.isMine && (
                  <span className="text-[11px] font-mono text-success font-semibold">(You)</span>
                )}
                <span className="text-xs font-medium text-primary dark:text-secondary">
                  · {CATEGORY_LABELS[post.category] || post.category}
                </span>
              </div>
              <p className="font-body text-xs text-light-text-muted dark:text-dark-text-muted">
                {formatRelativeTime(post.createdAt)} ·{' '}
                {post.mode === 'voice'
                  ? 'Voice Experience'
                  : post.attachments.length > 0
                  ? 'Text & Evidence'
                  : 'Text Story'}
              </p>
            </div>
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuPostId(menuPostId === post.id ? null : post.id)}
              className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-full text-light-text-muted dark:text-dark-text-muted hover:text-primary cursor-pointer"
              aria-label="Post options"
            >
              <MoreHorizontal className="w-5 h-5" />
            </button>

            {menuPostId === post.id && (
              <div className="absolute right-0 top-9 w-48 rounded-xl bg-light-surface-card dark:bg-dark-surface-card border border-light-outline dark:border-dark-outline shadow-xl py-1 z-20">
                {post.isMine ? (
                  <>
                    <button
                      type="button"
                      onClick={() => openEditModal(post)}
                      className="w-full px-3.5 py-2 text-left text-xs font-label font-medium text-light-on-surface dark:text-dark-on-surface hover:bg-primary/10 flex items-center gap-2 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-primary dark:text-secondary" />
                      <span>Edit Experience</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteTarget(post);
                        setMenuPostId(null);
                      }}
                      className="w-full px-3.5 py-2 text-left text-xs font-label font-medium text-danger hover:bg-danger/10 flex items-center gap-2 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete Permanently</span>
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setReportTarget(post);
                        setReportReason('harassment');
                        setReportDetails('');
                        setMenuPostId(null);
                      }}
                      className="w-full px-3.5 py-2 text-left text-xs font-label font-medium text-light-on-surface dark:text-dark-on-surface hover:bg-danger/10 flex items-center gap-2 cursor-pointer"
                    >
                      <Flag className="w-3.5 h-3.5 text-warning" />
                      <span>Report Post</span>
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        setMenuPostId(null);
                        try {
                          await onBlockAuthor(post.author.id, post.author.username);
                          showToast(`Blocked ${post.author.username}`);
                        } catch (err) {
                          handleApiError(err, 'Could not block user.');
                        }
                      }}
                      className="w-full px-3.5 py-2 text-left text-xs font-label font-medium text-danger hover:bg-danger/10 flex items-center gap-2 cursor-pointer"
                    >
                      <ShieldAlert className="w-3.5 h-3.5" />
                      <span>Block {post.author.username}</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </header>

        {/* Optional Title */}
        {post.title && (
          <h3 className="font-headline text-base font-bold text-light-on-surface dark:text-dark-on-surface mb-1.5">
            {post.title}
          </h3>
        )}

        {/* Body Copy */}
        {post.content && (
          <p className="font-body text-sm text-light-on-surface dark:text-dark-on-surface mb-3 leading-relaxed whitespace-pre-line">
            {post.content}
          </p>
        )}

        {/* Voice Player Waveform */}
        {post.voice && (
          <div className="p-3.5 rounded-xl bg-light-surface-card-subtle dark:bg-dark-surface-card-subtle border border-light-outline-subtle dark:border-dark-outline-subtle mb-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => handleTogglePlay(post)}
                disabled={isAudioLoading}
                className="w-11 h-11 rounded-full bg-primary hover:bg-primary-light disabled:opacity-60 text-white flex items-center justify-center shrink-0 shadow-md transition-transform active:scale-95 cursor-pointer"
                aria-label={isPlaying ? 'Pause recording' : 'Play recording'}
              >
                {isAudioLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : isPlaying ? (
                  <Pause className="w-5 h-5" />
                ) : (
                  <Play className="w-5 h-5 ml-0.5" />
                )}
              </button>

              <div className="flex-1 flex flex-col justify-center min-w-0">
                <div className="flex items-center gap-1 h-8">
                  {DEFAULT_WAVE_BARS.map((heightPct, idx) => {
                    const barThreshold = idx / DEFAULT_WAVE_BARS.length;
                    const isActiveBar = isPlaying
                      ? barThreshold <= progressRatio || idx % 3 === 0
                      : barThreshold <= progressRatio;
                    return (
                      <span
                        key={idx}
                        style={{ height: `${heightPct}%` }}
                        className={`flex-1 max-w-[5px] rounded-full transition-colors ${
                          isActiveBar
                            ? 'bg-accent'
                            : 'bg-primary/45 dark:bg-secondary/40'
                        } ${isPlaying ? 'animate-wave-bar' : ''}`}
                      />
                    );
                  })}
                </div>
                <div className="flex items-center justify-between mt-1.5 text-[11px] font-mono tabular-nums text-light-text-muted dark:text-dark-text-muted">
                  <span>
                    {formatSeconds(elapsed)} / {formatSeconds(duration)}
                  </span>
                  <span>Encrypted Audio Stream</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Evidence Attachment Previews (0–5 items) */}
        {post.attachments && post.attachments.length > 0 && (
          <div className="flex flex-col gap-2 mb-3">
            {post.attachments.map((att) => (
              <div
                key={att.id}
                className="p-3 rounded-xl bg-light-surface-card-subtle dark:bg-dark-surface-card-subtle border border-light-outline dark:border-dark-outline flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary dark:text-secondary flex items-center justify-center shrink-0">
                    {att.kind === 'image' ? (
                      <ImageIcon className="w-4 h-4" />
                    ) : att.kind === 'video' ? (
                      <Film className="w-4 h-4" />
                    ) : (
                      <FileText className="w-4 h-4 text-danger" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <span className="font-label text-xs font-semibold text-light-on-surface dark:text-dark-on-surface truncate block">
                      {att.originalName || att.filename || `${att.kind}_evidence`}
                    </span>
                    <p className="text-[11px] text-light-text-muted dark:text-dark-text-muted truncate">
                      {formatFileSize(att.size)} · {att.kind.toUpperCase()}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleOpenAttachment(att)}
                  className="px-3 py-1.5 rounded-lg bg-light-surface dark:bg-dark-surface border border-light-outline dark:border-dark-outline hover:border-primary text-xs font-label font-semibold flex items-center gap-1 text-primary dark:text-secondary shrink-0 cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>View</span>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Card Action Footer */}
        <footer className="flex items-center justify-between gap-2 pt-3 border-t border-light-outline-subtle dark:border-dark-outline-subtle text-light-text-muted dark:text-dark-text-muted flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            {(meta.reactions || ['support', 'resonate', 'love']).map((rType) => {
              const isActive = post.myReaction === rType;
              const count = post.reactions?.[rType] ?? 0;
              const style = REACTION_META[rType];
              const RIcon =
                rType === 'love'
                  ? Heart
                  : rType === 'resonate'
                  ? Sparkles
                  : HandHeart;

              return (
                <button
                  key={rType}
                  type="button"
                  onClick={() => handleToggleReaction(post, rType)}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full border text-xs font-label font-semibold transition-all cursor-pointer ${
                    isActive
                      ? `${style.activeBg} ${style.activeText}`
                      : 'border-transparent hover:border-light-outline dark:hover:border-dark-outline hover:text-light-on-surface dark:hover:text-dark-on-surface'
                  }`}
                  title={style.label}
                  aria-label={`${style.label} (${count})`}
                >
                  <RIcon
                    className={`w-3.5 h-3.5 ${
                      isActive && rType === 'love' ? 'fill-accent text-accent' : ''
                    }`}
                  />
                  <span className="tabular-nums">{count}</span>
                  <span className="hidden sm:inline text-[11px]">{style.label}</span>
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => handleOpenComments(post)}
              className="flex items-center gap-1.5 hover:text-primary dark:hover:text-secondary transition-colors min-h-[34px] px-2 cursor-pointer"
              aria-label="Open replies"
            >
              <MessageCircle className="w-4 h-4" />
              <span className="font-label text-xs font-semibold tabular-nums">
                {post.commentCount}
              </span>
            </button>
          </div>

          <div className="flex items-center gap-1 ml-auto">
            <button
              type="button"
              onClick={() => onToggleBookmark(post.id)}
              title={bookmarked ? 'Saved' : 'Save'}
              aria-label="Bookmark post"
              className={`min-h-[36px] min-w-[36px] flex items-center justify-center rounded-full transition-colors cursor-pointer ${
                bookmarked
                  ? 'text-primary dark:text-secondary'
                  : 'hover:text-primary dark:hover:text-secondary'
              }`}
            >
              <Bookmark
                className={`w-4 h-4 ${
                  bookmarked ? 'fill-primary dark:fill-secondary' : ''
                }`}
              />
            </button>

            <button
              type="button"
              onClick={() => {
                setSharePost(post);
                setRepostNote('');
                setCopiedShare(false);
              }}
              title="Share Anonymously"
              aria-label="Share anonymously"
              className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-full hover:text-primary dark:hover:text-secondary transition-colors cursor-pointer"
            >
              <Share2 className="w-4 h-4" />
            </button>

            {!post.isMine && (
              <button
                type="button"
                onClick={() => {
                  setReportTarget(post);
                  setReportReason('harassment');
                  setReportDetails('');
                }}
                title="Report"
                aria-label="Report post"
                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-full hover:text-danger transition-colors cursor-pointer"
              >
                <Flag className="w-4 h-4" />
              </button>
            )}
          </div>
        </footer>
      </article>
    );
  };

  return (
    <div className="flex flex-col flex-1 w-full">
      {/* Sticky Top Header */}
      <header className="sticky top-0 z-30 bg-light-surface/90 dark:bg-dark-surface/90 backdrop-blur-md border-b border-light-outline-subtle dark:border-dark-outline-subtle px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5 lg:hidden">
          <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-primary to-secondary flex items-center justify-center text-white shadow-sm">
            <AudioWaveform className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-headline font-extrabold text-base tracking-tight leading-none">
              XPRESS<span className="text-accent">IT</span>
            </h1>
            <p className="text-[10px] text-light-text-muted dark:text-dark-text-muted font-label uppercase tracking-wider">
              Anonymous Realm
            </p>
          </div>
        </div>

        <div className="hidden lg:flex items-center gap-2">
          <h1 className="font-headline font-extrabold text-base tracking-tight">
            {savedOnly
              ? 'Saved Reflections'
              : activeCategory
              ? CATEGORY_LABELS[activeCategory] || activeCategory
              : feedMode === 'trending'
              ? 'Trending Expressions'
              : feedMode === 'for-you'
              ? 'For You Feed'
              : 'Latest Community Feed'}
          </h1>
          <span className="text-xs text-light-text-muted dark:text-dark-text-muted tabular-nums">
            · {filteredPosts.length} loaded
          </span>
        </div>

        {/* Top Action Icons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRefreshFeed}
            disabled={loadingFeed}
            className="w-10 h-10 rounded-full bg-light-surface-card dark:bg-dark-surface-card border border-light-outline dark:border-dark-outline text-light-text-muted hover:text-primary dark:text-dark-text-muted dark:hover:text-secondary flex items-center justify-center shadow-sm transition-colors cursor-pointer"
            title="Refresh Feed"
            aria-label="Refresh Feed"
          >
            <RefreshCw className={`w-4 h-4 ${loadingFeed ? 'animate-spin text-primary' : ''}`} />
          </button>

          <button
            type="button"
            onClick={onToggleTheme}
            className="w-10 h-10 rounded-full bg-light-surface-card dark:bg-dark-surface-card border border-light-outline dark:border-dark-outline text-primary dark:text-secondary flex items-center justify-center shadow-sm hover:border-primary transition-colors cursor-pointer"
            title="Toggle Theme"
            aria-label="Toggle Theme"
          >
            <Contrast className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => {
              setSearchOpen((o) => !o);
              setNotificationsOpen(false);
            }}
            className={`w-10 h-10 rounded-full border flex items-center justify-center transition-colors cursor-pointer ${
              searchOpen
                ? 'bg-primary text-white border-primary'
                : 'bg-light-surface-card dark:bg-dark-surface-card border-light-outline dark:border-dark-outline text-light-on-surface dark:text-dark-on-surface hover:border-primary'
            }`}
            aria-label="Search feed"
          >
            <Search className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => {
              setNotificationsOpen((o) => !o);
              setSearchOpen(false);
            }}
            className="w-10 h-10 rounded-full bg-light-surface-card dark:bg-dark-surface-card border border-light-outline dark:border-dark-outline text-light-on-surface dark:text-dark-on-surface flex items-center justify-center relative hover:border-primary transition-colors cursor-pointer"
            aria-label="Notifications"
          >
            <Bell className="w-4 h-4" />
            {unreadNotifications > 0 && (
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-accent" />
            )}
          </button>
        </div>
      </header>

      {/* Expandable Search Drawer */}
      {searchOpen && (
        <div className="px-4 py-2.5 bg-light-surface-card dark:bg-dark-surface-card border-b border-light-outline dark:border-dark-outline">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-light-text-muted dark:text-dark-text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search titles, stories, handles..."
              className="w-full pl-10 pr-9 py-2.5 rounded-xl bg-light-surface dark:bg-dark-surface border border-light-outline dark:border-dark-outline text-sm focus:outline-none focus:border-primary"
              autoFocus
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-2.5 text-light-text-muted hover:text-primary cursor-pointer"
                aria-label="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Notifications Popover Panel */}
      {notificationsOpen && (
        <div className="px-4 py-3 bg-light-surface-card dark:bg-dark-surface-card border-b border-light-outline dark:border-dark-outline flex flex-col gap-2 max-h-72 overflow-y-auto">
          <div className="flex items-center justify-between">
            <span className="font-label text-xs font-bold text-light-on-surface dark:text-dark-on-surface">
              Activity Notifications ({unreadNotifications} unread)
            </span>
            <button
              type="button"
              onClick={() => setNotificationsOpen(false)}
              className="text-xs text-light-text-muted hover:text-primary cursor-pointer"
            >
              Close
            </button>
          </div>
          {notifications.length === 0 ? (
            <p className="text-xs text-light-text-muted dark:text-dark-text-muted py-3 text-center">
              No notifications yet. Reactions and replies on your stories appear here.
            </p>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => {
                  if (!n.read) onMarkNotificationRead(n.id);
                }}
                className={`w-full text-left p-2.5 rounded-xl border flex items-start justify-between gap-3 transition-colors cursor-pointer ${
                  n.read
                    ? 'bg-light-surface-card-subtle dark:bg-dark-surface-card-subtle border-light-outline-subtle dark:border-dark-outline-subtle opacity-80'
                    : 'bg-primary/5 dark:bg-primary/15 border-primary/30'
                }`}
              >
                <div className="min-w-0">
                  <p className="font-label text-xs font-semibold text-light-on-surface dark:text-dark-on-surface">
                    {n.title || n.message || 'Activity on your expression'}
                  </p>
                  {n.title && n.message && (
                    <p className="text-xs text-light-text-muted dark:text-dark-text-muted mt-0.5">
                      {n.message}
                    </p>
                  )}
                </div>
                <span className="text-[11px] text-light-text-muted dark:text-dark-text-muted shrink-0">
                  {formatRelativeTime(n.createdAt)}
                </span>
              </button>
            ))
          )}
        </div>
      )}

      {/* Main Scrollable Feed */}
      <main className="flex-1 px-4 py-3 pb-28 lg:pb-10 w-full">
        {/* Feed Mode Switcher (Latest / Trending / For You / Saved) */}
        <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-light-surface-card-subtle dark:bg-dark-surface-card-subtle border border-light-outline-subtle dark:border-dark-outline-subtle mb-2">
          {(
            [
              { id: 'latest', label: 'Latest' },
              { id: 'trending', label: 'Trending' },
              { id: 'for-you', label: 'For You' },
            ] as const
          ).map((modeTab) => {
            const active = !savedOnly && feedMode === modeTab.id;
            return (
              <button
                key={modeTab.id}
                type="button"
                onClick={() => {
                  onToggleSavedOnly(false);
                  onChangeFeedMode(modeTab.id);
                }}
                className={`flex-1 py-2 rounded-xl font-label text-xs font-bold transition-all cursor-pointer ${
                  active
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-light-text-muted dark:text-dark-text-muted hover:text-light-on-surface dark:hover:text-dark-on-surface'
                }`}
              >
                {modeTab.label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => onToggleSavedOnly(!savedOnly)}
            className={`px-3 py-2 rounded-xl font-label text-xs font-bold flex items-center gap-1 transition-all cursor-pointer ${
              savedOnly
                ? 'bg-primary text-white shadow-sm'
                : 'text-light-text-muted dark:text-dark-text-muted hover:text-primary'
            }`}
          >
            <Bookmark className="w-3.5 h-3.5" />
            <span>Saved</span>
          </button>
        </div>

        {/* Category Filter Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-2 mb-3">
          <button
            type="button"
            onClick={() => {
              onToggleSavedOnly(false);
              onChangeCategory('');
            }}
            className={`px-4 py-1.5 rounded-full font-label text-xs whitespace-nowrap shrink-0 transition-all cursor-pointer ${
              activeCategory === '' && !savedOnly
                ? 'bg-primary text-white font-bold shadow-sm'
                : 'bg-light-surface-card dark:bg-dark-surface-card border border-light-outline dark:border-dark-outline text-light-text-muted dark:text-dark-text-muted hover:text-primary font-medium'
            }`}
          >
            All Topics
          </button>
          {meta.categories.map((cat) => {
            const active = activeCategory === cat && !savedOnly;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => {
                  onToggleSavedOnly(false);
                  onChangeCategory(cat);
                }}
                className={`px-4 py-1.5 rounded-full font-label text-xs whitespace-nowrap shrink-0 transition-all cursor-pointer ${
                  active
                    ? 'bg-primary text-white font-bold shadow-sm'
                    : 'bg-light-surface-card dark:bg-dark-surface-card border border-light-outline dark:border-dark-outline text-light-text-muted dark:text-dark-text-muted hover:text-primary font-medium'
                }`}
              >
                {CATEGORY_LABELS[cat] || cat}
              </button>
            );
          })}
        </div>

        {/* Inline Quick Share Composer on Home Feed */}
        <form
          onSubmit={handleQuickPublish}
          className="bg-light-surface-card dark:bg-dark-surface-card rounded-2xl p-3.5 border border-light-outline dark:border-dark-outline shadow-sm mb-4"
        >
          {quickExpanded && (
            <input
              type="text"
              maxLength={meta.limits.titleCharacters}
              value={quickTitle}
              onChange={(e) => setQuickTitle(e.target.value)}
              placeholder="Optional title..."
              className="w-full px-2 pb-2 mb-2 border-b border-light-outline-subtle dark:border-dark-outline-subtle bg-transparent text-sm font-headline font-bold focus:outline-none"
            />
          )}
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-primary to-secondary flex items-center justify-center text-white shrink-0 mt-0.5">
              <VenetianMask className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <textarea
                rows={quickExpanded || quickDraft ? 3 : 1}
                maxLength={meta.limits.textCharacters}
                value={quickDraft}
                onFocus={() => setQuickExpanded(true)}
                onChange={(e) => setQuickDraft(e.target.value)}
                placeholder="Share a thought, secret, or confession on the feed..."
                className="w-full bg-transparent border-0 p-1 text-sm text-light-on-surface dark:text-dark-on-surface placeholder:text-light-text-muted dark:placeholder:text-dark-text-muted focus:outline-none resize-none leading-relaxed"
              />
            </div>
          </div>

          {(quickExpanded || quickDraft) && (
            <div className="mt-2.5 pt-2.5 border-t border-light-outline-subtle dark:border-dark-outline-subtle flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                <select
                  value={quickCategory}
                  onChange={(e) => setQuickCategory(e.target.value as PostCategory)}
                  aria-label="Choose category"
                  className="px-2.5 py-1.5 rounded-lg bg-light-surface-card-subtle dark:bg-dark-surface-card-subtle border border-light-outline dark:border-dark-outline text-xs font-label font-semibold text-light-on-surface dark:text-dark-on-surface focus:outline-none focus:border-primary cursor-pointer"
                >
                  {meta.categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {CATEGORY_LABELS[cat] || cat}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => onOpenCreate('voice')}
                  className="px-2.5 py-1.5 rounded-lg bg-light-surface-card-subtle dark:bg-dark-surface-card-subtle border border-light-outline dark:border-dark-outline text-xs font-label font-semibold text-primary dark:text-secondary hover:border-primary flex items-center gap-1 cursor-pointer"
                  title="Record Masked Voice Post"
                >
                  <Mic className="w-3.5 h-3.5" />
                  <span>Voice</span>
                </button>

                <button
                  type="button"
                  onClick={() => onOpenCreate('text')}
                  className="px-2.5 py-1.5 rounded-lg bg-light-surface-card-subtle dark:bg-dark-surface-card-subtle border border-light-outline dark:border-dark-outline text-xs font-label font-semibold text-light-text-muted dark:text-dark-text-muted hover:text-primary hover:border-primary flex items-center gap-1 cursor-pointer"
                  title="Attach Evidence"
                >
                  <Paperclip className="w-3.5 h-3.5" />
                  <span>Attach</span>
                </button>
              </div>

              <div className="flex items-center gap-2 ml-auto">
                <span className="font-mono text-[11px] tabular-nums text-light-text-muted dark:text-dark-text-muted">
                  {quickDraft.length}/{meta.limits.textCharacters}
                </span>
                <button
                  type="submit"
                  disabled={!quickDraft.trim() || quickSubmitting}
                  className="px-4 py-1.5 rounded-full bg-primary hover:bg-primary-light disabled:opacity-45 text-white font-label text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                >
                  {quickSubmitting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <LockOpen className="w-3.5 h-3.5" />
                  )}
                  <span>{quickSubmitting ? 'Sharing...' : 'Share Post'}</span>
                </button>
              </div>
            </div>
          )}
        </form>

        {/* Highlighted Shared Deep-Link Post */}
        {highlightedPost && <div className="mb-4">{renderPostCard(highlightedPost, true)}</div>}

        {/* Feed Cards */}
        {loadingFeed ? (
          <div className="flex flex-col gap-4 py-2">
            {[1, 2, 3].map((idx) => (
              <div
                key={idx}
                className="bg-light-surface-card dark:bg-dark-surface-card rounded-2xl p-4 border border-light-outline dark:border-dark-outline animate-pulse"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-primary/20" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-32 rounded bg-primary/20" />
                    <div className="h-2.5 w-24 rounded bg-primary/10" />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="h-3 w-full rounded bg-primary/10" />
                  <div className="h-3 w-4/5 rounded bg-primary/10" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredPosts.length === 0 ? (
          <div className="bg-light-surface-card dark:bg-dark-surface-card rounded-2xl p-8 border border-light-outline dark:border-dark-outline text-center my-6">
            <p className="font-headline text-base font-bold mb-1">No matching expressions</p>
            <p className="text-xs text-light-text-muted dark:text-dark-text-muted mb-4">
              {savedOnly
                ? 'Bookmark reflections in the feed to revisit them here.'
                : 'Try changing the feed filter or be the first to share in this topic.'}
            </p>
            <div className="flex items-center justify-center gap-2">
              {(activeCategory || savedOnly || searchQuery) && (
                <button
                  type="button"
                  onClick={() => {
                    onToggleSavedOnly(false);
                    onChangeCategory('');
                    setSearchQuery('');
                  }}
                  className="px-4 py-2 rounded-full border border-light-outline dark:border-dark-outline text-xs font-label font-semibold hover:border-primary cursor-pointer"
                >
                  Show All Posts
                </button>
              )}
              <button
                type="button"
                onClick={() => onOpenCreate('text')}
                className="px-4 py-2 rounded-full bg-primary text-white text-xs font-label font-semibold hover:bg-primary-light cursor-pointer"
              >
                Share Expression
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {filteredPosts.map((post) => renderPostCard(post))}

            {hasMore && !savedOnly && (
              <button
                type="button"
                onClick={onLoadMore}
                disabled={loadingMore}
                className="w-full py-3 rounded-2xl bg-light-surface-card dark:bg-dark-surface-card border border-light-outline dark:border-dark-outline hover:border-primary text-xs font-label font-bold text-primary dark:text-secondary flex items-center justify-center gap-2 cursor-pointer"
              >
                {loadingMore && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{loadingMore ? 'Loading more...' : 'Load Older Expressions'}</span>
              </button>
            )}
          </div>
        )}
      </main>

      {/* Authenticated Evidence Preview Modal */}
      {mediaModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-light-surface-card dark:bg-dark-surface-card border border-light-outline dark:border-dark-outline p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <div className="min-w-0 pr-3">
                <h3 className="font-headline text-base font-bold text-light-on-surface dark:text-dark-on-surface truncate">
                  {mediaModal.item.originalName || mediaModal.item.filename || 'Evidence Attachment'}
                </h3>
                <p className="text-xs text-light-text-muted dark:text-dark-text-muted">
                  {formatFileSize(mediaModal.item.size)} · Authenticated Stream
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMediaModal(null)}
                className="min-h-[36px] min-w-[36px] rounded-full flex items-center justify-center text-light-text-muted hover:text-primary cursor-pointer"
                aria-label="Close evidence preview"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {mediaModal.loading ? (
              <div className="py-16 flex flex-col items-center justify-center gap-2 text-xs text-light-text-muted">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <span>Decrypting attachment stream...</span>
              </div>
            ) : mediaModal.error ? (
              <p className="text-xs text-danger bg-danger/10 border border-danger/25 rounded-xl p-4 mb-3">
                {mediaModal.error}
              </p>
            ) : mediaModal.blobUrl ? (
              <div className="mb-3">
                {mediaModal.item.kind === 'image' && (
                  <img
                    src={mediaModal.blobUrl}
                    alt={mediaModal.item.originalName || 'Attached image'}
                    referrerPolicy="no-referrer"
                    className="w-full max-h-[60vh] object-contain rounded-xl bg-light-surface dark:bg-dark-surface border border-light-outline dark:border-dark-outline"
                  />
                )}
                {mediaModal.item.kind === 'video' && (
                  <video
                    src={mediaModal.blobUrl}
                    controls
                    className="w-full max-h-[60vh] rounded-xl bg-black"
                  />
                )}
                {mediaModal.item.kind === 'document' && (
                  <div className="flex flex-col gap-3">
                    <iframe
                      title={mediaModal.item.originalName || 'PDF Document'}
                      src={mediaModal.blobUrl}
                      className="w-full h-80 rounded-xl border border-light-outline dark:border-dark-outline bg-white"
                    />
                    <a
                      href={mediaModal.blobUrl}
                      download={mediaModal.item.originalName || 'evidence.pdf'}
                      className="w-full py-2.5 rounded-xl border border-primary text-primary dark:text-secondary font-label text-xs font-bold flex items-center justify-center gap-2 hover:bg-primary/5"
                    >
                      <Download className="w-4 h-4" />
                      <span>Download PDF</span>
                    </a>
                  </div>
                )}
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => setMediaModal(null)}
              className="w-full py-2.5 rounded-full bg-primary hover:bg-primary-light text-white font-label text-xs font-bold cursor-pointer"
            >
              Close Preview
            </button>
          </div>
        </div>
      )}

      {/* Anonymous Replies Drawer / Modal */}
      {commentPost && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center sm:p-4">
          <div className="w-full max-w-md rounded-t-3xl sm:rounded-2xl bg-light-surface-card dark:bg-dark-surface-card border border-light-outline dark:border-dark-outline p-5 shadow-2xl max-h-[82vh] flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-headline text-base font-bold">
                  Replies to {commentPost.author.username}
                </h3>
                <p className="text-xs text-light-text-muted dark:text-dark-text-muted tabular-nums">
                  {commentPost.commentCount} anonymous replies
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCommentPost(null)}
                className="min-h-[36px] min-w-[36px] rounded-full flex items-center justify-center text-light-text-muted hover:text-primary cursor-pointer"
                aria-label="Close replies"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto flex flex-col gap-3 py-2">
              {commentsLoading && comments.length === 0 ? (
                <div className="py-8 flex items-center justify-center">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                </div>
              ) : comments.length === 0 ? (
                <p className="text-xs text-light-text-muted dark:text-dark-text-muted py-6 text-center">
                  No replies yet. Offer a supportive anonymous perspective below.
                </p>
              ) : (
                comments.map((c) => (
                  <div
                    key={c.id}
                    className="p-3 rounded-xl bg-light-surface-card-subtle dark:bg-dark-surface-card-subtle border border-light-outline-subtle dark:border-dark-outline-subtle"
                  >
                    <div className="flex items-center justify-between mb-1 gap-2">
                      <span className="font-label text-xs font-bold text-primary dark:text-secondary">
                        {c.author.username}
                        {c.isMine ? ' (You)' : ''}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-light-text-muted dark:text-dark-text-muted">
                          {formatRelativeTime(c.createdAt)}
                        </span>
                        {c.isMine && (
                          <button
                            type="button"
                            onClick={() => handleDeleteComment(c.id)}
                            className="text-light-text-muted hover:text-danger cursor-pointer"
                            title="Delete your reply"
                            aria-label="Delete reply"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-light-on-surface dark:text-dark-on-surface leading-relaxed">
                      {c.content}
                    </p>
                  </div>
                ))
              )}

              {commentsHasMore && (
                <button
                  type="button"
                  onClick={handleLoadMoreComments}
                  disabled={commentsLoading}
                  className="py-2 text-xs font-label font-semibold text-primary dark:text-secondary hover:underline cursor-pointer"
                >
                  {commentsLoading ? 'Loading...' : 'Load older replies'}
                </button>
              )}
            </div>

            <form
              onSubmit={handleSubmitComment}
              className="flex items-center gap-2 pt-3 mt-2 border-t border-light-outline-subtle dark:border-dark-outline-subtle"
            >
              <input
                type="text"
                maxLength={meta.limits.commentCharacters}
                value={commentDraft}
                onChange={(e) => setCommentDraft(e.target.value)}
                placeholder="Write a supportive anonymous reply..."
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-light-surface dark:bg-dark-surface border border-light-outline dark:border-dark-outline text-xs focus:outline-none focus:border-primary"
              />
              <button
                type="submit"
                disabled={!commentDraft.trim() || commentSubmitting}
                className="min-h-[40px] min-w-[40px] rounded-xl bg-primary disabled:opacity-40 text-white flex items-center justify-center hover:bg-primary-light transition-colors cursor-pointer"
                aria-label="Send reply"
              >
                {commentSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Share Reflection Modal */}
      {sharePost && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center sm:p-4">
          <div className="w-full max-w-md rounded-t-3xl sm:rounded-2xl bg-light-surface-card dark:bg-dark-surface-card border border-light-outline dark:border-dark-outline p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-headline text-base font-bold">Share Anonymously</h3>
                <p className="text-xs text-light-text-muted dark:text-dark-text-muted">
                  Repost to Home Feed or copy link with zero tracking
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSharePost(null)}
                className="min-h-[36px] min-w-[36px] rounded-full flex items-center justify-center text-light-text-muted hover:text-primary cursor-pointer"
                aria-label="Close share dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-light-surface-card-subtle dark:bg-dark-surface-card-subtle border border-light-outline-subtle dark:border-dark-outline-subtle mb-3">
              <p className="font-label text-xs font-bold text-primary dark:text-secondary mb-1">
                {sharePost.author.username} ·{' '}
                {CATEGORY_LABELS[sharePost.category] || sharePost.category}
              </p>
              <p className="text-xs text-light-on-surface dark:text-dark-on-surface line-clamp-3 leading-relaxed">
                {sharePost.content || sharePost.title || 'Anonymous Voice Expression'}
              </p>
            </div>

            <textarea
              rows={2}
              maxLength={400}
              value={repostNote}
              onChange={(e) => setRepostNote(e.target.value)}
              placeholder="Optional: add your own reflection before sharing to feed..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-light-surface dark:bg-dark-surface border border-light-outline dark:border-dark-outline text-xs mb-3 focus:outline-none focus:border-primary resize-none"
            />

            <div className="flex flex-col gap-2">
              <button
                type="button"
                disabled={repostSubmitting}
                onClick={() => handleRepostToFeed(sharePost)}
                className="w-full py-2.5 rounded-full bg-primary hover:bg-primary-light disabled:opacity-60 text-white font-label text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
              >
                {repostSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Repeat2 className="w-4 h-4" />
                )}
                <span>
                  {repostSubmitting ? 'Sharing to Feed...' : 'Share Post to Home Feed'}
                </span>
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleCopyShareQuote(sharePost)}
                  className="py-2.5 px-3 rounded-full border border-light-outline dark:border-dark-outline hover:border-primary text-xs font-label font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {copiedShare ? (
                    <Check className="w-3.5 h-3.5 text-success" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{copiedShare ? 'Copied!' : 'Copy Link'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleNativeShare(sharePost)}
                  className="py-2.5 px-3 rounded-full border border-light-outline dark:border-dark-outline hover:border-primary text-xs font-label font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Share Externally</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Report Post Modal */}
      {reportTarget && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleSubmitReport}
            className="w-full max-w-md rounded-2xl bg-light-surface-card dark:bg-dark-surface-card border border-light-outline dark:border-dark-outline p-5 shadow-2xl"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-headline text-base font-bold">Report Expression</h3>
              <button
                type="button"
                onClick={() => setReportTarget(null)}
                className="text-light-text-muted hover:text-primary cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-light-text-muted dark:text-dark-text-muted mb-3">
              Help keep XPRESSIT safe. Reports are confidential.
            </p>

            <div className="flex flex-col gap-2 mb-3">
              {REPORT_REASONS.map((r) => (
                <label
                  key={r.id}
                  className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-xs cursor-pointer ${
                    reportReason === r.id
                      ? 'border-primary bg-primary/10 font-semibold'
                      : 'border-light-outline dark:border-dark-outline'
                  }`}
                >
                  <input
                    type="radio"
                    name="reportReason"
                    value={r.id}
                    checked={reportReason === r.id}
                    onChange={() => setReportReason(r.id)}
                    className="accent-primary"
                  />
                  <span>{r.label}</span>
                </label>
              ))}
            </div>

            <textarea
              rows={2}
              maxLength={1000}
              value={reportDetails}
              onChange={(e) => setReportDetails(e.target.value)}
              placeholder="Optional details (up to 1,000 characters)..."
              className="w-full px-3.5 py-2 rounded-xl bg-light-surface dark:bg-dark-surface border border-light-outline dark:border-dark-outline text-xs mb-4 focus:outline-none focus:border-primary resize-none"
            />

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setReportTarget(null)}
                className="px-4 py-2 rounded-full border border-light-outline dark:border-dark-outline text-xs font-label font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={reportSubmitting}
                className="px-5 py-2 rounded-full bg-danger hover:bg-red-600 disabled:opacity-60 text-white text-xs font-label font-bold flex items-center gap-1.5 cursor-pointer"
              >
                {reportSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Submit Report</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Own Post Modal */}
      {editTarget && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveEdit}
            className="w-full max-w-md rounded-2xl bg-light-surface-card dark:bg-dark-surface-card border border-light-outline dark:border-dark-outline p-5 shadow-2xl"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-headline text-base font-bold">Edit Your Expression</h3>
              <button
                type="button"
                onClick={() => setEditTarget(null)}
                className="text-light-text-muted hover:text-primary cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-col gap-3 mb-4">
              <div>
                <label className="block font-label text-xs font-semibold mb-1">Category</label>
                <select
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value as PostCategory)}
                  className="w-full px-3 py-2 rounded-xl bg-light-surface dark:bg-dark-surface border border-light-outline dark:border-dark-outline text-xs font-label font-semibold"
                >
                  {meta.categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {CATEGORY_LABELS[cat] || cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-label text-xs font-semibold mb-1">
                  Title (Optional)
                </label>
                <input
                  type="text"
                  maxLength={meta.limits.titleCharacters}
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-light-surface dark:bg-dark-surface border border-light-outline dark:border-dark-outline text-xs font-semibold"
                />
              </div>

              <div>
                <label className="block font-label text-xs font-semibold mb-1">
                  {editTarget.mode === 'voice' ? 'Description (Optional)' : 'Content'}
                </label>
                <textarea
                  rows={4}
                  maxLength={meta.limits.textCharacters}
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-light-surface dark:bg-dark-surface border border-light-outline dark:border-dark-outline text-xs leading-relaxed resize-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditTarget(null)}
                className="px-4 py-2 rounded-full border border-light-outline dark:border-dark-outline text-xs font-label font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={editSubmitting}
                className="px-5 py-2 rounded-full bg-primary hover:bg-primary-light disabled:opacity-60 text-white text-xs font-label font-bold flex items-center gap-1.5 cursor-pointer"
              >
                {editSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Save Changes</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delete Own Post Confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl bg-light-surface-card dark:bg-dark-surface-card border border-light-outline dark:border-dark-outline p-5 shadow-2xl">
            <h3 className="font-headline text-base font-bold mb-2">Delete Expression?</h3>
            <p className="text-xs text-light-text-muted dark:text-dark-text-muted mb-5 leading-relaxed">
              This permanently deletes the post along with its reactions, comments, and notifications from the server.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-full border border-light-outline dark:border-dark-outline text-xs font-label font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteSubmitting}
                onClick={handleConfirmDelete}
                className="px-5 py-2 rounded-full bg-danger hover:bg-red-600 disabled:opacity-60 text-white text-xs font-label font-bold flex items-center gap-1.5 cursor-pointer"
              >
                {deleteSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notice */}
      {toastMsg && (
        <div className="fixed bottom-24 lg:bottom-8 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-full bg-dark-surface-card text-white text-xs font-label font-semibold shadow-xl border border-primary/40 flex items-center gap-2 whitespace-nowrap">
          <Check className="w-3.5 h-3.5 text-success" />
          <span>{toastMsg}</span>
        </div>
      )}
    </div>
  );
}
