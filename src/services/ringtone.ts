/**
 * Generates a two-burst phone ringtone using Web Audio API.
 * No audio file required — works everywhere including iOS (after a user gesture).
 */

let ctx: AudioContext | null = null;
let loopTimer: ReturnType<typeof setTimeout> | null = null;
let running = false;

function playBurst(audioCtx: AudioContext, startTime: number, duration: number) {
  const gain = audioCtx.createGain();
  gain.connect(audioCtx.destination);

  // Two tones layered for a classic phone ring timbre
  const freqs = [880, 1100];
  for (const freq of freqs) {
    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    osc.connect(gain);
    osc.start(startTime);
    osc.stop(startTime + duration);
  }

  // Envelope: quick fade in, hold, quick fade out
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(0.18, startTime + 0.02);
  gain.gain.setValueAtTime(0.18, startTime + duration - 0.04);
  gain.gain.linearRampToValueAtTime(0, startTime + duration);
}

function scheduleRing(audioCtx: AudioContext) {
  if (!running) return;
  const now = audioCtx.currentTime;
  // Ring-ring pattern: two 0.4s bursts separated by 0.2s, then 2s silence
  playBurst(audioCtx, now, 0.4);
  playBurst(audioCtx, now + 0.6, 0.4);

  loopTimer = setTimeout(() => scheduleRing(audioCtx), 3_000);
}

export function startRingtone() {
  if (running) return;
  running = true;
  try {
    ctx = new AudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume().then(() => scheduleRing(ctx!));
    } else {
      scheduleRing(ctx);
    }
  } catch {
    running = false;
  }
}

export function stopRingtone() {
  running = false;
  if (loopTimer !== null) {
    clearTimeout(loopTimer);
    loopTimer = null;
  }
  try {
    ctx?.close();
  } catch { /* ignore */ }
  ctx = null;
}
