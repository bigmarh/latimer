import type { Component } from 'solid-js';
import { onMount, onCleanup, createSignal, Show } from 'solid-js';
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
  logout(): Promise<void>;
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

export async function logoutNostrPass(): Promise<void> {
  if (embassyInstance) {
    try {
      await embassyInstance.logout();
      console.log('[Login] NostrPass logout succeeded');
    } catch (err) {
      console.warn('[Login] NostrPass logout failed (vault may still be authenticated):', err);
    }
    embassyInstance = null;
  } else {
    console.warn('[Login] logoutNostrPass called but embassyInstance is null');
  }
}

async function getOrInitEmbassy(relays: string[]): Promise<EmbassyInstance> {
  if (embassyInstance) return embassyInstance;

  if (!window.initNostrPassLite) throw new Error('NostrPass Lite CDN script not loaded');

  embassyInstance = await window.initNostrPassLite({
    appName: 'Latimer',
    namespace: 'latimer',
    relays,
    storagePrefix: 'latimer-nostrpass',
    vaultUrl: 'https://cdn.nostrpass.com/lite-vault/index.html',
    // Do not claim window.nostr on the login screen. If a NIP-07 extension is
    // present, eager provider install can break its request/response flow.
    installProviderOnInit: false,
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
  // Prevent repeated login calls — nostrpass-lite:status fires on every Nostr event
  let hasLoggedIn = false;
  // Only auto-login from status if returning user (loginMethod saved) or user explicitly
  // clicked the NostrPass button — prevents auto-relogin after logout when vault session persists
  let nostrPassClicked = false;
  let statusListenerAttached = false;
  let statusHandler: ((event: Event) => void) | null = null;
  let buttonObserver: MutationObserver | null = null;
  let nostrPassButtonCreated = false;
  const [hasExtension, setHasExtension] = createSignal(false);
  const [extLoading, setExtLoading] = createSignal(false);
  const [extError, setExtError] = createSignal('');
  const [nostrPassLoading, setNostrPassLoading] = createSignal(false);
  const [nostrPassError, setNostrPassError] = createSignal('');
  const [showNostrPassButton, setShowNostrPassButton] = createSignal(false);
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
      localStorage.setItem(STORAGE_KEYS.loginMethod, 'extension');
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

  const styleNostrPassButton = () => {
    const btn = (containerRef?.querySelector('button') ?? containerRef?.firstElementChild) as HTMLElement | null;
    if (!btn) return;
    btn.style.width = '100%';
    btn.style.minHeight = '48px';
    btn.style.borderRadius = '0.75rem';
    btn.style.fontSize = '0.875rem';
    btn.style.fontWeight = '600';
    btn.style.cursor = 'pointer';
    if (btn.textContent?.trim() === 'Sign in with NostrPass') {
      btn.style.backgroundColor = '#16a34a';
      btn.style.color = '#fff';
      btn.style.border = '1px solid #15803d';
    } else {
      btn.style.backgroundColor = '';
      btn.style.color = '';
      btn.style.border = '';
    }
  };

  const ensureNostrPassButton = (embassy: EmbassyInstance) => {
    if (!containerRef || nostrPassButtonCreated) return;

    embassy.createNostrPassLiteButton({
      appendTo: containerRef,
      labelSignedOut: 'Sign in with NostrPass',
      labelLocked: 'Unlock NostrPass',
      labelSignedIn: 'Connected',
    });
    nostrPassButtonCreated = true;
    setShowNostrPassButton(true);

    setTimeout(styleNostrPassButton, 50);
    if (!buttonObserver) {
      // Watch for childList/characterData only — NOT attributes, which would create an
      // infinite loop (styleNostrPassButton sets inline styles → attribute mutation → loop)
      buttonObserver = new MutationObserver(styleNostrPassButton);
      buttonObserver.observe(containerRef, { childList: true, subtree: true, characterData: true });
    }
  };

  const attachNostrPassStatusListener = (embassy: EmbassyInstance) => {
    if (statusListenerAttached) return;

    statusHandler = async (event: Event) => {
      const status = (event as CustomEvent<NostrPassLiteStatus>).detail;
      const savedLoginMethod = localStorage.getItem(STORAGE_KEYS.loginMethod);
      console.log('[Login] nostrpass-lite:status —', status.kind, '| authenticated:', status.auth?.isAuthenticated, '| locked:', status.auth?.isLocked, '| hasLoggedIn:', hasLoggedIn, '| nostrPassClicked:', nostrPassClicked, '| loginMethod:', savedLoginMethod);
      const allowAutoLogin = savedLoginMethod === 'nostrpass' || nostrPassClicked;
      if (!hasLoggedIn && allowAutoLogin && status.kind === 'ready' && status.auth?.isAuthenticated && !status.auth?.isLocked) {
        hasLoggedIn = true;
        console.log('[Login] NostrPass ready+authenticated — installing provider…');
        try {
          embassy.installNostrProvider({ overrideExisting: true });
          console.log('[Login] Provider installed. window.nostr now:', window.nostr ? 'present' : 'absent');

          let pubkey = status.auth.publicKey;
          console.log('[Login] pubkey from status.auth:', pubkey ? `${pubkey.slice(0, 8)}…` : 'none — will call getPublicKey');
          if (!pubkey) {
            const nostr = window.nostr;
            if (!nostr) {
              console.warn('[Login] window.nostr not available after installNostrProvider');
              return;
            }
            pubkey = await nostr.getPublicKey();
            console.log('[Login] pubkey from getPublicKey:', pubkey ? `${pubkey.slice(0, 8)}…` : 'FAILED');
          }
          localStorage.setItem(STORAGE_KEYS.pubkey, pubkey);
          localStorage.setItem(STORAGE_KEYS.relays, JSON.stringify(relays));
          localStorage.setItem(STORAGE_KEYS.loginMethod, 'nostrpass');
          console.log('[Login] Calling onLogin with pubkey:', pubkey.slice(0, 8), '…');
          props.onLogin(pubkey, relays);
        } catch (err) {
          console.error('[Login] Failed to get public key:', err);
        }
      }
    };

    window.addEventListener('nostrpass-lite:status', statusHandler);
    statusListenerAttached = true;
    console.log('[Login] Status listener attached');
  };

  const initNostrPass = async () => {
    setNostrPassError('');
    if (nostrPassLoading()) return;

    try {
      setNostrPassLoading(true);
      console.log('[Login] Initializing NostrPass embassy…');
      const embassy = await getOrInitEmbassy(relays);
      console.log('[Login] Embassy initialized. window.nostr after init:', window.nostr ? 'present' : 'absent');
      attachNostrPassStatusListener(embassy);
      ensureNostrPassButton(embassy);
      return embassy;
    } catch (err) {
      console.error('[Login] Failed to initialize NostrPass:', err);
      setNostrPassError('Failed to load NostrPass');
      return null;
    } finally {
      setNostrPassLoading(false);
    }
  };

  const handleNostrPassClick = async () => {
    nostrPassClicked = true;
    const embassy = await initNostrPass();
    if (!embassy || !containerRef) return;
    const btn = (containerRef.querySelector('button') ?? containerRef.firstElementChild) as HTMLElement | null;
    btn?.click();
  };

  onMount(async () => {
    // Wait for window.load so late-injecting extensions (Alby, etc.) have finished
    // injecting window.nostr. NostrPass isn't installed yet at this point.
    if (document.readyState !== 'complete') {
      await new Promise<void>(resolve => window.addEventListener('load', () => resolve(), { once: true }));
    }
    const earlyNostr = (window as Window & { __earlyNostr?: typeof window.nostr }).__earlyNostr
      ?? window.nostr
      ?? null;
    console.log('[Login] onMount — earlyNostr:', earlyNostr ? 'found' : 'none', '| window.nostr:', window.nostr ? 'present' : 'absent');
    if (earlyNostr) {
      realExtension = earlyNostr;
      setHasExtension(true);
      console.log('[Login] Real extension detected (nos2x/Alby)');
    }

    const savedLoginMethod = localStorage.getItem(STORAGE_KEYS.loginMethod);
    if (savedLoginMethod === 'nostrpass' || !earlyNostr) {
      void initNostrPass();
    } else {
      console.log('[Login] Extension present — deferring NostrPass init until explicit click');
    }
  });

  onCleanup(() => {
    buttonObserver?.disconnect();
    if (statusHandler) {
      window.removeEventListener('nostrpass-lite:status', statusHandler);
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

      <div class="w-full max-w-xs">
        <Show when={!showNostrPassButton()}>
          <button
            class="w-full py-3 rounded-xl font-medium text-sm flex items-center justify-center gap-2"
            style={{
              background: '#16a34a',
              color: '#fff',
              border: '1px solid #15803d',
              cursor: nostrPassLoading() ? 'not-allowed' : 'pointer',
              opacity: nostrPassLoading() ? '0.7' : '1',
            }}
            onClick={handleNostrPassClick}
            disabled={nostrPassLoading()}
          >
            {nostrPassLoading() ? 'Loading NostrPass…' : 'Sign in with NostrPass'}
          </button>
        </Show>
        {/* NostrPass button container — flex+center so injected button is centered */}
        <div
          ref={containerRef}
          class="nostrpass-btn-container w-full flex justify-center"
          style={{ display: showNostrPassButton() ? 'flex' : 'none' }}
          onClick={() => { nostrPassClicked = true; }}
        />
      </div>
      <Show when={nostrPassError()}>
        <p class="text-xs mt-1" style={{ color: 'var(--color-danger)' }}>{nostrPassError()}</p>
      </Show>

      {/* Extension button — shown prominently when a NIP-07 extension is detected */}
      <Show when={hasExtension()}>
        <button
          class="w-full max-w-xs mt-3 py-3 rounded-xl font-medium text-sm flex items-center justify-center gap-2"
          style={{
            background: 'var(--color-surface)',
            color: extLoading() ? 'var(--color-text-dim)' : 'var(--color-text)',
            border: '1px solid var(--color-border)',
            cursor: extLoading() ? 'not-allowed' : 'pointer',
            opacity: extLoading() ? '0.6' : '1',
          }}
          onClick={handleExtensionLogin}
          disabled={extLoading()}
        >
          🔌 {extLoading() ? 'Connecting…' : 'Sign in with Extension'}
        </button>
        <Show when={extError()}>
          <p class="text-xs mt-1" style={{ color: 'var(--color-danger)' }}>{extError()}</p>
        </Show>
      </Show>

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
