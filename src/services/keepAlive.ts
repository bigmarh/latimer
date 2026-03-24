/**
 * Plays a silent audio loop to prevent iOS/Android from suspending the page
 * when it's backgrounded. Must be started from a user gesture.
 */

let ctx: AudioContext | null = null;
let source: AudioBufferSourceNode | null = null;

export function startKeepAlive() {
  if (ctx) return; // already running

  try {
    ctx = new AudioContext();

    // 1-second silent buffer
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);

    const play = () => {
      if (!ctx) return;
      source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.loop = true;
      source.start(0);
    };

    if (ctx.state === 'suspended') {
      ctx.resume().then(play);
    } else {
      play();
    }
  } catch {
    // AudioContext not supported — ignore
  }
}

export function stopKeepAlive() {
  try {
    source?.stop();
    ctx?.close();
  } catch { /* ignore */ }
  source = null;
  ctx = null;
}
