export type ScreenRoute = 'splash' | 'onboarding' | 'auth' | 'feed' | 'create' | 'settings';

export type ThemeMode = 'light' | 'dark' | 'system';

export type PostCategory =
  | 'life'
  | 'relationships'
  | 'work'
  | 'family'
  | 'mental-health'
  | 'confessions'
  | 'wins'
  | 'other';

export type ReactionType = 'resonate' | 'support' | 'love';

export type FeedSortMode = 'latest' | 'trending' | 'for-you';

export type ReportReason =
  | 'harassment'
  | 'hate'
  | 'personal-information'
  | 'spam'
  | 'other';

export interface ApiMeta {
  name: string;
  tagline: string;
  categories: PostCategory[];
  reactions: ReactionType[];
  limits: {
    textCharacters: number;
    titleCharacters: number;
    commentCharacters: number;
    attachmentsPerPost: number;
    voiceSeconds: number;
    uploadMB: number;
  };
  documentFormats: string[];
}

export interface ApiUserSettings {
  theme: ThemeMode;
  notifications: {
    reactions: boolean;
    comments: boolean;
  };
  categories: PostCategory[];
}

export interface ApiUser {
  id: string;
  username: string;
  confirmed: boolean;
  settings: ApiUserSettings;
  createdAt: string;
}

export interface UserSession {
  token: string;
  expiresAt: string;
  user: ApiUser;
}

export interface ApiMediaItem {
  id: string;
  kind: 'voice' | 'image' | 'video' | 'document';
  url: string;
  mimeType?: string;
  size?: number;
  originalName?: string;
  filename?: string;
}

export interface ApiVoiceInfo {
  media: ApiMediaItem | string;
  duration: number;
  url?: string;
}

export interface ApiPost {
  id: string;
  author: {
    id: string;
    username: string;
  };
  mode: 'text' | 'voice';
  title?: string | null;
  content: string;
  category: PostCategory;
  voice: ApiVoiceInfo | null;
  attachments: ApiMediaItem[];
  reactions: Record<ReactionType, number>;
  reactionCount: number;
  myReaction: ReactionType | null;
  commentCount: number;
  isMine: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface ApiComment {
  id: string;
  author: {
    id: string;
    username: string;
  };
  content: string;
  createdAt: string;
  isMine: boolean;
}

export interface ApiNotification {
  id: string;
  type?: string;
  message?: string;
  title?: string;
  postId?: string;
  read: boolean;
  createdAt: string;
}

export interface ApiBlockedUser {
  id: string;
  username: string;
  blockedAt?: string;
}

export interface ApiReportItem {
  id: string;
  postId?: string;
  reason: ReportReason;
  details?: string;
  status: string;
  createdAt: string;
}

export interface LocalVoicePreferences {
  voiceMasking: boolean;
  metadataStripping: boolean;
}

export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}
