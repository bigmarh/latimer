import type { Component } from 'solid-js';
import { onMount, createSignal, Show } from 'solid-js';
import { nip19 } from 'nostr-tools';
import { KeySigner } from '@tat-protocol/signers';
import { DEFAULT_RELAYS, STORAGE_KEYS } from '../constants';

// Types for the NostrPass Lite CDN global (window.initNostrPassLite)
interface EmbassyInstance {
  createNostrPassLiteButton(opts: {
    appendTo: HTMLElement;
    labelSignedOut?: string;
    labelLocked?: string;
    labelSignedIn?: string;
  }): void;
  installNostrProvider(opts: { overrideExisting?: boolean }): void;
}

interface LiteAuthState {
  initialized: boolean;
  isAuthenticated: boolean;
  isLocked: boolean;
  publicKey?: string;
}

interface NostrPassLiteStatus {
  kind: string;
  timestamp: number;
  auth: LiteAuthState;
  detail?: Record<string, unknown>;
}

// Loaded from https://cdn.nostrpass.com/lite-embassy@0.1.2.js in index.html
declare global {
  interface Window {
    initNostrPassLite?: (opts: Record<string, unknown>) => Promise<EmbassyInstance>;
  }
}

// Module-level singleton
let embassyInstance: EmbassyInstance | null = null;

async function getOrInitEmbassy(relays: string[]): Promise<EmbassyInstance> {
  if (embassyInstance) return embassyInstance;

  if (!window.initNostrPassLite) throw new Error('NostrPass Lite CDN script not loaded');

  embassyInstance = await window.initNostrPassLite({
    appName: 'Latimer',
    namespace: 'latimer',
    relays,
    storagePrefix: 'latimer-nostrpass',
    vaultUrl: 'https://cdn.nostrpass.com/lite-vault/index.html',
    installProviderOnInit: true,
    overrideExistingProvider: true,
    permissionDefaults: {
      getPublicKey: 'ALLOW',
      signEvent: 'ALLOW',
      signData: 'ALLOW',
      'nip44.encrypt': 'ALLOW',
      'nip44.decrypt': 'ALLOW',
      'nip04.encrypt': 'ALLOW',
      'nip04.decrypt': 'ALLOW',
    },
  });

  return embassyInstance;
}

interface LoginProps {
  onLogin: (pubkey: string, relays: string[]) => void;
  onLoginWithSigner: (pubkey: string, relays: string[], signer: KeySigner, skHex?: string) => void;
  onIncognito: () => void;
}

const Login: Component<LoginProps> = (props) => {
  // eslint-disable-next-line solid/reactivity
  let containerRef: HTMLDivElement | undefined;
  // Captured BEFORE NostrPass overrides window.nostr
  let realExtension: typeof window.nostr | null = null;
  const [hasExtension, setHasExtension] = createSignal(false);
  const [extLoading, setExtLoading] = createSignal(false);
  const [extError, setExtError] = createSignal('');
  const [showMore, setShowMore] = createSignal(false);
  const [nsec, setNsec] = createSignal('');
  const [nsecError, setNsecError] = createSignal('');
  const [nsecLoading, setNsecLoading] = createSignal(false);

  const relays = (() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.relays);
      return saved ? (JSON.parse(saved) as string[]) : DEFAULT_RELAYS;
    } catch {
      return DEFAULT_RELAYS;
    }
  })();

  const handleExtensionLogin = async () => {
    setExtLoading(true);
    setExtError('');
    try {
      const ext = realExtension;
      if (!ext) { setExtError('No extension found'); return; }
      const pubkey = await ext.getPublicKey();
      localStorage.setItem(STORAGE_KEYS.pubkey, pubkey);
      localStorage.setItem(STORAGE_KEYS.relays, JSON.stringify(relays));
      props.onLogin(pubkey, relays);
    } catch (err) {
      setExtError('Extension denied access');
      console.error('[Login] Extension login failed:', err);
    } finally {
      setExtLoading(false);
    }
  };

  const handleNsecLogin = () => {
    setNsecError('');
    setNsecLoading(true);
    try {
      const raw = nsec().trim();
      if (!raw) { setNsecError('Enter your nsec'); setNsecLoading(false); return; }
      const decoded = nip19.decode(raw);
      if (decoded.type !== 'nsec') { setNsecError('Invalid nsec — must start with nsec1…'); setNsecLoading(false); return; }
      const sk = decoded.data as Uint8Array;
      const skHex = Array.from(sk, b => b.toString(16).padStart(2, '0')).join('');
      const signer = new KeySigner(sk);
      signer.getPublicKey().then((pubkey) => {
        // Don't persist nsec — session only
        localStorage.setItem(STORAGE_KEYS.relays, JSON.stringify(relays));
        props.onLoginWithSigner(pubkey, relays, signer, skHex);
      }).catch(() => {
        setNsecError('Failed to derive public key');
        setNsecLoading(false);
      });
    } catch {
      setNsecError('Invalid nsec format');
      setNsecLoading(false);
    }
  };

  onMount(async () => {
    // Capture the real extension BEFORE NostrPass can override window.nostr
    const capturedBeforeInit = window.nostr ?? null;
    if (capturedBeforeInit) {
      realExtension = capturedBeforeInit;
      setHasExtension(true);
    }
    try {
      const embassy = await getOrInitEmbassy(relays);

      // After NostrPass init (overrideExistingProvider: true), window.nostr is now
      // the NostrPass provider. If our captured reference is the same object,
      // NostrPass was already installed before we ran — it's not a real extension.
      if (realExtension !== null && realExtension === window.nostr) {
        realExtension = null;
        setHasExtension(false);
      }

      if (containerRef) {
        embassy.createNostrPassLiteButton({
          appendTo: containerRef,
          labelSignedOut: 'Sign in with NostrPass',
          labelLocked: 'Unlock NostrPass',
          labelSignedIn: 'Connected',
        });
      }

      const handleStatus = async (event: Event) => {
        const status = (event as CustomEvent<NostrPassLiteStatus>).detail;
        if (status.kind === 'ready' && status.auth?.isAuthenticated && !status.auth?.isLocked) {
          try {
            // publicKey may be on the auth state directly; fall back to window.nostr
            let pubkey = status.auth.publicKey;
            if (!pubkey) {
              embassy.installNostrProvider({ overrideExisting: true });
              const nostr = window.nostr;
              if (!nostr) {
                console.warn('[Login] window.nostr not available after installNostrProvider');
                return;
              }
              pubkey = await nostr.getPublicKey();
            }
            localStorage.setItem(STORAGE_KEYS.pubkey, pubkey);
            localStorage.setItem(STORAGE_KEYS.relays, JSON.stringify(relays));
            props.onLogin(pubkey, relays);
          } catch (err) {
            console.error('[Login] Failed to get public key:', err);
          }
        }
      };

      window.addEventListener('nostrpass-lite:status', handleStatus);
    } catch (err) {
      console.error('[Login] Failed to initialize NostrPass:', err);
    }
  });

  return (
    <div
      class="flex flex-col items-center justify-center min-h-screen px-6 fade-enter"
      style={{ background: 'var(--color-bg)' }}
    >
      {/* Logo */}
      <div class="mb-6 flex flex-col items-center gap-3">
        <img
          src="/latimer-logo-face.svg"
          alt="Latimer"
          width="96"
          height="96"
          style={{ 'border-radius': '20px' }}
        />
        <h1
          class="text-3xl font-bold tracking-tight"
          style={{ color: 'var(--color-text)' }}
        >
          Latimer
        </h1>
      </div>

      {/* Subtitle */}
      <p
        class="text-sm text-center mb-10 max-w-xs"
        style={{ color: 'var(--color-text-dim)' }}
      >
        End-to-end encrypted calls on Nostr
      </p>

      {/* NostrPass button container — flex+center so injected button is centered */}
      <div ref={containerRef} class="w-full max-w-xs flex justify-center" />

      {/* Divider */}
      <div class="flex items-center gap-3 w-full max-w-xs mt-4">
        <div class="flex-1 h-px" style={{ background: 'var(--color-border)' }} />
        <span class="text-xs" style={{ color: 'var(--color-text-dim)' }}>or</span>
        <div class="flex-1 h-px" style={{ background: 'var(--color-border)' }} />
      </div>

      {/* Incognito button */}
      <button
        class="w-full max-w-xs mt-3 py-3 rounded-xl font-medium text-sm flex items-center justify-center gap-2"
        style={{
          background: 'var(--color-surface)',
          color: 'var(--color-text-dim)',
          border: '1px solid var(--color-border)',
          cursor: 'pointer',
        }}
        onClick={props.onIncognito}
      >
        🕵️ Start Incognito Call
      </button>

      {/* More sign-in options — collapsible */}
      <button
        class="mt-4 text-xs flex items-center gap-1"
        style={{ color: 'var(--color-text-dim)', background: 'none', border: 'none', cursor: 'pointer' }}
        onClick={() => setShowMore((v) => !v)}
      >
        <span>{showMore() ? '▲' : '▼'}</span>
        More sign-in options
      </button>

      <Show when={showMore()}>
        <div
          class="w-full max-w-xs mt-2 rounded-xl overflow-hidden flex flex-col gap-0"
          style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}
        >
          {/* Extension / Switch Account */}
          <div class="px-4 py-3" style={{ 'border-bottom': '1px solid var(--color-border)' }}>
            <p class="text-xs mb-2" style={{ color: 'var(--color-text-dim)' }}>
              Switch account or use a NIP-07 extension (Alby, nos2x…)
            </p>
            <button
              class="w-full py-2 rounded-lg font-medium text-sm flex items-center justify-center gap-2"
              style={{
                background: 'var(--color-bg)',
                color: hasExtension() ? 'var(--color-text)' : 'var(--color-text-dim)',
                border: '1px solid var(--color-border)',
                cursor: extLoading() || !hasExtension() ? 'not-allowed' : 'pointer',
                opacity: extLoading() || !hasExtension() ? '0.5' : '1',
              }}
              onClick={handleExtensionLogin}
              disabled={extLoading() || !hasExtension()}
            >
              🔌 {extLoading() ? 'Connecting…' : hasExtension() ? 'Sign in with Extension' : 'No extension detected'}
            </button>
            <Show when={extError()}>
              <p class="text-xs mt-1 text-center" style={{ color: 'var(--color-danger)' }}>{extError()}</p>
            </Show>
          </div>

          {/* nsec */}
          <div class="px-4 py-3">
            <p class="text-xs mb-2" style={{ color: 'var(--color-text-dim)' }}>
              Paste your nsec — session only, never stored
            </p>
            <input
              type="password"
              placeholder="nsec1…"
              value={nsec()}
              onInput={(e) => setNsec(e.currentTarget.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleNsecLogin()}
              class="w-full px-3 py-2 rounded-lg text-sm font-mono mb-2"
              style={{
                background: 'var(--color-bg)',
                color: 'var(--color-text)',
                border: `1px solid ${nsecError() ? 'var(--color-danger)' : 'var(--color-border)'}`,
                outline: 'none',
              }}
            />
            <Show when={nsecError()}>
              <p class="text-xs mb-2" style={{ color: 'var(--color-danger)' }}>{nsecError()}</p>
            </Show>
            <button
              class="w-full py-2 rounded-lg font-medium text-sm"
              style={{
                background: 'var(--color-accent)',
                color: '#fff',
                border: 'none',
                cursor: nsecLoading() ? 'not-allowed' : 'pointer',
                opacity: nsecLoading() || !nsec() ? '0.6' : '1',
              }}
              onClick={handleNsecLogin}
              disabled={nsecLoading() || !nsec()}
            >
              {nsecLoading() ? 'Signing in…' : 'Sign in with nsec'}
            </button>
          </div>
        </div>
      </Show>

      {/* Learn more */}
      <a
        href="https://nostrpass.com"
        target="_blank"
        rel="noopener noreferrer"
        class="mt-8 text-xs"
        style={{ color: 'var(--color-text-muted)' }}
      >
        Learn more about NostrPass
      </a>
    </div>
  );
};

export default Login;
