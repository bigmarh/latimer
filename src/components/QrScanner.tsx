import { onMount, onCleanup } from 'solid-js';
import jsQR from 'jsqr';

interface QrScannerProps {
  onScan: (value: string) => void;
  onClose: () => void;
}

const QrScanner = (props: QrScannerProps) => {
  let videoRef: HTMLVideoElement | undefined;
  let canvasRef: HTMLCanvasElement | undefined;
  let stream: MediaStream | null = null;
  let rafId: number | null = null;
  let found = false;

  const tick = () => {
    if (found || !videoRef || !canvasRef) return;
    if (videoRef.readyState !== videoRef.HAVE_ENOUGH_DATA) {
      rafId = requestAnimationFrame(tick);
      return;
    }

    const ctx = canvasRef.getContext('2d');
    if (!ctx) return;

    canvasRef.width = videoRef.videoWidth;
    canvasRef.height = videoRef.videoHeight;
    ctx.drawImage(videoRef, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvasRef.width, canvasRef.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height);

    if (code) {
      found = true;
      props.onScan(code.data);
      return;
    }

    rafId = requestAnimationFrame(tick);
  };

  onMount(async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      if (videoRef) {
        videoRef.srcObject = stream;
        videoRef.play();
        rafId = requestAnimationFrame(tick);
      }
    } catch {
      props.onClose();
    }
  });

  onCleanup(() => {
    if (rafId !== null) cancelAnimationFrame(rafId);
    stream?.getTracks().forEach((t) => t.stop());
  });

  return (
    <div
      class="fixed inset-0 z-[100] flex flex-col"
      style={{ background: '#000' }}
    >
      {/* Viewfinder */}
      <div class="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          class="absolute inset-0 w-full h-full object-cover"
          playsinline
          muted
        />
        <canvas ref={canvasRef} class="hidden" />

        {/* Overlay with cutout */}
        <div class="absolute inset-0 flex items-center justify-center">
          <div
            class="relative w-64 h-64 rounded-2xl"
            style={{ 'box-shadow': '0 0 0 9999px rgba(0,0,0,0.6)' }}
          >
            {/* Corner marks */}
            {(['tl', 'tr', 'bl', 'br'] as const).map((corner) => (
              <div
                class={`absolute w-8 h-8 ${corner.startsWith('t') ? 'top-0' : 'bottom-0'} ${corner.endsWith('l') ? 'left-0' : 'right-0'}`}
                style={{
                  'border-color': '#7c3aed',
                  'border-style': 'solid',
                  'border-width': corner.startsWith('t')
                    ? (corner === 'tl' ? '3px 0 0 3px' : '3px 3px 0 0')
                    : (corner === 'bl' ? '0 0 3px 3px' : '0 3px 3px 0'),
                  'border-radius': corner === 'tl' ? '8px 0 0 0' : corner === 'tr' ? '0 8px 0 0' : corner === 'bl' ? '0 0 0 8px' : '0 0 8px 0',
                }}
              />
            ))}
          </div>
        </div>

        <p
          class="absolute bottom-8 left-0 right-0 text-center text-sm"
          style={{ color: 'rgba(255,255,255,0.7)' }}
        >
          Point at an npub QR code
        </p>
      </div>

      {/* Close button */}
      <div class="p-6 safe-bottom">
        <button
          class="btn-pill btn-secondary w-full"
          onClick={props.onClose}
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

export default QrScanner;
