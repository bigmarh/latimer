import type { Component } from 'solid-js';
import { createSignal, onMount } from 'solid-js';
import { store, setStore } from '../store';
import { buildInviteUrl, clearEphemeralSession } from '../services/ephemeral';
import { nip19 } from 'nostr-tools';
import QRCode from 'qrcode';
import { signalingService } from '../services/signaling';
import { webrtcService } from '../services/webrtc';

interface IncognitoLobbyProps {
  onCancel: () => void;
}

const IncognitoLobby: Component<IncognitoLobbyProps> = (props) => {
  const [inviteUrl, setInviteUrl] = createSignal('');
  const [qrDataUrl, setQrDataUrl] = createSignal('');
  const [copied, setCopied] = createSignal(false);

  const npub = () => {
    try { return nip19.npubEncode(store.pubkey); } catch { return store.pubkey; }
  };

  onMount(async () => {
    const url = buildInviteUrl(npub(), store.relays);
    setInviteUrl(url);
    try {
      const dataUrl = await QRCode.toDataURL(url, {
        width: 220,
        margin: 2,
        color: { dark: '#ffffff', light: '#1a1025' },
      });
      setQrDataUrl(dataUrl);
    } catch { /* ignore */ }
  });

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  const handleCancel = () => {
    clearEphemeralSession();
    signalingService.destroy();
    webrtcService.cleanup();
    setStore({
      loggedIn: false,
      pubkey: '',
      incognito: false,
      callState: 'idle',
      activeCallContact: null,
      activeCallId: null,
      contacts: [],
      recentCalls: [],
    });
    props.onCancel();
  };

  return (
    <div
      class="flex flex-col items-center justify-center h-full gap-6 px-6"
      style={{ background: 'var(--color-bg)' }}
    >
      {/* Icon + Title */}
      <div class="flex flex-col items-center gap-2 text-center">
        <div
          class="flex items-center justify-center w-16 h-16 rounded-full text-3xl"
          style={{ background: 'rgba(124,58,237,0.15)', color: 'var(--color-accent)' }}
        >
          🕵️
        </div>
        <h1 class="text-xl font-bold" style={{ color: 'var(--color-text)' }}>
          Incognito Call
        </h1>
        <p class="text-sm" style={{ color: 'var(--color-text-dim)' }}>
          Share this link or QR code. When someone joins, you'll get an incoming call.
        </p>
      </div>

      {/* QR Code */}
      {qrDataUrl() && (
        <div
          class="rounded-2xl overflow-hidden"
          style={{ border: '2px solid var(--color-border)', padding: '12px', background: '#1a1025' }}
        >
          <img src={qrDataUrl()} alt="Invite QR code" style={{ width: '220px', height: '220px', display: 'block' }} />
        </div>
      )}

      {/* Copy link */}
      <div class="flex flex-col gap-2 w-full" style={{ 'max-width': '320px' }}>
        <div
          class="rounded-xl px-3 py-2 text-xs break-all"
          style={{ background: 'var(--color-surface)', color: 'var(--color-text-dim)', border: '1px solid var(--color-border)' }}
        >
          {inviteUrl()}
        </div>
        <button
          class="w-full py-3 rounded-xl font-semibold text-sm transition-colors"
          style={{
            background: copied() ? 'var(--color-success, #22c55e)' : 'var(--color-accent)',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
          }}
          onClick={handleCopy}
        >
          {copied() ? 'Copied!' : 'Copy Invite Link'}
        </button>
      </div>

      {/* Waiting indicator */}
      <div class="flex items-center gap-2" style={{ color: 'var(--color-text-dim)' }}>
        <div
          class="w-2 h-2 rounded-full"
          style={{ background: 'var(--color-accent)', animation: 'pulse 2s infinite' }}
        />
        <span class="text-sm">Waiting for someone to join…</span>
      </div>

      {/* Cancel */}
      <button
        class="text-sm py-2 px-6 rounded-xl"
        style={{ background: 'var(--color-surface)', color: 'var(--color-text-dim)', border: '1px solid var(--color-border)', cursor: 'pointer' }}
        onClick={handleCancel}
      >
        Cancel
      </button>
    </div>
  );
};

export default IncognitoLobby;
