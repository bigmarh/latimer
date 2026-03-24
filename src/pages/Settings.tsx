import type { Component } from 'solid-js';
import { createSignal, onMount, Show, For } from 'solid-js';
import QRCode from 'qrcode';
import { nip19 } from 'nostr-tools';
import { store, setStore, setView } from '../store';
import { getDisplayName, getAvatarInitials, truncatePubkey } from '../services/nostr';
import { STORAGE_KEYS } from '../constants';
import { signalingService } from '../services/signaling';
import {
  cameras, mics, selectedCameraId, selectedMicId,
  selectCamera, selectMic, enumerateDevices,
} from '../services/devices';
import { ChevronLeftIcon, CopyIcon, QrCodeIcon } from '../components/icons';

function getPubkeyGradient(pubkey: string): string {
  const hex = pubkey.replace(/[^0-9a-fA-F]/g, '');
  if (hex.length < 12) return 'linear-gradient(135deg, #7c3aed, #6d28d9)';
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const r2 = parseInt(hex.slice(6, 8), 16);
  const g2 = parseInt(hex.slice(8, 10), 16);
  const b2 = parseInt(hex.slice(10, 12), 16);
  return `linear-gradient(135deg, rgb(${r},${g},${b}), rgb(${r2},${g2},${b2}))`;
}

const Settings: Component = () => {
  const [relayText, setRelayText] = createSignal(store.relays.join('\n'));
  const [copied, setCopied] = createSignal(false);
  const [savedRelays, setSavedRelays] = createSignal(false);
  const [showQR, setShowQR] = createSignal(false);
  const [qrDataUrl, setQrDataUrl] = createSignal('');

  const npub = () => {
    try { return nip19.npubEncode(store.pubkey); } catch { return store.pubkey; }
  };

  onMount(() => {
    void enumerateDevices().catch(() => {
      // Permission not yet granted; devices will populate after first call
    });
  });

  const [copiedLink, setCopiedLink] = createSignal(false);

  const handleCopyProfileLink = async () => {
    try {
      const { buildProfileUrl } = await import('../services/ephemeral');
      const url = buildProfileUrl(npub());
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch { /* ignore */ }
  };

  const openQR = async () => {
    if (!qrDataUrl()) {
      const url = await QRCode.toDataURL(`nostr:${npub()}`, {
        width: 280,
        margin: 2,
        color: { dark: '#ffffff', light: '#1a1025' },
      });
      setQrDataUrl(url);
    }
    setShowQR(true);
  };

  // Find current user's contact profile
  const profile = () =>
    store.contacts.find((c) => c.pubkey === store.pubkey) ?? { pubkey: store.pubkey };

  const displayName = () => getDisplayName(profile());
  const initials = () => getAvatarInitials(profile());
  const gradient = () => getPubkeyGradient(store.pubkey);

  const handleCopyPubkey = async () => {
    try {
      await navigator.clipboard.writeText(npub());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  const handleSaveRelays = () => {
    const relays = relayText()
      .split('\n')
      .map((r) => r.trim())
      .filter((r) => r.startsWith('wss://') || r.startsWith('ws://'));

    if (relays.length === 0) return;

    setStore('relays', relays);
    localStorage.setItem(STORAGE_KEYS.relays, JSON.stringify(relays));
    setSavedRelays(true);
    setTimeout(() => setSavedRelays(false), 2000);
  };

  const handleLogout = async () => {
    // Clear storage
    localStorage.removeItem(STORAGE_KEYS.pubkey);
    localStorage.removeItem(STORAGE_KEYS.relays);
    localStorage.removeItem(STORAGE_KEYS.loginMethod);

    // Destroy signaling
    signalingService.destroy();

    // Reset store
    setStore({
      loggedIn: false,
      pubkey: '',
      contacts: [],
      contactsLoaded: false,
      callState: 'idle',
      activeCallId: null,
      activeCallContact: null,
      incomingCall: null,
      view: 'home',
      recentCalls: [],
    });
  };

  return (
    <div class="flex flex-col h-full" style={{ background: 'var(--color-bg)' }}>
      {/* Header */}
      <header
        class="safe-top flex items-center gap-3 px-4 pt-2 pb-3"
        style={{ background: 'var(--color-surface)', 'border-bottom': '1px solid var(--color-border)' }}
      >
        <button
          class="flex items-center justify-center w-9 h-9 rounded-full"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text)' }}
          onClick={() => setView('home')}
          aria-label="Back"
        >
          <ChevronLeftIcon size={22} />
        </button>
        <h1 class="text-base font-semibold" style={{ color: 'var(--color-text)' }}>
          Settings
        </h1>
      </header>

      <div class="scroll-area flex-1 px-4 py-4 flex flex-col gap-5">
        {/* Profile section */}
        <div class="card p-4 flex flex-col gap-4">
          <h2 class="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
            Profile
          </h2>

          <div class="flex items-center gap-4">
            {/* Avatar */}
            <div
              class="avatar w-14 h-14 text-xl font-bold flex-shrink-0"
              style={{ background: profile() && 'picture' in profile() && (profile() as { picture?: string }).picture ? 'transparent' : gradient() }}
            >
              {(profile() as { picture?: string }).picture ? (
                <img
                  src={(profile() as { picture?: string }).picture}
                  alt={displayName()}
                  class="w-full h-full object-cover rounded-full"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : (
                <span>{initials()}</span>
              )}
            </div>

            {/* Name + pubkey */}
            <div class="flex-1 min-w-0">
              <p class="font-semibold truncate" style={{ color: 'var(--color-text)' }}>
                {displayName()}
              </p>
              <button
                class="flex items-center gap-1.5 mt-1"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0' }}
                onClick={handleCopyPubkey}
              >
                <span class="text-xs font-mono" style={{ color: 'var(--color-text-muted)' }}>
                  {truncatePubkey(store.pubkey)}
                </span>
                <CopyIcon
                  size={12}
                  style={{ color: copied() ? 'var(--color-call-green)' : 'var(--color-text-muted)' }}
                />
                {copied() && (
                  <span class="text-xs" style={{ color: 'var(--color-call-green)' }}>
                    Copied!
                  </span>
                )}
              </button>
            </div>

            {/* QR button */}
            <button
              onClick={openQR}
              class="flex items-center justify-center w-10 h-10 rounded-xl flex-shrink-0"
              style={{ background: 'var(--color-accent)', color: '#fff', border: 'none', cursor: 'pointer' }}
              aria-label="Show QR code"
            >
              <QrCodeIcon size={18} />
            </button>

            {/* Copy profile link button */}
            <button
              onClick={handleCopyProfileLink}
              class="flex items-center justify-center w-10 h-10 rounded-xl flex-shrink-0"
              style={{ background: 'var(--color-surface-2)', color: copiedLink() ? 'var(--color-call-green)' : 'var(--color-text)', border: '1px solid var(--color-border)', cursor: 'pointer' }}
              aria-label="Copy profile link"
              title="Copy shareable profile link"
            >
              🔗
            </button>
          </div>
        </div>

        {/* Media device pickers */}
        <div class="card p-4 flex flex-col gap-4">
          <h2 class="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
            Camera & Microphone
          </h2>

          {/* Camera picker */}
          <Show when={cameras().length > 0} fallback={
            <p class="text-xs" style={{ color: 'var(--color-text-dim)' }}>
              Camera list will appear after your first call.
            </p>
          }>
            <div class="flex flex-col gap-1.5">
              <label class="text-xs" style={{ color: 'var(--color-text-muted)' }}>Camera</label>
              <select
                value={selectedCameraId()}
                onChange={(e) => selectCamera(e.currentTarget.value)}
                class="w-full px-3 py-2.5 rounded-xl text-sm outline-none appearance-none"
                style={{
                  background: 'var(--color-surface-2)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text)',
                }}
              >
                <option value="">Default camera</option>
                <For each={cameras()}>
                  {(cam) => <option value={cam.deviceId}>{cam.label}</option>}
                </For>
              </select>
            </div>
          </Show>

          {/* Mic picker */}
          <Show when={mics().length > 0}>
            <div class="flex flex-col gap-1.5">
              <label class="text-xs" style={{ color: 'var(--color-text-muted)' }}>Microphone</label>
              <select
                value={selectedMicId()}
                onChange={(e) => selectMic(e.currentTarget.value)}
                class="w-full px-3 py-2.5 rounded-xl text-sm outline-none appearance-none"
                style={{
                  background: 'var(--color-surface-2)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text)',
                }}
              >
                <option value="">Default microphone</option>
                <For each={mics()}>
                  {(mic) => <option value={mic.deviceId}>{mic.label}</option>}
                </For>
              </select>
            </div>
          </Show>
        </div>

        {/* Relay configuration */}
        <div class="card p-4 flex flex-col gap-3">
          <h2 class="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
            Relays
          </h2>
          <p class="text-xs" style={{ color: 'var(--color-text-dim)' }}>
            One relay URL per line (wss://...)
          </p>
          <textarea
            value={relayText()}
            onInput={(e) => setRelayText((e.target as HTMLTextAreaElement).value)}
            rows={4}
            class="w-full p-3 rounded-xl text-xs font-mono resize-none outline-none"
            style={{
              background: 'var(--color-surface-2)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text)',
            }}
            spellcheck={false}
          />
          <button
            class="btn-pill btn-primary px-4 py-2 text-sm self-end"
            onClick={handleSaveRelays}
          >
            {savedRelays() ? 'Saved!' : 'Save Relays'}
          </button>
        </div>

        {/* About */}
        <div class="card p-4 flex flex-col gap-2">
          <h2 class="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
            About
          </h2>
          <div class="flex justify-between items-center py-1">
            <span class="text-sm" style={{ color: 'var(--color-text-dim)' }}>Version</span>
            <span class="text-sm" style={{ color: 'var(--color-text)' }}>0.1.0</span>
          </div>
          <div class="flex justify-between items-center py-1">
            <span class="text-sm" style={{ color: 'var(--color-text-dim)' }}>Built on</span>
            <span class="text-sm" style={{ color: 'var(--color-text)' }}>Nostr / TAT Protocol</span>
          </div>
          <a
            href="https://github.com/bigmarh/tat-protocol"
            target="_blank"
            rel="noopener noreferrer"
            class="text-sm py-1"
            style={{ color: 'var(--color-accent)' }}
          >
            GitHub →
          </a>
        </div>

        {/* Logout */}
        <div class="safe-bottom-nav">
          <button
            class="btn-pill w-full px-4 py-3 text-sm"
            style={{
              background: 'rgba(239, 68, 68, 0.1)',
              color: 'var(--color-danger)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
            }}
            onClick={handleLogout}
          >
            Sign Out
          </button>
        </div>
      </div>
      {/* QR Code modal */}
      <Show when={showQR()}>
        <div
          class="fixed inset-0 z-50 flex items-center justify-center px-6"
          style={{ background: 'rgba(0,0,0,0.8)' }}
          onClick={() => setShowQR(false)}
        >
          <div
            class="flex flex-col items-center gap-4 p-6 rounded-2xl w-full max-w-xs"
            style={{ background: 'var(--color-surface)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <p class="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
              Share your Nostr profile
            </p>

            {/* QR image */}
            <Show when={qrDataUrl()}>
              <img
                src={qrDataUrl()}
                alt="Nostr profile QR code"
                width={220}
                height={220}
                style={{ 'border-radius': '12px' }}
              />
            </Show>

            {/* npub */}
            <p
              class="text-xs font-mono text-center break-all px-2"
              style={{ color: 'var(--color-text-muted)' }}
            >
              {npub()}
            </p>

            {/* Actions */}
            <div class="flex gap-3 w-full">
              <button
                class="btn-pill btn-secondary flex-1 text-sm"
                onClick={handleCopyPubkey}
              >
                {copied() ? 'Copied!' : 'Copy npub'}
              </button>
              <button
                class="btn-pill btn-primary flex-1 text-sm"
                onClick={() => setShowQR(false)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
};

export default Settings;
