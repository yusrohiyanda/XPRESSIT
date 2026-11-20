import { ApiMeta, PostCategory, ReactionType } from '../types/xpressit';

export const BACKEND_CATEGORIES: PostCategory[] = [
  'life',
  'relationships',
  'work',
  'family',
  'mental-health',
  'confessions',
  'wins',
  'other',
];

export const CATEGORY_LABELS: Record<PostCategory, string> = {
  life: 'Life',
  relationships: 'Relationships',
  work: 'Work',
  family: 'Family',
  'mental-health': 'Mental Health',
  confessions: 'Confessions',
  wins: 'Wins',
  other: 'Other',
};

export const REACTION_META: Record<
  ReactionType,
  { label: string; activeText: string; activeBg: string }
> = {
  support: {
    label: 'Support',
    activeText: 'text-primary dark:text-secondary',
    activeBg: 'bg-primary/10 border-primary/40',
  },
  resonate: {
    label: 'Resonate',
    activeText: 'text-indigo-600 dark:text-indigo-300',
    activeBg: 'bg-indigo-500/10 border-indigo-400/40',
  },
  love: {
    label: 'Love',
    activeText: 'text-accent',
    activeBg: 'bg-accent/10 border-accent/40',
  },
};

export const REPORT_REASONS = [
  { id: 'harassment', label: 'Harassment or bullying' },
  { id: 'hate', label: 'Hate speech or discrimination' },
  { id: 'personal-information', label: 'Exposes private personal information' },
  { id: 'spam', label: 'Spam or deceptive content' },
  { id: 'other', label: 'Other safety concern' },
] as const;

export const DEFAULT_API_META: ApiMeta = {
  name: 'Xpressit',
  tagline: 'Speak freely. Stay anonymous.',
  categories: BACKEND_CATEGORIES,
  reactions: ['resonate', 'support', 'love'],
  limits: {
    textCharacters: 5000,
    titleCharacters: 120,
    commentCharacters: 2000,
    attachmentsPerPost: 5,
    voiceSeconds: 300,
    uploadMB: 20,
  },
  documentFormats: ['pdf'],
};

const HANDLE_ADJECTIVES = [
  'starlit',
  'quiet',
  'velvet',
  'midnight',
  'lunar',
  'amber',
  'silent',
  'serene',
];

const HANDLE_NOUNS = [
  'echo',
  'soul',
  'harbor',
  'poet',
  'voice',
  'horizon',
  'lantern',
  'orbit',
];

export function generateRandomHandle(): string {
  const adj = HANDLE_ADJECTIVES[Math.floor(Math.random() * HANDLE_ADJECTIVES.length)];
  const noun = HANDLE_NOUNS[Math.floor(Math.random() * HANDLE_NOUNS.length)];
  const num = Math.floor(100 + Math.random() * 899);
  return `${adj}_${noun}_${num}`.slice(0, 24);
}

export function formatRelativeTime(isoDate: string): string {
  const ts = new Date(isoDate).getTime();
  if (Number.isNaN(ts)) return 'Recently';
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 45) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(ts).toLocaleDateString();
}

export function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return 'File';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
