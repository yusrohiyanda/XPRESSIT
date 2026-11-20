export type VoiceMaskPresetId =
  | 'original'
  | 'masculine'
  | 'feminine'
  | 'older'
  | 'younger'
  | 'deep_baritone'
  | 'whisper_veil'
  | 'radio_veil';

export interface VoiceMaskPreset {
  id: VoiceMaskPresetId;
  label: string;
  description: string;
  defaultSemitones: number;
  defaultTone: number; // -5 (warmer/chest) to +5 (brighter/lighter)
}

export const VOICE_MASK_PRESETS: VoiceMaskPreset[] = [
  {
    id: 'original',
    label: 'Original',
    description: 'Natural unmodified voice',
    defaultSemitones: 0,
    defaultTone: 0,
  },
  {
    id: 'masculine',
    label: 'Masculine',
    description: 'Lower pitch & deeper chest resonance',
    defaultSemitones: -4,
    defaultTone: -3,
  },
  {
    id: 'feminine',
    label: 'Feminine',
    description: 'Higher pitch & brighter vocal formants',
    defaultSemitones: 4,
    defaultTone: 3,
  },
  {
    id: 'older',
    label: 'Older',
    description: 'Mature lowered tone with gentle rasp',
    defaultSemitones: -2,
    defaultTone: -2,
  },
  {
    id: 'younger',
    label: 'Younger',
    description: 'Lighter, higher & airy youthful tone',
    defaultSemitones: 6,
    defaultTone: 4,
  },
  {
    id: 'deep_baritone',
    label: 'Deep Bass',
    description: 'Heavy baritone depth & dark warmth',
    defaultSemitones: -7,
    defaultTone: -5,
  },
  {
    id: 'whisper_veil',
    label: 'Soft Whisper',
    description: 'Breathy hushed tone for stealth',
    defaultSemitones: 1,
    defaultTone: 2,
  },
  {
    id: 'radio_veil',
    label: 'Midnight Radio',
    description: 'Filtered vintage broadcast disguise',
    defaultSemitones: -2,
    defaultTone: 0,
  },
];

function createAudioContext(): AudioContext {
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  return new Ctx();
}

/**
 * WSOLA-inspired Overlap-Add time-preserving pitch shifter.
 * Uses local cross-correlation alignment on grain boundaries for smoother,
 * more natural masculine/feminine/older/younger vocal timbre.
 */
function pitchShiftChannel(
  input: Float32Array,
  semitones: number,
): Float32Array {
  if (Math.abs(semitones) < 0.05) {
    return new Float32Array(input);
  }

  const pitchFactor = Math.pow(2, semitones / 12);
  const length = input.length;
  const output = new Float32Array(length);
  const norm = new Float32Array(length);

  const windowSize = 2048;
  const hopSize = 512;
  const searchRadius = 48;

  const hann = new Float32Array(windowSize);
  for (let i = 0; i < windowSize; i++) {
    hann[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (windowSize - 1)));
  }

  for (let pos = 0; pos < length; pos += hopSize) {
    let bestOffset = 0;

    // Align grain start with already-written output in overlap region to prevent phasiness
    if (pos > searchRadius && pos + 256 < length) {
      let bestCorr = -Infinity;
      for (let delta = -searchRadius; delta <= searchRadius; delta += 4) {
        let corr = 0;
        const candStart = pos + delta;
        if (candStart < 0 || candStart + 128 * pitchFactor >= length) continue;
        for (let k = 0; k < 128; k += 2) {
          const sIdx = Math.floor(candStart + k * pitchFactor);
          corr += (output[pos + k] ?? 0) * (input[sIdx] ?? 0);
        }
        if (corr > bestCorr) {
          bestCorr = corr;
          bestOffset = delta;
        }
      }
    }

    const grainBase = Math.max(0, pos + bestOffset);

    for (let j = 0; j < windowSize; j++) {
      const outIdx = pos + j;
      if (outIdx >= length) break;

      const srcFloat = grainBase + j * pitchFactor;
      const srcIdx = Math.floor(srcFloat);
      if (srcIdx >= length - 1) break;

      const frac = srcFloat - srcIdx;
      const sample = input[srcIdx] * (1 - frac) + input[srcIdx + 1] * frac;
      const w = hann[j];

      output[outIdx] += sample * w;
      norm[outIdx] += w;
    }
  }

  for (let i = 0; i < length; i++) {
    if (norm[i] > 1e-4) {
      output[i] /= norm[i];
    } else {
      output[i] = input[i] ?? 0;
    }
  }

  return output;
}

/**
 * Applies subtle vocal-cord texture (gentle shimmer/tremor for Older voice,
 * or soft breathiness for Soft Whisper).
 */
function applyVocalTexture(
  buffer: AudioBuffer,
  presetId: VoiceMaskPresetId,
): void {
  if (presetId !== 'older' && presetId !== 'whisper_veil') return;

  const sampleRate = buffer.sampleRate;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    if (presetId === 'older') {
      // Subtle 5.5 Hz vocal cord tremor + light rasp saturation
      for (let i = 0; i < data.length; i++) {
        const t = i / sampleRate;
        const tremor = 1 - 0.11 * (0.5 + 0.5 * Math.sin(2 * Math.PI * 5.6 * t));
        const grit = Math.tanh(data[i] * 1.45) * 0.85;
        data[i] = grit * tremor;
      }
    } else if (presetId === 'whisper_veil') {
      // Soft breathy noise envelope modulated by speech amplitude
      for (let i = 0; i < data.length; i++) {
        const env = Math.min(1, Math.abs(data[i]) * 5.5);
        const breath = (Math.random() * 2 - 1) * 0.045 * env;
        data[i] = data[i] * 0.72 + breath;
      }
    }
  }
}

function makeSoftClipCurve(amount = 16): Float32Array<ArrayBuffer> {
  const nSamples = 1024;
  const buffer = new ArrayBuffer(nSamples * 4);
  const curve = new Float32Array(buffer);
  for (let i = 0; i < nSamples; i++) {
    const x = (i * 2) / nSamples - 1;
    curve[i] = ((Math.PI + amount) * x) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}

function encodeWavBlob(audioBuffer: AudioBuffer): Blob {
  const numChannels = Math.min(2, audioBuffer.numberOfChannels);
  const sampleRate = audioBuffer.sampleRate;
  const numFrames = audioBuffer.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = numFrames * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channels.push(audioBuffer.getChannelData(c));
  }

  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    for (let c = 0; c < numChannels; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to serialize audio'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read audio blob'));
    reader.readAsDataURL(blob);
  });
}

export function extractWaveformBars(audioBuffer: AudioBuffer, barCount = 20): number[] {
  const data = audioBuffer.getChannelData(0);
  const blockSize = Math.max(1, Math.floor(data.length / barCount));
  const bars: number[] = [];

  let peakMax = 0.01;
  const rawLevels: number[] = [];
  for (let i = 0; i < barCount; i++) {
    const start = i * blockSize;
    let sum = 0;
    for (let j = 0; j < blockSize && start + j < data.length; j++) {
      sum += Math.abs(data[start + j]);
    }
    const avg = sum / blockSize;
    if (avg > peakMax) peakMax = avg;
    rawLevels.push(avg);
  }

  for (const level of rawLevels) {
    const normalized = Math.round(24 + (level / peakMax) * 72);
    bars.push(Math.max(20, Math.min(96, normalized)));
  }
  return bars;
}

export interface MaskedAudioResult {
  blob: Blob;
  audioUrl: string;
  durationSeconds: number;
  bars: number[];
}

/**
 * Processes a recorded audio Blob with pitch shifting + vocal tract formant shaping
 * (Masculine, Feminine, Older, Younger, Deep Bass, Soft Whisper, Midnight Radio).
 */
export async function processMaskedVoiceBlob(
  sourceBlob: Blob,
  presetId: VoiceMaskPresetId,
  semitones: number,
  toneShift = 0,
): Promise<MaskedAudioResult> {
  const ctx = createAudioContext();
  try {
    const arrayBuffer = await sourceBlob.arrayBuffer();
    const decoded = await ctx.decodeAudioData(arrayBuffer);

    const sampleRate = decoded.sampleRate;
    const length = decoded.length;
    const numChannels = Math.min(2, decoded.numberOfChannels);

    const offline = new OfflineAudioContext(numChannels, length, sampleRate);
    const shiftedBuffer = offline.createBuffer(numChannels, length, sampleRate);

    for (let c = 0; c < numChannels; c++) {
      const channelData = decoded.getChannelData(c);
      const shifted = pitchShiftChannel(channelData, semitones);
      shiftedBuffer.copyToChannel(new Float32Array(shifted), c);
    }

    applyVocalTexture(shiftedBuffer, presetId);

    const sourceNode = offline.createBufferSource();
    sourceNode.buffer = shiftedBuffer;

    let tail: AudioNode = sourceNode;

    // General Vocal Character / Formant Tilt EQ from toneShift (-5 warmer to +5 brighter)
    if (toneShift !== 0) {
      const lowShelf = offline.createBiquadFilter();
      lowShelf.type = 'lowshelf';
      lowShelf.frequency.value = 210;
      lowShelf.gain.value = -toneShift * 1.1;

      const highPeak = offline.createBiquadFilter();
      highPeak.type = 'peaking';
      highPeak.frequency.value = 2900;
      highPeak.Q.value = 0.85;
      highPeak.gain.value = toneShift * 1.15;

      tail.connect(lowShelf);
      lowShelf.connect(highPeak);
      tail = highPeak;
    }

    // Preset-specific acoustic shaping
    if (presetId === 'masculine' || presetId === 'deep_baritone') {
      const chestWarmth = offline.createBiquadFilter();
      chestWarmth.type = 'peaking';
      chestWarmth.frequency.value = presetId === 'deep_baritone' ? 125 : 155;
      chestWarmth.Q.value = 0.9;
      chestWarmth.gain.value = presetId === 'deep_baritone' ? 5 : 3.5;

      const lowPass = offline.createBiquadFilter();
      lowPass.type = 'lowpass';
      lowPass.frequency.value = presetId === 'deep_baritone' ? 3900 : 5200;

      tail.connect(chestWarmth);
      chestWarmth.connect(lowPass);
      tail = lowPass;
    } else if (presetId === 'feminine' || presetId === 'younger') {
      const highPass = offline.createBiquadFilter();
      highPass.type = 'highpass';
      highPass.frequency.value = presetId === 'younger' ? 210 : 165;

      const formantLift = offline.createBiquadFilter();
      formantLift.type = 'peaking';
      formantLift.frequency.value = presetId === 'younger' ? 3200 : 2800;
      formantLift.Q.value = 0.9;
      formantLift.gain.value = 3.5;

      const airShelf = offline.createBiquadFilter();
      airShelf.type = 'highshelf';
      airShelf.frequency.value = 6000;
      airShelf.gain.value = 2.5;

      tail.connect(highPass);
      highPass.connect(formantLift);
      formantLift.connect(airShelf);
      tail = airShelf;
    } else if (presetId === 'older') {
      const midWarmth = offline.createBiquadFilter();
      midWarmth.type = 'peaking';
      midWarmth.frequency.value = 880;
      midWarmth.Q.value = 0.8;
      midWarmth.gain.value = 3;

      const softHigh = offline.createBiquadFilter();
      softHigh.type = 'lowpass';
      softHigh.frequency.value = 3600;

      tail.connect(midWarmth);
      midWarmth.connect(softHigh);
      tail = softHigh;
    } else if (presetId === 'whisper_veil') {
      const highPass = offline.createBiquadFilter();
      highPass.type = 'highpass';
      highPass.frequency.value = 320;

      const breathPresence = offline.createBiquadFilter();
      breathPresence.type = 'peaking';
      breathPresence.frequency.value = 3800;
      breathPresence.gain.value = 4;

      tail.connect(highPass);
      highPass.connect(breathPresence);
      tail = breathPresence;
    } else if (presetId === 'radio_veil') {
      const bandpass = offline.createBiquadFilter();
      bandpass.type = 'bandpass';
      bandpass.frequency.value = 1150;
      bandpass.Q.value = 0.85;

      const shaper = offline.createWaveShaper();
      shaper.curve = makeSoftClipCurve(16);
      shaper.oversample = '2x';

      const gain = offline.createGain();
      gain.gain.value = 1.25;

      tail.connect(bandpass);
      bandpass.connect(shaper);
      shaper.connect(gain);
      tail = gain;
    }

    tail.connect(offline.destination);
    sourceNode.start(0);

    const rendered = await offline.startRendering();
    const wavBlob = encodeWavBlob(rendered);
    const audioUrl =
      wavBlob.size < 3_000_000 ? await blobToDataUrl(wavBlob) : URL.createObjectURL(wavBlob);

    return {
      blob: wavBlob,
      audioUrl,
      durationSeconds: Math.max(1, Math.round(rendered.duration)),
      bars: extractWaveformBars(rendered),
    };
  } finally {
    await ctx.close().catch(() => undefined);
  }
}

/**
 * Plays a short vocal-formant tone previewing the chosen voice persona when no mic clip exists.
 */
export async function playVoiceMaskTonePreview(
  presetId: VoiceMaskPresetId,
  semitones: number,
  toneShift = 0,
): Promise<void> {
  const ctx = createAudioContext();
  try {
    const now = ctx.currentTime;
    const baseFreq = 185 * Math.pow(2, semitones / 12);
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = presetId === 'radio_veil' || presetId === 'older' ? 'sawtooth' : 'triangle';
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.15, now + 0.16);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.96, now + 0.36);

    filter.type = presetId === 'radio_veil' ? 'bandpass' : 'lowpass';
    filter.frequency.value = Math.max(500, 1800 + toneShift * 260);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.15, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.44);
    setTimeout(() => {
      ctx.close().catch(() => undefined);
    }, 600);
  } catch {
    ctx.close().catch(() => undefined);
  }
}
