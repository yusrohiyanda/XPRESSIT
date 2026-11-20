import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  AudioLines,
  CheckCircle2,
  CloudUpload,
  Contrast,
  FileEdit,
  FileText,
  Film,
  Image as ImageIcon,
  Loader2,
  Lock,
  LockOpen,
  Mic,
  Paperclip,
  Pause,
  Play,
  Shield,
  Sliders,
  Square,
  Trash2,
  Upload,
  Volume2,
  X,
} from 'lucide-react';
import { CATEGORY_LABELS, formatFileSize } from '../data/seedPosts';
import { ApiError, createPost, deleteMedia, uploadMedia } from '../services/xpressitApi';
import { ApiMediaItem, ApiMeta, ApiPost, PostCategory } from '../types/xpressit';
import {
  VOICE_MASK_PRESETS,
  VoiceMaskPresetId,
  blobToDataUrl,
  playVoiceMaskTonePreview,
  processMaskedVoiceBlob,
} from '../utils/voiceMasker';

interface CreatePostScreenProps {
  token: string;
  username: string;
  meta: ApiMeta;
  initialMode?: 'text' | 'voice';
  defaultVoiceMasking: boolean;
  defaultMetadataStripping: boolean;
  onCancel: () => void;
  onCreated: (post: ApiPost) => void;
  onSessionExpired: () => void;
  onToggleTheme: () => void;
}

interface UploadedAttachment {
  media: ApiMediaItem;
  displayName: string;
  sizeBytes: number;
  scrubbed: boolean;
}

function formatTimer(seconds: number): string {
  const m = String(Math.floor(seconds / 60)).padStart(2, '0');
  const s = String(seconds % 60).padStart(2, '0');
  return `${m}:${s}`;
}

async function stripImageExif(file: File): Promise<{ blob: Blob; stripped: boolean }> {
  // Preserve animated GIFs untouched; re-encode JPEG/PNG/WebP through Canvas to strip EXIF/GPS
  if (file.type === 'image/gif') {
    return { blob: file, stripped: false };
  }
  try {
    const imgUrl = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = reject;
        el.src = imgUrl;
      });
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return { blob: file, stripped: false };
      ctx.drawImage(img, 0, 0);
      const outType =
        file.type === 'image/png' || file.type === 'image/webp' ? file.type : 'image/jpeg';
      const cleanedBlob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, outType, 0.92),
      );
      if (cleanedBlob && cleanedBlob.size > 0) {
        return { blob: cleanedBlob, stripped: true };
      }
      return { blob: file, stripped: false };
    } finally {
      URL.revokeObjectURL(imgUrl);
    }
  } catch {
    return { blob: file, stripped: false };
  }
}

function inferMediaKind(file: File): 'image' | 'video' | 'document' | null {
  const name = file.name.toLowerCase();
  if (
    ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'].includes(file.type) ||
    /\.(png|jpe?g|gif|webp)$/.test(name)
  ) {
    return 'image';
  }
  if (['video/mp4', 'video/webm'].includes(file.type) || /\.(mp4|webm)$/.test(name)) {
    return 'video';
  }
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) {
    return 'document';
  }
  return null;
}

const DEFAULT_BARS = [
  35, 68, 90, 52, 78, 95, 45, 70, 86, 44, 66, 88, 72, 48, 60, 82, 54, 38, 62, 40,
];

export function CreatePostScreen({
  token,
  username,
  meta,
  initialMode = 'text',
  defaultVoiceMasking,
  defaultMetadataStripping,
  onCancel,
  onCreated,
  onSessionExpired,
  onToggleTheme,
}: CreatePostScreenProps) {
  const [mode, setMode] = useState<'text' | 'voice'>(initialMode);
  const [category, setCategory] = useState<PostCategory>(
    meta.categories.includes('confessions') ? 'confessions' : meta.categories[0] || 'life',
  );
  const [title, setTitle] = useState('');
  const [textContent, setTextContent] = useState('');
  const [attachments, setAttachments] = useState<UploadedAttachment[]>([]);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Voice Masking Controls
  const [maskPreset, setMaskPreset] = useState<VoiceMaskPresetId>(
    defaultVoiceMasking ? 'masculine' : 'original',
  );
  const [pitchSemitones, setPitchSemitones] = useState<number>(defaultVoiceMasking ? -4 : 0);
  const [toneShift, setToneShift] = useState<number>(defaultVoiceMasking ? -3 : 0);
  const [isProcessingMask, setIsProcessingMask] = useState(false);

  // Voice Recording State
  const [recordStatus, setRecordStatus] = useState<'idle' | 'recording' | 'paused' | 'recorded'>(
    'idle',
  );
  const [seconds, setSeconds] = useState(0);
  const [rawBlob, setRawBlob] = useState<Blob | null>(null);
  const [maskedBlob, setMaskedBlob] = useState<Blob | null>(null);
  const [rawAudioUrl, setRawAudioUrl] = useState<string | undefined>(undefined);
  const [maskedAudioUrl, setMaskedAudioUrl] = useState<string | undefined>(undefined);
  const [waveformBars, setWaveformBars] = useState<number[]>(DEFAULT_BARS);
  const [micUnavailableHint, setMicUnavailableHint] = useState(false);

  // Preview Playback
  const [previewTarget, setPreviewTarget] = useState<'masked' | 'original'>('masked');
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (recordStatus !== 'recording') return;
    const interval = setInterval(() => {
      setSeconds((s) => {
        const next = s + 1;
        if (next >= meta.limits.voiceSeconds) {
          if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            try {
              mediaRecorderRef.current.stop();
            } catch {
              // ignore
            }
          }
          setRecordStatus('recorded');
          return meta.limits.voiceSeconds;
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [recordStatus, meta.limits.voiceSeconds]);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
      }
    };
  }, []);

  // Re-render masked WAV automatically whenever rawBlob or mask parameters change
  useEffect(() => {
    if (!rawBlob) return;
    let cancelled = false;

    const applyMask = async () => {
      if (maskPreset === 'original' && pitchSemitones === 0 && toneShift === 0) {
        if (!cancelled) {
          setMaskedBlob(rawBlob);
          setMaskedAudioUrl(rawAudioUrl);
        }
        return;
      }

      setIsProcessingMask(true);
      try {
        const result = await processMaskedVoiceBlob(
          rawBlob,
          maskPreset,
          pitchSemitones,
          toneShift,
        );
        if (!cancelled) {
          setMaskedBlob(result.blob);
          setMaskedAudioUrl(result.audioUrl);
          setWaveformBars(result.bars);
          if (result.durationSeconds > 0) {
            setSeconds(Math.min(meta.limits.voiceSeconds, result.durationSeconds));
          }
        }
      } catch {
        if (!cancelled) {
          setMaskedBlob(rawBlob);
          setMaskedAudioUrl(rawAudioUrl);
        }
      } finally {
        if (!cancelled) {
          setIsProcessingMask(false);
        }
      }
    };

    applyMask();
    return () => {
      cancelled = true;
    };
  }, [rawBlob, rawAudioUrl, maskPreset, pitchSemitones, toneShift, meta.limits.voiceSeconds]);

  const stopPreviewPlayback = () => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }
    setIsPreviewPlaying(false);
  };

  const handleSelectPreset = (presetId: VoiceMaskPresetId) => {
    stopPreviewPlayback();
    setMaskPreset(presetId);
    const preset = VOICE_MASK_PRESETS.find((p) => p.id === presetId);
    if (preset) {
      setPitchSemitones(preset.defaultSemitones);
      setToneShift(preset.defaultTone);
      if (!rawBlob) {
        playVoiceMaskTonePreview(presetId, preset.defaultSemitones, preset.defaultTone);
      }
    }
  };

  const handleTogglePreview = () => {
    if (isPreviewPlaying) {
      stopPreviewPlayback();
      return;
    }

    const urlToPlay =
      previewTarget === 'original' ? rawAudioUrl : maskedAudioUrl || rawAudioUrl;

    if (!urlToPlay) {
      playVoiceMaskTonePreview(maskPreset, pitchSemitones, toneShift);
      return;
    }

    const audio = new Audio(urlToPlay);
    previewAudioRef.current = audio;
    audio.onended = () => {
      setIsPreviewPlaying(false);
    };
    audio.play().catch(() => {
      setIsPreviewPlaying(false);
    });
    setIsPreviewPlaying(true);
  };

  const startOrStopRecording = async () => {
    setErrorMsg('');
    setMicUnavailableHint(false);
    stopPreviewPlayback();

    if (recordStatus === 'idle' || recordStatus === 'recorded') {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setMicUnavailableHint(true);
        setErrorMsg(
          'Microphone capture is not supported in this browser. Use "Import Audio Clip" below.',
        );
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setSeconds(0);
        setRawBlob(null);
        setMaskedBlob(null);
        setRawAudioUrl(undefined);
        setMaskedAudioUrl(undefined);
        setWaveformBars(DEFAULT_BARS);
        chunksRef.current = [];
        streamRef.current = stream;

        const recorder = new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;
        recorder.ondataavailable = (ev) => {
          if (ev.data.size > 0) chunksRef.current.push(ev.data);
        };
        recorder.onstop = async () => {
          if (chunksRef.current.length > 0) {
            const blob = new Blob(chunksRef.current, {
              type: recorder.mimeType || 'audio/webm',
            });
            try {
              const url = await blobToDataUrl(blob);
              setRawAudioUrl(url);
            } catch {
              setRawAudioUrl(URL.createObjectURL(blob));
            }
            setRawBlob(blob);
          }
          stream.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        };
        recorder.start();
        setRecordStatus('recording');
      } catch {
        setMicUnavailableHint(true);
        setErrorMsg(
          'Microphone permission denied or no mic detected. You can import an audio file (MP3, WAV, OGG, M4A, WebM) instead.',
        );
      }
    } else {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch {
          // Ignore stop errors
        }
      }
      setRecordStatus('recorded');
    }
  };

  const togglePauseRecording = () => {
    if (recordStatus === 'recording') {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        try {
          mediaRecorderRef.current.pause();
        } catch {
          // Ignore
        }
      }
      setRecordStatus('paused');
    } else if (recordStatus === 'paused') {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
        try {
          mediaRecorderRef.current.resume();
        } catch {
          // Ignore
        }
      }
      setRecordStatus('recording');
    }
  };

  const resetVoiceRecording = () => {
    stopPreviewPlayback();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // Ignore
      }
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setRecordStatus('idle');
    setSeconds(0);
    setRawBlob(null);
    setMaskedBlob(null);
    setRawAudioUrl(undefined);
    setMaskedAudioUrl(undefined);
    setWaveformBars(DEFAULT_BARS);
    setMicUnavailableHint(false);
  };

  const handleImportAudioFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const maxBytes = meta.limits.uploadMB * 1024 * 1024;
    if (file.size > maxBytes) {
      setErrorMsg(`Audio file exceeds the ${meta.limits.uploadMB} MB limit.`);
      return;
    }

    setErrorMsg('');
    setMicUnavailableHint(false);
    stopPreviewPlayback();

    try {
      const url = await blobToDataUrl(file);
      setRawAudioUrl(url);
    } catch {
      setRawAudioUrl(URL.createObjectURL(file));
    }

    // Measure audio duration accurately if browser can decode metadata
    const probeUrl = URL.createObjectURL(file);
    const audioEl = new Audio(probeUrl);
    audioEl.onloadedmetadata = () => {
      if (Number.isFinite(audioEl.duration) && audioEl.duration > 0) {
        setSeconds(Math.min(meta.limits.voiceSeconds, Math.max(1, Math.round(audioEl.duration))));
      } else {
        setSeconds((prev) => Math.max(1, prev));
      }
      URL.revokeObjectURL(probeUrl);
    };
    audioEl.onerror = () => {
      setSeconds((prev) => Math.max(1, prev));
      URL.revokeObjectURL(probeUrl);
    };

    setRawBlob(file);
    setRecordStatus('recorded');
  };

  const handleEvidenceSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;

    const remainingSlots = meta.limits.attachmentsPerPost - attachments.length;
    if (remainingSlots <= 0) {
      setErrorMsg(`Maximum ${meta.limits.attachmentsPerPost} attachments allowed per post.`);
      return;
    }

    setErrorMsg('');
    setUploadingAttachment(true);
    const maxBytes = meta.limits.uploadMB * 1024 * 1024;

    try {
      for (const file of files.slice(0, remainingSlots)) {
        const kind = inferMediaKind(file);
        if (!kind) {
          setErrorMsg(
            `Unsupported file "${file.name}". Supported: PNG, JPEG, GIF, WebP, MP4, WebM, and PDF.`,
          );
          continue;
        }
        if (file.size > maxBytes) {
          setErrorMsg(`"${file.name}" exceeds the ${meta.limits.uploadMB} MB upload limit.`);
          continue;
        }

        let uploadBlob: Blob = file;
        let scrubbed = false;
        if (kind === 'image' && defaultMetadataStripping) {
          const stripped = await stripImageExif(file);
          uploadBlob = stripped.blob;
          scrubbed = stripped.stripped;
        }

        const uploaded = await uploadMedia(token, kind, uploadBlob, file.name);
        setAttachments((prev) => [
          ...prev,
          {
            media: uploaded,
            displayName: uploaded.originalName || file.name,
            sizeBytes: uploaded.size || uploadBlob.size,
            scrubbed,
          },
        ]);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onSessionExpired();
        return;
      }
      setErrorMsg(
        err instanceof ApiError ? err.message : 'Failed to upload evidence file.',
      );
    } finally {
      setUploadingAttachment(false);
    }
  };

  const handleRemoveAttachment = async (mediaId: string) => {
    setAttachments((prev) => prev.filter((item) => item.media.id !== mediaId));
    try {
      await deleteMedia(token, mediaId);
    } catch {
      // Ignore deletion error if already removed
    }
  };

  const isVoiceMasked = maskPreset !== 'original' || pitchSemitones !== 0 || toneShift !== 0;

  const activePresetLabel = useMemo(() => {
    const preset = VOICE_MASK_PRESETS.find((p) => p.id === maskPreset);
    if (!isVoiceMasked) return 'Original Voice';
    const sign = pitchSemitones > 0 ? `+${pitchSemitones}` : `${pitchSemitones}`;
    return `${preset?.label || 'Custom Voice'} (${sign} st)`;
  }, [isVoiceMasked, maskPreset, pitchSemitones]);

  const handlePublish = async () => {
    setErrorMsg('');

    if (mode === 'text' && !textContent.trim()) {
      setErrorMsg('Please write your experience before publishing a text post.');
      return;
    }
    if (mode === 'voice') {
      if (recordStatus === 'recording' || recordStatus === 'paused') {
        setErrorMsg('Please stop your recording before publishing.');
        return;
      }
      if (!rawBlob) {
        setErrorMsg('Record with your microphone or import an audio clip before publishing.');
        return;
      }
      if (isProcessingMask) {
        setErrorMsg('Applying voice mask... please wait a moment.');
        return;
      }
    }
    if (uploadingAttachment) {
      setErrorMsg('Wait for evidence upload to finish before publishing.');
      return;
    }

    stopPreviewPlayback();
    setPublishing(true);

    try {
      const attachmentIds = attachments.map((a) => a.media.id);
      const cleanTitle = title.trim();
      const cleanContent = textContent.trim();

      if (mode === 'text') {
        const created = await createPost(token, {
          mode: 'text',
          category,
          ...(cleanTitle ? { title: cleanTitle } : {}),
          content: cleanContent,
          attachments: attachmentIds,
        });
        onCreated(created);
        return;
      }

      // Voice mode: upload masked WAV (or raw audio if Original preset)
      const blobToUpload = isVoiceMasked ? maskedBlob || rawBlob! : rawBlob!;
      const ext = blobToUpload.type.includes('wav')
        ? 'wav'
        : blobToUpload.type.includes('mpeg') || blobToUpload.type.includes('mp3')
        ? 'mp3'
        : blobToUpload.type.includes('ogg')
        ? 'ogg'
        : blobToUpload.type.includes('mp4') || blobToUpload.type.includes('m4a')
        ? 'm4a'
        : 'webm';
      const uploadName = isVoiceMasked
        ? `masked_${maskPreset}.${ext}`
        : `voice_note.${ext}`;

      const uploadedVoice = await uploadMedia(token, 'voice', blobToUpload, uploadName);
      const safeDuration = Math.min(meta.limits.voiceSeconds, Math.max(1, seconds || 1));

      const created = await createPost(token, {
        mode: 'voice',
        category,
        ...(cleanTitle ? { title: cleanTitle } : {}),
        ...(cleanContent ? { content: cleanContent } : {}),
        voice: {
          media: uploadedVoice.id,
          duration: safeDuration,
        },
        attachments: attachmentIds,
      });
      onCreated(created);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onSessionExpired();
        return;
      }
      setErrorMsg(err instanceof ApiError ? err.message : 'Could not publish experience.');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 w-full">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-light-surface/90 dark:bg-dark-surface/90 backdrop-blur-md border-b border-light-outline-subtle dark:border-dark-outline-subtle px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[36px] min-w-[36px] rounded-full flex items-center justify-center text-light-text-muted dark:text-dark-text-muted hover:text-primary cursor-pointer"
            aria-label="Close composer"
          >
            <X className="w-5 h-5" />
          </button>
          <h1 className="font-headline font-extrabold text-base tracking-tight">
            Create Expression
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 rounded-full bg-success/15 text-success text-xs font-label font-bold flex items-center gap-1 whitespace-nowrap">
            <Shield className="w-3.5 h-3.5" />
            <span>Pseudonymous</span>
          </span>
          <button
            type="button"
            onClick={onToggleTheme}
            className="w-9 h-9 rounded-full bg-light-surface-card dark:bg-dark-surface-card border border-light-outline dark:border-dark-outline text-primary dark:text-secondary flex items-center justify-center shadow-sm hover:border-primary transition-colors cursor-pointer"
            title="Toggle Theme"
            aria-label="Toggle Theme"
          >
            <Contrast className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Composer Body */}
      <main className="flex-1 px-4 py-4 pb-28 lg:pb-10 w-full">
        {/* Post Method Switcher */}
        <div className="w-full p-1 bg-light-surface-card-subtle dark:bg-dark-surface-card-subtle rounded-2xl flex items-center mb-4 border border-light-outline-subtle dark:border-dark-outline-subtle">
          <button
            type="button"
            onClick={() => {
              setMode('text');
              setErrorMsg('');
              stopPreviewPlayback();
            }}
            className={`flex-1 py-2.5 rounded-xl font-label text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              mode === 'text'
                ? 'bg-primary text-white shadow-sm'
                : 'text-light-text-muted dark:text-dark-text-muted hover:text-light-on-surface dark:hover:text-dark-on-surface'
            }`}
          >
            <FileEdit className="w-4 h-4" />
            <span>Text Post</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setMode('voice');
              setErrorMsg('');
            }}
            className={`flex-1 py-2.5 rounded-xl font-label text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              mode === 'voice'
                ? 'bg-primary text-white shadow-sm'
                : 'text-light-text-muted dark:text-dark-text-muted hover:text-light-on-surface dark:hover:text-dark-on-surface'
            }`}
          >
            <Mic className="w-4 h-4" />
            <span>Voice Post</span>
          </button>
        </div>

        {/* Category Picker */}
        <div className="mb-4">
          <label className="block font-label text-xs text-light-text-muted dark:text-dark-text-muted mb-2 font-semibold">
            Choose Category
          </label>
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
            {meta.categories.map((cat) => {
              const active = category === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-label whitespace-nowrap shrink-0 transition-all cursor-pointer ${
                    active
                      ? 'bg-primary text-white font-semibold shadow-sm'
                      : 'bg-light-surface-card dark:bg-dark-surface-card border border-light-outline dark:border-dark-outline text-light-text-muted dark:text-dark-text-muted hover:text-primary font-medium'
                  }`}
                >
                  {CATEGORY_LABELS[cat] || cat}
                </button>
              );
            })}
          </div>
        </div>

        {/* Optional Title */}
        <div className="mb-3">
          <input
            type="text"
            maxLength={meta.limits.titleCharacters}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Optional headline or title..."
            className="w-full px-4 py-2.5 rounded-xl bg-light-surface-card dark:bg-dark-surface-card border border-light-outline dark:border-dark-outline text-sm font-headline font-bold text-light-on-surface dark:text-dark-on-surface placeholder:font-body placeholder:font-normal placeholder:text-light-text-muted dark:placeholder:text-dark-text-muted focus:outline-none focus:border-primary"
          />
        </div>

        {/* Mode A: Text Post */}
        {mode === 'text' ? (
          <div className="bg-light-surface-card dark:bg-dark-surface-card rounded-2xl p-4 border border-light-outline dark:border-dark-outline shadow-sm">
            <textarea
              rows={6}
              maxLength={meta.limits.textCharacters}
              value={textContent}
              onChange={(e) => {
                setTextContent(e.target.value);
                if (errorMsg) setErrorMsg('');
              }}
              className="w-full bg-transparent border-0 p-0 text-light-on-surface dark:text-dark-on-surface placeholder:text-light-text-muted dark:placeholder:text-dark-text-muted focus:outline-none text-sm sm:text-base leading-relaxed resize-none"
              placeholder="What's on your mind? Express yourself freely without judgment..."
            />
            <div className="flex items-center justify-between pt-3 border-t border-light-outline-subtle dark:border-dark-outline-subtle text-xs text-light-text-muted dark:text-dark-text-muted">
              <div className="flex items-center gap-1.5 text-primary dark:text-secondary">
                <Lock className="w-3.5 h-3.5" />
                <span>Never tied to a real name or email</span>
              </div>
              <span className="font-mono tabular-nums">
                {textContent.length} / {meta.limits.textCharacters}
              </span>
            </div>
          </div>
        ) : (
          /* Mode B: Voice Post + Voice Masking Studio */
          <div className="flex flex-col gap-4">
            <div className="bg-light-surface-card dark:bg-dark-surface-card rounded-2xl p-6 border border-light-outline dark:border-dark-outline shadow-sm flex flex-col items-center text-center">
              <div className="flex items-center gap-2 mb-2">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    recordStatus === 'recording'
                      ? 'bg-danger animate-ping'
                      : recordStatus === 'recorded'
                      ? 'bg-success'
                      : 'bg-secondary'
                  }`}
                />
                <span
                  className={`font-label text-xs font-bold uppercase tracking-wider ${
                    recordStatus === 'recording'
                      ? 'text-danger'
                      : recordStatus === 'recorded'
                      ? 'text-success'
                      : 'text-light-text-muted dark:text-dark-text-muted'
                  }`}
                >
                  {recordStatus === 'recording'
                    ? 'Recording Voice...'
                    : recordStatus === 'paused'
                    ? 'Recording Paused'
                    : recordStatus === 'recorded'
                    ? 'Audio Ready'
                    : 'Ready to Speak'}
                </span>
              </div>

              <div className="font-mono text-4xl font-extrabold tabular-nums text-light-on-surface dark:text-dark-on-surface mb-1">
                {formatTimer(seconds)}
              </div>
              <p className="text-[11px] font-mono text-light-text-muted dark:text-dark-text-muted mb-4">
                Max {Math.floor(meta.limits.voiceSeconds / 60)} min
              </p>

              {/* Waveform */}
              <div className="w-full h-16 bg-light-surface-card-subtle dark:bg-dark-surface-card-subtle rounded-xl flex items-center justify-center gap-1.5 px-4 mb-6 border border-light-outline-subtle dark:border-dark-outline-subtle overflow-hidden">
                {waveformBars.slice(0, 16).map((h, i) => (
                  <span
                    key={i}
                    style={{ height: `${h}%` }}
                    className={`w-1.5 rounded-full transition-all ${
                      recordStatus === 'recording' || isPreviewPlaying
                        ? 'bg-accent animate-wave-bar'
                        : recordStatus === 'recorded'
                        ? 'bg-primary dark:bg-secondary'
                        : 'bg-primary/35'
                    }`}
                  />
                ))}
              </div>

              {/* Voice Studio Controls */}
              <div className="flex items-center justify-center gap-5 w-full mb-4">
                <button
                  type="button"
                  onClick={resetVoiceRecording}
                  className="w-11 h-11 rounded-full border border-light-outline dark:border-dark-outline text-light-text-muted dark:text-dark-text-muted flex items-center justify-center hover:text-danger hover:border-danger transition-colors cursor-pointer"
                  title="Delete & Re-record"
                  aria-label="Delete recording"
                >
                  <Trash2 className="w-5 h-5" />
                </button>

                <button
                  type="button"
                  onClick={startOrStopRecording}
                  className={`w-20 h-20 rounded-full text-white shadow-xl flex items-center justify-center transition-transform active:scale-95 border-4 border-light-surface-card dark:border-dark-surface-card cursor-pointer ${
                    recordStatus === 'recording'
                      ? 'bg-danger shadow-danger/30'
                      : 'bg-primary hover:bg-primary-light shadow-primary/30'
                  }`}
                  aria-label={
                    recordStatus === 'recording' ? 'Stop recording' : 'Start recording'
                  }
                >
                  {recordStatus === 'recording' ? (
                    <Square className="w-7 h-7 fill-white" />
                  ) : (
                    <Mic className="w-8 h-8" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={togglePauseRecording}
                  disabled={recordStatus !== 'recording' && recordStatus !== 'paused'}
                  className="w-11 h-11 rounded-full border border-light-outline dark:border-dark-outline text-light-text-muted dark:text-dark-text-muted flex items-center justify-center hover:text-primary hover:border-primary disabled:opacity-40 transition-colors cursor-pointer"
                  title={recordStatus === 'paused' ? 'Resume Recording' : 'Pause Recording'}
                  aria-label="Pause or resume recording"
                >
                  {recordStatus === 'paused' ? (
                    <Play className="w-5 h-5" />
                  ) : (
                    <Pause className="w-5 h-5" />
                  )}
                </button>
              </div>

              {/* Audio File Import Alternative */}
              <div className="flex flex-col items-center gap-2 mb-4">
                <label className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-light-outline dark:border-dark-outline text-xs font-label font-semibold text-light-text-muted dark:text-dark-text-muted hover:text-primary hover:border-primary transition-colors cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Import Audio Clip (MP3, WAV, M4A, OGG, WebM)</span>
                  <input
                    type="file"
                    accept="audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/webm,audio/mp4,audio/x-m4a,.mp3,.wav,.ogg,.webm,.m4a"
                    onChange={handleImportAudioFile}
                    className="hidden"
                  />
                </label>
                {micUnavailableHint && (
                  <p className="text-[11px] text-warning font-medium">
                    Tip: Import any audio file above and apply Masculine, Feminine, Older, or Younger voice masking below.
                  </p>
                )}
              </div>

              {/* Optional Caption for Voice Post */}
              <input
                type="text"
                maxLength={meta.limits.textCharacters}
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                placeholder="Optional written description for your voice note..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-light-surface dark:bg-dark-surface border border-light-outline dark:border-dark-outline text-xs focus:outline-none focus:border-primary"
              />
            </div>

            {/* Voice Masking Studio Card */}
            <div className="bg-light-surface-card dark:bg-dark-surface-card rounded-2xl p-4 border border-light-outline dark:border-dark-outline shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <AudioLines className="w-4 h-4 text-accent" />
                  <h3 className="font-label text-sm font-bold text-light-on-surface dark:text-dark-on-surface">
                    Voice Changer & Anonymizer
                  </h3>
                </div>
                <span className="text-xs font-mono tabular-nums text-primary dark:text-secondary font-semibold">
                  {activePresetLabel}
                </span>
              </div>

              <p className="text-xs text-light-text-muted dark:text-dark-text-muted mb-3">
                Disguise your original voice before uploading. Only the transformed WAV audio is sent to the server.
              </p>

              {/* Preset Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                {VOICE_MASK_PRESETS.map((preset) => {
                  const selected = maskPreset === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleSelectPreset(preset.id)}
                      className={`p-2.5 rounded-xl text-left border transition-all cursor-pointer min-h-[58px] ${
                        selected
                          ? 'border-primary bg-primary/10 dark:bg-primary/20'
                          : 'border-light-outline dark:border-dark-outline bg-light-surface dark:bg-dark-surface hover:border-primary/60'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span
                          className={`font-label text-xs font-bold ${
                            selected
                              ? 'text-primary dark:text-secondary'
                              : 'text-light-on-surface dark:text-dark-on-surface'
                          }`}
                        >
                          {preset.label}
                        </span>
                        <span className="font-mono text-[11px] tabular-nums text-light-text-muted dark:text-dark-text-muted">
                          {preset.defaultSemitones > 0
                            ? `+${preset.defaultSemitones}`
                            : preset.defaultSemitones}{' '}
                          st
                        </span>
                      </div>
                      <p className="text-[11px] text-light-text-muted dark:text-dark-text-muted mt-0.5 line-clamp-1">
                        {preset.description}
                      </p>
                    </button>
                  );
                })}
              </div>

              {/* Custom Pitch & Vocal Formant Sliders */}
              <div className="p-3 rounded-xl bg-light-surface-card-subtle dark:bg-dark-surface-card-subtle border border-light-outline-subtle dark:border-dark-outline-subtle mb-3 flex flex-col gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label
                      htmlFor="pitchSlider"
                      className="font-label text-xs font-semibold text-light-on-surface dark:text-dark-on-surface flex items-center gap-1.5"
                    >
                      <Sliders className="w-3.5 h-3.5 text-primary dark:text-secondary" />
                      <span>Pitch Shift</span>
                    </label>
                    <span className="font-mono text-xs font-bold tabular-nums text-primary dark:text-secondary">
                      {pitchSemitones > 0 ? `+${pitchSemitones}` : pitchSemitones} semitones
                    </span>
                  </div>
                  <input
                    id="pitchSlider"
                    type="range"
                    min={-9}
                    max={9}
                    step={1}
                    value={pitchSemitones}
                    onChange={(e) => {
                      stopPreviewPlayback();
                      const nextVal = Number(e.target.value);
                      setPitchSemitones(nextVal);
                      if (maskPreset === 'original' && nextVal !== 0) {
                        setMaskPreset(nextVal < 0 ? 'masculine' : 'feminine');
                      }
                    }}
                    className="w-full accent-primary cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] font-mono text-light-text-muted dark:text-dark-text-muted mt-1">
                    <span>Deeper (-9)</span>
                    <span>Natural (0)</span>
                    <span>Higher (+9)</span>
                  </div>
                </div>

                <div className="pt-2.5 border-t border-light-outline-subtle dark:border-dark-outline-subtle">
                  <div className="flex items-center justify-between mb-1.5">
                    <label
                      htmlFor="toneSlider"
                      className="font-label text-xs font-semibold text-light-on-surface dark:text-dark-on-surface"
                    >
                      Vocal Character & Resonance
                    </label>
                    <span className="font-mono text-xs font-bold tabular-nums text-primary dark:text-secondary">
                      {toneShift > 0 ? `+${toneShift}` : toneShift}
                    </span>
                  </div>
                  <input
                    id="toneSlider"
                    type="range"
                    min={-5}
                    max={5}
                    step={1}
                    value={toneShift}
                    onChange={(e) => {
                      stopPreviewPlayback();
                      setToneShift(Number(e.target.value));
                    }}
                    className="w-full accent-primary cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] font-mono text-light-text-muted dark:text-dark-text-muted mt-1">
                    <span>Warm Chest (-5)</span>
                    <span>Neutral (0)</span>
                    <span>Bright Airy (+5)</span>
                  </div>
                </div>
              </div>

              {/* Preview Controls */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                {rawAudioUrl && (
                  <div className="flex items-center gap-1 p-1 rounded-full bg-light-surface dark:bg-dark-surface border border-light-outline dark:border-dark-outline">
                    <button
                      type="button"
                      onClick={() => {
                        stopPreviewPlayback();
                        setPreviewTarget('masked');
                      }}
                      className={`px-3 py-1 rounded-full text-xs font-label font-semibold transition-colors cursor-pointer ${
                        previewTarget === 'masked'
                          ? 'bg-primary text-white'
                          : 'text-light-text-muted dark:text-dark-text-muted'
                      }`}
                    >
                      Masked Voice
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        stopPreviewPlayback();
                        setPreviewTarget('original');
                      }}
                      className={`px-3 py-1 rounded-full text-xs font-label font-semibold transition-colors cursor-pointer ${
                        previewTarget === 'original'
                          ? 'bg-primary text-white'
                          : 'text-light-text-muted dark:text-dark-text-muted'
                      }`}
                    >
                      Original
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleTogglePreview}
                  disabled={isProcessingMask}
                  className="ml-auto px-4 py-2 rounded-full bg-light-primary-container dark:bg-dark-primary-container text-light-on-primary-container dark:text-dark-on-primary-container font-label text-xs font-bold flex items-center gap-1.5 hover:opacity-90 disabled:opacity-50 transition-all cursor-pointer"
                >
                  <Volume2 className="w-4 h-4" />
                  <span>
                    {isProcessingMask
                      ? 'Masking Audio...'
                      : isPreviewPlaying
                      ? 'Stop Preview'
                      : rawAudioUrl
                      ? `Preview ${previewTarget === 'masked' ? 'Masked' : 'Original'}`
                      : 'Test Mask Tone'}
                  </span>
                </button>
              </div>

              {/* Privacy Disclaimer */}
              <div className="p-3 rounded-xl bg-warning/10 border border-warning/30 text-left flex items-start gap-2.5 mt-3">
                <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                <p className="font-body text-xs text-light-on-surface dark:text-dark-on-surface leading-relaxed">
                  <strong>Voice Privacy Note:</strong> When a mask is active, your voice is transformed locally on-device into a fresh WAV file before upload—your unmasked voice never leaves your device.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Supporting Evidence Attachment (up to 5 files) */}
        <div className="mt-4 bg-light-surface-card dark:bg-dark-surface-card rounded-2xl p-4 border border-light-outline dark:border-dark-outline shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Paperclip className="w-4 h-4 text-primary dark:text-secondary" />
              <h3 className="font-label text-xs sm:text-sm font-bold text-light-on-surface dark:text-dark-on-surface">
                Supporting Evidence ({attachments.length}/{meta.limits.attachmentsPerPost})
              </h3>
            </div>
            <span className="text-[11px] text-light-text-muted dark:text-dark-text-muted">
              Max {meta.limits.uploadMB} MB each
            </span>
          </div>

          {attachments.length < meta.limits.attachmentsPerPost && (
            <label className="cursor-pointer block border-2 border-dashed border-light-outline dark:border-dark-outline hover:border-primary rounded-xl p-4 text-center transition-colors">
              <input
                type="file"
                multiple
                accept="image/png,image/jpeg,image/gif,image/webp,video/mp4,video/webm,application/pdf,.pdf"
                onChange={handleEvidenceSelect}
                disabled={uploadingAttachment}
                className="hidden"
              />
              <div className="flex flex-col items-center gap-1.5">
                {uploadingAttachment ? (
                  <Loader2 className="w-6 h-6 text-primary dark:text-secondary animate-spin" />
                ) : (
                  <CloudUpload className="w-6 h-6 text-primary dark:text-secondary" />
                )}
                <span className="font-label text-xs font-semibold text-light-on-surface dark:text-dark-on-surface">
                  {uploadingAttachment
                    ? 'Uploading to secure storage...'
                    : 'Attach Images, Videos, or PDF'}
                </span>
                <span className="text-[11px] text-light-text-muted dark:text-dark-text-muted">
                  {defaultMetadataStripping
                    ? 'Image EXIF & GPS metadata scrubbed prior to upload'
                    : 'PNG, JPEG, GIF, WebP, MP4, WebM, PDF'}
                </span>
              </div>
            </label>
          )}

          {attachments.length > 0 && (
            <div className="mt-3 flex flex-col gap-2">
              {attachments.map((item) => (
                <div
                  key={item.media.id}
                  className="p-3 rounded-xl bg-light-surface-card-subtle dark:bg-dark-surface-card-subtle border border-light-outline-subtle dark:border-dark-outline-subtle flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary dark:text-secondary flex items-center justify-center shrink-0">
                      {item.media.kind === 'image' ? (
                        <ImageIcon className="w-4 h-4" />
                      ) : item.media.kind === 'video' ? (
                        <Film className="w-4 h-4" />
                      ) : (
                        <FileText className="w-4 h-4 text-danger" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-label text-xs font-bold text-light-on-surface dark:text-dark-on-surface truncate">
                          {item.displayName}
                        </span>
                        <span className="text-[10px] font-label font-semibold text-success flex items-center gap-0.5">
                          <CheckCircle2 className="w-3 h-3" />
                          {item.scrubbed ? 'EXIF Scrubbed' : 'Uploaded'}
                        </span>
                      </div>
                      <p className="text-[11px] text-light-text-muted dark:text-dark-text-muted">
                        {formatFileSize(item.sizeBytes)} · {item.media.kind}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemoveAttachment(item.media.id)}
                    className="min-h-[36px] min-w-[36px] flex items-center justify-center text-light-text-muted hover:text-danger transition-colors cursor-pointer"
                    aria-label="Remove attachment"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {errorMsg && (
          <p className="mt-4 text-xs font-medium text-danger bg-danger/10 border border-danger/25 rounded-xl px-3.5 py-2.5">
            {errorMsg}
          </p>
        )}

        {/* Publish CTA */}
        <div className="mt-6">
          <button
            type="button"
            onClick={handlePublish}
            disabled={isProcessingMask || uploadingAttachment || publishing}
            className="w-full min-h-[52px] py-3.5 rounded-full bg-primary hover:bg-primary-light disabled:opacity-60 text-white font-label text-sm sm:text-base font-bold flex items-center justify-center gap-2 shadow-xl shadow-primary/30 active:scale-[0.98] transition-all cursor-pointer"
          >
            {publishing ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <LockOpen className="w-5 h-5" />
            )}
            <span>
              {publishing
                ? 'Publishing to XPRESSIT...'
                : isProcessingMask
                ? 'Processing Masked Voice...'
                : 'Publish Anonymously'}
            </span>
          </button>
          <p className="text-center text-xs text-light-text-muted dark:text-dark-text-muted mt-2.5">
            Publishing as <span className="font-mono font-semibold">{username}</span>
          </p>
        </div>
      </main>
    </div>
  );
}
