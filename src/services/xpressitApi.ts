import {
  ApiBlockedUser,
  ApiComment,
  ApiMediaItem,
  ApiMeta,
  ApiNotification,
  ApiPost,
  ApiReportItem,
  ApiUser,
  ApiUserSettings,
  FeedSortMode,
  PaginationInfo,
  PostCategory,
  ReactionType,
  ReportReason,
} from '../types/xpressit';

function normalizeApiBaseUrl(raw?: string): string {
  const fallback = 'https://xpressit.onrender.com';
  if (!raw) return fallback;
  const trimmed = raw.trim().replace(/^['"]+|['"]+$/g, '');
  const match = trimmed.match(/https?:\/\/[^\s"'`]+/i);
  if (match) {
    return match[0].replace(/\/+$/, '');
  }
  return fallback;
}

const RAW_ENV_API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
export const API_BASE_URL = normalizeApiBaseUrl(RAW_ENV_API_BASE_URL);

export interface ApiDebugLogEntry {
  id: number;
  timestamp: string;
  method: string;
  url: string;
  status: number | 'NETWORK_ERROR' | 'CACHE_HIT';
  durationMs: number;
  ok: boolean;
  errorCode?: string;
  errorMessage?: string;
}

const MAX_DEBUG_LOGS = 100;
let nextLogId = 1;
const apiDebugHistory: ApiDebugLogEntry[] = [];

if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__XPRESSIT_API_LOGS__ = apiDebugHistory;
  console.info('[XPRESSIT API] Initialized', {
    rawEnvBaseUrl: RAW_ENV_API_BASE_URL ?? '(unset)',
    resolvedBaseUrl: API_BASE_URL,
  });
}

function sanitizeHeadersForLog(headers: Record<string, string>): Record<string, string> {
  const safe: Record<string, string> = { ...headers };
  if (safe.Authorization) {
    const tokenPart = safe.Authorization.replace(/^Bearer\s+/i, '');
    safe.Authorization = `Bearer ***${tokenPart.slice(-6)}`;
  }
  return safe;
}

function sanitizeBodyForLog(body: unknown, isFormData?: boolean): unknown {
  if (body === undefined) return undefined;
  if (isFormData && body instanceof FormData) {
    const summary: Record<string, string> = {};
    body.forEach((value, key) => {
      if (value instanceof Blob) {
        summary[key] = `[Blob ${value.type || 'application/octet-stream'} ${value.size}B]`;
      } else {
        summary[key] = String(value);
      }
    });
    return summary;
  }
  if (body && typeof body === 'object') {
    const clone = { ...(body as Record<string, unknown>) };
    for (const secretKey of ['passphrase', 'currentPassphrase', 'token']) {
      if (typeof clone[secretKey] === 'string') {
        const str = clone[secretKey] as string;
        clone[secretKey] = `[REDACTED len=${str.length}]`;
      }
    }
    return clone;
  }
  return body;
}

function sanitizeResponseForLog(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') return payload;
  const clone = { ...(payload as Record<string, unknown>) };
  if (clone.data && typeof clone.data === 'object' && !Array.isArray(clone.data)) {
    const dataClone = { ...(clone.data as Record<string, unknown>) };
    if (typeof dataClone.token === 'string') {
      dataClone.token = `***${dataClone.token.slice(-6)}`;
    }
    if (typeof dataClone.passphrase === 'string') {
      dataClone.passphrase = '[6-word passphrase]';
    }
    if (Array.isArray(dataClone.words)) {
      dataClone.words = `[${dataClone.words.length} words]`;
    }
    clone.data = dataClone;
  }
  return clone;
}

function recordDebugLog(entry: ApiDebugLogEntry) {
  apiDebugHistory.push(entry);
  if (apiDebugHistory.length > MAX_DEBUG_LOGS) {
    apiDebugHistory.shift();
  }
}

export class ApiError extends Error {
  status: number;
  code: string;
  details?: Array<{ field?: string; message: string }>;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: Array<{ field?: string; message: string }>,
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function resolveMediaUrl(relativeOrAbsoluteUrl: string): string {
  if (!relativeOrAbsoluteUrl) return '';
  if (
    relativeOrAbsoluteUrl.startsWith('http://') ||
    relativeOrAbsoluteUrl.startsWith('https://') ||
    relativeOrAbsoluteUrl.startsWith('blob:') ||
    relativeOrAbsoluteUrl.startsWith('data:')
  ) {
    return relativeOrAbsoluteUrl;
  }
  const normalized = relativeOrAbsoluteUrl.startsWith('/')
    ? relativeOrAbsoluteUrl
    : `/${relativeOrAbsoluteUrl}`;
  return `${API_BASE_URL}${normalized}`;
}

async function request<T>(
  path: string,
  options: {
    method?: string;
    token?: string | null;
    body?: unknown;
    isFormData?: boolean;
  } = {},
): Promise<T> {
  const method = options.method || 'GET';
  const fullUrl = `${API_BASE_URL}${path}`;
  const reqId = nextLogId++;
  const startedAt = performance.now();

  const headers: Record<string, string> = {};
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }
  if (!options.isFormData && options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  console.debug(`[XPRESSIT API #${reqId}] --> ${method} ${fullUrl}`, {
    headers: sanitizeHeadersForLog(headers),
    body: sanitizeBodyForLog(options.body, options.isFormData),
  });

  let res: Response;
  try {
    res = await fetch(fullUrl, {
      method,
      headers,
      body: options.isFormData
        ? (options.body as FormData)
        : options.body !== undefined
        ? JSON.stringify(options.body)
        : undefined,
    });
  } catch (networkErr) {
    const durationMs = Math.round(performance.now() - startedAt);
    console.error(`[XPRESSIT API #${reqId}] <-- NETWORK ERROR ${method} ${fullUrl} (${durationMs}ms)`, networkErr);
    recordDebugLog({
      id: reqId,
      timestamp: new Date().toISOString(),
      method,
      url: fullUrl,
      status: 'NETWORK_ERROR',
      durationMs,
      ok: false,
      errorCode: 'NETWORK_ERROR',
      errorMessage: 'Unable to reach the XPRESSIT server.',
    });
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      'Unable to reach the XPRESSIT server. Please check your connection.',
    );
  }

  const durationMs = Math.round(performance.now() - startedAt);

  if (res.status === 204) {
    console.info(`[XPRESSIT API #${reqId}] <-- 204 ${method} ${fullUrl} (${durationMs}ms)`);
    recordDebugLog({
      id: reqId,
      timestamp: new Date().toISOString(),
      method,
      url: fullUrl,
      status: 204,
      durationMs,
      ok: true,
    });
    return undefined as T;
  }

  let rawText = '';
  let payload: Record<string, unknown> | null = null;
  try {
    rawText = await res.text();
    payload = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : null;
  } catch {
    payload = null;
  }

  if (!res.ok) {
    const errObj = payload?.error as
      | { code?: string; message?: string; details?: Array<{ field?: string; message: string }> }
      | undefined;
    const detailMsg =
      errObj?.details && errObj.details.length > 0
        ? errObj.details.map((d) => d.message).join(' ')
        : '';
    const errCode = errObj?.code || `HTTP_${res.status}`;
    const errMessage = detailMsg || errObj?.message || `Request failed (${res.status})`;

    console.error(`[XPRESSIT API #${reqId}] <-- ${res.status} ${method} ${fullUrl} (${durationMs}ms)`, {
      code: errCode,
      message: errMessage,
      payload: payload ?? rawText.slice(0, 300),
    });

    recordDebugLog({
      id: reqId,
      timestamp: new Date().toISOString(),
      method,
      url: fullUrl,
      status: res.status,
      durationMs,
      ok: false,
      errorCode: errCode,
      errorMessage: errMessage,
    });

    throw new ApiError(res.status, errCode, errMessage, errObj?.details);
  }

  console.info(`[XPRESSIT API #${reqId}] <-- ${res.status} ${method} ${fullUrl} (${durationMs}ms)`, {
    payload: sanitizeResponseForLog(payload),
  });

  recordDebugLog({
    id: reqId,
    timestamp: new Date().toISOString(),
    method,
    url: fullUrl,
    status: res.status,
    durationMs,
    ok: true,
  });

  return payload as T;
}

// Health & Meta
export async function checkHealth(): Promise<{ status: string; database: string }> {
  return request<{ status: string; database: string }>('/health');
}

export async function fetchMeta(): Promise<ApiMeta> {
  const res = await request<{ data: ApiMeta }>('/api/meta');
  return res.data;
}

// Authentication
export interface RegisterResponse {
  user: ApiUser;
  token: string;
  expiresAt: string;
  passphrase: string;
  words: string[];
  warning: string;
}

export async function registerAccount(username: string): Promise<RegisterResponse> {
  const res = await request<{ data: RegisterResponse }>('/api/auth/register', {
    method: 'POST',
    body: { username },
  });
  return res.data;
}

export async function confirmPassphraseSaved(token: string): Promise<ApiUser> {
  const res = await request<{ data: { user: ApiUser } }>('/api/auth/confirm', {
    method: 'POST',
    token,
    body: { savedPassphrase: true },
  });
  return res.data.user;
}

export interface LoginResponse {
  user: ApiUser;
  token: string;
  expiresAt: string;
}

export async function loginAccount(
  username: string,
  passphrase: string,
): Promise<LoginResponse> {
  const res = await request<{ data: LoginResponse }>('/api/auth/login', {
    method: 'POST',
    body: { username, passphrase },
  });
  return res.data;
}

export async function logoutAccount(token: string): Promise<void> {
  await request<void>('/api/auth/logout', {
    method: 'POST',
    token,
  });
}

export interface PreparePassphraseResponse {
  passphrase: string;
  words: string[];
  expiresAt: string;
}

export async function preparePassphraseChange(
  token: string,
  currentPassphrase: string,
): Promise<PreparePassphraseResponse> {
  const res = await request<{ data: PreparePassphraseResponse }>('/api/auth/passphrase', {
    method: 'POST',
    token,
    body: { currentPassphrase },
  });
  return res.data;
}

export async function confirmPassphraseChange(
  token: string,
  passphrase: string,
): Promise<LoginResponse> {
  const res = await request<{ data: LoginResponse }>('/api/auth/passphrase/confirm', {
    method: 'POST',
    token,
    body: { savedPassphrase: true, passphrase },
  });
  return res.data;
}

// Feed & Posts
export async function fetchPosts(
  token: string,
  params: {
    feed?: FeedSortMode;
    category?: PostCategory | '';
    page?: number;
    limit?: number;
  } = {},
): Promise<{ data: ApiPost[]; pagination: PaginationInfo }> {
  const search = new URLSearchParams();
  if (params.feed) search.set('feed', params.feed);
  if (params.category) search.set('category', params.category);
  search.set('page', String(params.page || 1));
  search.set('limit', String(params.limit || 20));

  return request<{ data: ApiPost[]; pagination: PaginationInfo }>(
    `/api/posts?${search.toString()}`,
    { token },
  );
}

export async function fetchPostById(token: string, postId: string): Promise<ApiPost> {
  const res = await request<{ data: ApiPost }>(`/api/posts/${postId}`, { token });
  return res.data;
}

export interface CreatePostPayload {
  mode: 'text' | 'voice';
  category: PostCategory;
  title?: string;
  content?: string;
  voice?: {
    media: string;
    duration: number;
  };
  attachments: string[];
}

export async function createPost(
  token: string,
  payload: CreatePostPayload,
): Promise<ApiPost> {
  const res = await request<{ data: ApiPost }>('/api/posts', {
    method: 'POST',
    token,
    body: payload,
  });
  return res.data;
}

export async function updatePost(
  token: string,
  postId: string,
  payload: CreatePostPayload,
): Promise<ApiPost> {
  const res = await request<{ data: ApiPost }>(`/api/posts/${postId}`, {
    method: 'PUT',
    token,
    body: payload,
  });
  return res.data;
}

export async function deletePost(token: string, postId: string): Promise<void> {
  await request<void>(`/api/posts/${postId}`, {
    method: 'DELETE',
    token,
  });
}

// Reactions
export async function setPostReaction(
  token: string,
  postId: string,
  type: ReactionType,
): Promise<ApiPost> {
  const res = await request<{ data: ApiPost }>(`/api/posts/${postId}/reaction`, {
    method: 'PUT',
    token,
    body: { type },
  });
  return res.data;
}

export async function removePostReaction(
  token: string,
  postId: string,
): Promise<ApiPost> {
  const res = await request<{ data: ApiPost }>(`/api/posts/${postId}/reaction`, {
    method: 'DELETE',
    token,
  });
  return res.data;
}

// Comments
export async function fetchComments(
  token: string,
  postId: string,
  page = 1,
  limit = 20,
): Promise<{ data: ApiComment[]; pagination: PaginationInfo }> {
  return request<{ data: ApiComment[]; pagination: PaginationInfo }>(
    `/api/posts/${postId}/comments?page=${page}&limit=${limit}`,
    { token },
  );
}

export async function addComment(
  token: string,
  postId: string,
  content: string,
): Promise<ApiComment> {
  const res = await request<{ data: ApiComment }>(`/api/posts/${postId}/comments`, {
    method: 'POST',
    token,
    body: { content },
  });
  return res.data;
}

export async function deleteComment(
  token: string,
  postId: string,
  commentId: string,
): Promise<void> {
  await request<void>(`/api/posts/${postId}/comments/${commentId}`, {
    method: 'DELETE',
    token,
  });
}

// Reports
export async function reportPost(
  token: string,
  postId: string,
  reason: ReportReason,
  details?: string,
): Promise<ApiReportItem> {
  const res = await request<{ data: ApiReportItem }>(`/api/posts/${postId}/report`, {
    method: 'POST',
    token,
    body: details ? { reason, details } : { reason },
  });
  return res.data;
}

// Media Upload & Authenticated Retrieval
export async function uploadMedia(
  token: string,
  kind: 'voice' | 'image' | 'video' | 'document',
  file: Blob,
  filename?: string,
): Promise<ApiMediaItem> {
  const form = new FormData();
  form.append('kind', kind);
  if (filename) {
    form.append('file', file, filename);
  } else {
    form.append('file', file);
  }
  const res = await request<{ data: ApiMediaItem }>('/api/media', {
    method: 'POST',
    token,
    body: form,
    isFormData: true,
  });
  return res.data;
}

export async function deleteMedia(token: string, mediaId: string): Promise<void> {
  await request<void>(`/api/media/${mediaId}`, {
    method: 'DELETE',
    token,
  });
}

const mediaBlobCache = new Map<string, string>();

export async function fetchAuthenticatedMediaBlobUrl(
  token: string,
  mediaUrlOrId: string,
): Promise<string> {
  const path = mediaUrlOrId.startsWith('/api/')
    ? mediaUrlOrId
    : mediaUrlOrId.startsWith('http')
    ? mediaUrlOrId
    : `/api/media/${mediaUrlOrId}`;

  const fullUrl = resolveMediaUrl(path);
  const cacheKey = `${token.slice(-8)}:${path}`;
  const existing = mediaBlobCache.get(cacheKey);
  if (existing) {
    console.debug(`[XPRESSIT API] CACHE_HIT GET ${fullUrl}`);
    return existing;
  }

  const reqId = nextLogId++;
  const startedAt = performance.now();
  console.debug(`[XPRESSIT API #${reqId}] --> GET ${fullUrl} (media stream)`);

  let res: Response;
  try {
    res = await fetch(fullUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  } catch (networkErr) {
    const durationMs = Math.round(performance.now() - startedAt);
    console.error(`[XPRESSIT API #${reqId}] <-- NETWORK ERROR GET ${fullUrl} (${durationMs}ms)`, networkErr);
    recordDebugLog({
      id: reqId,
      timestamp: new Date().toISOString(),
      method: 'GET',
      url: fullUrl,
      status: 'NETWORK_ERROR',
      durationMs,
      ok: false,
      errorCode: 'NETWORK_ERROR',
      errorMessage: 'Unable to stream media.',
    });
    throw new ApiError(0, 'NETWORK_ERROR', 'Unable to stream media from server.');
  }

  const durationMs = Math.round(performance.now() - startedAt);

  if (!res.ok) {
    console.error(`[XPRESSIT API #${reqId}] <-- ${res.status} GET ${fullUrl} (${durationMs}ms)`);
    recordDebugLog({
      id: reqId,
      timestamp: new Date().toISOString(),
      method: 'GET',
      url: fullUrl,
      status: res.status,
      durationMs,
      ok: false,
      errorCode: 'MEDIA_FETCH_FAILED',
      errorMessage: `Could not load media (${res.status})`,
    });
    throw new ApiError(res.status, 'MEDIA_FETCH_FAILED', `Could not load media (${res.status})`);
  }

  const blob = await res.blob();
  console.info(`[XPRESSIT API #${reqId}] <-- ${res.status} GET ${fullUrl} (${durationMs}ms)`, {
    mimeType: blob.type,
    sizeBytes: blob.size,
  });
  recordDebugLog({
    id: reqId,
    timestamp: new Date().toISOString(),
    method: 'GET',
    url: fullUrl,
    status: res.status,
    durationMs,
    ok: true,
  });

  const objectUrl = URL.createObjectURL(blob);
  mediaBlobCache.set(cacheKey, objectUrl);
  return objectUrl;
}

// User Profile, Settings, Blocks, Reports, Notifications
export async function fetchCurrentUser(token: string): Promise<ApiUser> {
  const res = await request<{ data: ApiUser }>('/api/users/me', { token });
  return res.data;
}

export async function updateUserSettings(
  token: string,
  patch: Partial<ApiUserSettings>,
): Promise<ApiUser> {
  const res = await request<{ data: ApiUser }>('/api/users/me/settings', {
    method: 'PATCH',
    token,
    body: patch,
  });
  return res.data;
}

export async function fetchBlockedUsers(token: string): Promise<ApiBlockedUser[]> {
  const res = await request<{ data: ApiBlockedUser[] }>('/api/users/me/blocks', { token });
  return res.data;
}

export async function blockUser(token: string, userId: string): Promise<void> {
  await request<unknown>('/api/users/me/blocks', {
    method: 'POST',
    token,
    body: { userId },
  });
}

export async function unblockUser(token: string, userId: string): Promise<void> {
  await request<void>(`/api/users/me/blocks/${userId}`, {
    method: 'DELETE',
    token,
  });
}

export async function fetchMyReports(token: string): Promise<ApiReportItem[]> {
  const res = await request<{ data: ApiReportItem[] }>('/api/users/me/reports', { token });
  return res.data;
}

export async function fetchNotifications(
  token: string,
  page = 1,
  limit = 20,
): Promise<{ data: ApiNotification[]; unreadCount: number; pagination: PaginationInfo }> {
  return request<{
    data: ApiNotification[];
    unreadCount: number;
    pagination: PaginationInfo;
  }>(`/api/users/me/notifications?page=${page}&limit=${limit}`, { token });
}

export async function markNotificationRead(
  token: string,
  notificationId: string,
): Promise<void> {
  await request<unknown>(`/api/users/me/notifications/${notificationId}/read`, {
    method: 'PATCH',
    token,
  });
}
