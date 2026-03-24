import { createSignal, onMount, onCleanup, Show } from 'solid-js';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'latimer_install_dismissed';

const InstallBanner = () => {
  const [promptEvent, setPromptEvent] = createSignal<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = createSignal(false);

  const handler = (e: Event) => {
    e.preventDefault();
    if (localStorage.getItem(DISMISSED_KEY)) return;
    setPromptEvent(e as BeforeInstallPromptEvent);
    setVisible(true);
  };

  onMount(() => {
    // Don't show if already installed (standalone mode)
    if (window.matchMedia('(display-mode: standalone)').matches) return;
    if (localStorage.getItem(DISMISSED_KEY)) return;
    window.addEventListener('beforeinstallprompt', handler);
  });

  onCleanup(() => {
    window.removeEventListener('beforeinstallprompt', handler);
  });

  const install = async () => {
    const evt = promptEvent();
    if (!evt) return;
    await evt.prompt();
    const { outcome } = await evt.userChoice;
    if (outcome === 'accepted') {
      setVisible(false);
    }
  };

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, '1');
    setVisible(false);
  };

  return (
    <Show when={visible()}>
      <div
        class="fixed bottom-0 left-0 right-0 z-[9999] flex items-center gap-3 px-4 py-3 mx-3 mb-4 rounded-2xl"
        style={{
          background: 'rgba(18,18,28,0.95)',
          border: '1px solid rgba(124,58,237,0.3)',
          'backdrop-filter': 'blur(12px)',
          'box-shadow': '0 8px 32px rgba(0,0,0,0.4)',
        }}
      >
        <img src="/latimer-logo-face.svg" alt="Latimer" class="w-10 h-10 rounded-xl flex-shrink-0" />
        <div class="flex-1 min-w-0">
          <div class="text-sm font-semibold text-white" style="font-family: 'Syne', sans-serif;">
            Add Latimer to Home Screen
          </div>
          <div class="text-xs" style="color: #6b6b7a;">
            Install for faster access
          </div>
        </div>
        <button
          onClick={install}
          class="px-4 py-1.5 rounded-lg text-sm font-semibold flex-shrink-0"
          style="background: #7c3aed; color: #fff; font-family: 'Syne', sans-serif;"
        >
          Install
        </button>
        <button
          onClick={dismiss}
          class="flex-shrink-0 text-lg leading-none"
          style="color: #6b6b7a;"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    </Show>
  );
};

export default InstallBanner;
