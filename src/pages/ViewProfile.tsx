import type { Component } from 'solid-js';
import { createSignal, onMount, Show } from 'solid-js';
import { nip19 } from 'nostr-tools';
import { loadProfile, publishFollowList } from '../services/nostr';
import { store, setStore } from '../store';
import { signalingService } from '../services/signaling';
import type { Contact } from '../types';

interface ViewProfileProps {
  pubkey: string;
  onClose: () => void;
  onCall?: (contact: Contact) => void;
}

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

const ViewProfile: Component<ViewProfileProps> = (props) => {
  const [profile, setProfile] = createSignal<Contact | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [added, setAdded] = createSignal(false);
  const [addedMsg, setAddedMsg] = createSignal('');

  const npub = () => { try { return nip19.npubEncode(props.pubkey); } catch { return props.pubkey.slice(0, 16) + '…'; } };
  const isAlreadyContact = () => store.contacts.some((c) => c.pubkey === props.pubkey);

  onMount(async () => {
    // Check in existing contacts first
    const existing = store.contacts.find((c) => c.pubkey === props.pubkey);
    if (existing) { setProfile(existing); setLoading(false); return; }
    // Fetch from Nostr
    const relays = store.relays.length > 0 ? store.relays : [];
    if (relays.length > 0) {
      const p = await loadProfile(props.pubkey, relays).catch(() => ({ pubkey: props.pubkey }));
      setProfile(p);
    } else {
      setProfile({ pubkey: props.pubkey });
    }
    setLoading(false);
  });

  const handleAdd = async () => {
    const p = profile() ?? { pubkey: props.pubkey };
    if (isAlreadyContact()) { setAddedMsg('Already in contacts'); return; }
    const updated = [...store.contacts, p];
    setStore('contacts', updated);
    try { localStorage.setItem('latimer-contacts', JSON.stringify(updated)); } catch { /* ignore */ }
    setAdded(true);
    setAddedMsg('Added to contacts!');
    // Publish follow list
    void publishFollowList(updated, store.relays, (t) => signalingService.signEvent(t)).catch(() => {});
  };

  const handleCall = (_type: 'audio' | 'video') => {
    const p = profile() ?? { pubkey: props.pubkey };
    if (props.onCall) { props.onCall(p); }
    else {
      // If not logged in, just close
      props.onClose();
    }
  };

  const displayName = () => {
    const p = profile();
    if (!p) return npub();
    return p.displayName || p.name || npub();
  };

  return (
    <div class="flex flex-col items-center justify-center h-full px-6 gap-5" style={{ background: 'var(--color-bg)' }}>
      <Show when={loading()}>
        <div class="w-24 h-24 rounded-full animate-pulse" style={{ background: 'var(--color-surface-2)' }} />
        <p class="text-sm" style={{ color: 'var(--color-text-dim)' }}>Loading profile…</p>
      </Show>

      <Show when={!loading()}>
        {/* Avatar */}
        <div
          class="w-24 h-24 rounded-full flex items-center justify-center text-3xl font-bold overflow-hidden"
          style={{ background: profile()?.picture ? 'transparent' : getPubkeyGradient(props.pubkey) }}
        >
          <Show when={profile()?.picture} fallback={<span style={{ color: '#fff' }}>{(displayName()[0] ?? '?').toUpperCase()}</span>}>
            <img src={profile()!.picture} alt={displayName()} class="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          </Show>
        </div>

        {/* Name + npub */}
        <div class="flex flex-col items-center gap-1 text-center">
          <h2 class="text-xl font-bold" style={{ color: 'var(--color-text)' }}>{displayName()}</h2>
          <p class="text-xs font-mono" style={{ color: 'var(--color-text-dim)' }}>{npub().slice(0, 16)}…{npub().slice(-6)}</p>
          <Show when={profile()?.about}>
            <p class="text-sm text-center mt-1" style={{ color: 'var(--color-text-dim)', 'max-width': '260px' }}>{profile()!.about}</p>
          </Show>
        </div>

        {/* Actions */}
        <Show when={store.loggedIn}>
          <div class="flex flex-col gap-2 w-full" style={{ 'max-width': '280px' }}>
            <div class="flex gap-2">
              <button
                class="flex-1 py-3 rounded-xl font-semibold text-sm"
                style={{ background: 'var(--color-accent)', color: '#fff', border: 'none', cursor: 'pointer' }}
                onClick={() => handleCall('video')}
              >
                📹 Video Call
              </button>
              <button
                class="flex-1 py-3 rounded-xl font-semibold text-sm"
                style={{ background: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)', cursor: 'pointer' }}
                onClick={() => handleCall('audio')}
              >
                📞 Audio Call
              </button>
            </div>
            <button
              class="w-full py-3 rounded-xl font-medium text-sm"
              style={{
                background: isAlreadyContact() || added() ? 'var(--color-surface)' : 'rgba(124,58,237,0.15)',
                color: isAlreadyContact() || added() ? 'var(--color-text-dim)' : 'var(--color-accent)',
                border: '1px solid var(--color-border)',
                cursor: isAlreadyContact() ? 'default' : 'pointer',
              }}
              onClick={handleAdd}
              disabled={isAlreadyContact()}
            >
              {isAlreadyContact() ? '✓ In your contacts' : added() ? addedMsg() : '+ Follow on Nostr & add to contacts'}
            </button>
          </div>
        </Show>

        <Show when={!store.loggedIn}>
          <p class="text-sm" style={{ color: 'var(--color-text-dim)' }}>Sign in to call or follow this person.</p>
        </Show>
      </Show>

      <button
        class="mt-2 text-sm py-2 px-6 rounded-xl"
        style={{ background: 'var(--color-surface)', color: 'var(--color-text-dim)', border: '1px solid var(--color-border)', cursor: 'pointer' }}
        onClick={props.onClose}
      >
        Close
      </button>
    </div>
  );
};

export default ViewProfile;
