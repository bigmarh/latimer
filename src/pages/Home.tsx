import type { Component } from 'solid-js';
import { Show, For, createSignal } from 'solid-js';
import { nip19 } from 'nostr-tools';
import { store, setStore } from '../store';
import type { Contact } from '../types';
import Header from '../components/Header';
import ContactList from '../components/ContactList';
import LinkExplainerModal from '../components/LinkExplainerModal';
import { signalingService } from '../services/signaling';
import { webrtcService } from '../services/webrtc';
import { buildCallInviteMessage } from '../services/nostr';
import { buildInviteUrl } from '../services/ephemeral';
import { LATIMER_METHODS, STORAGE_KEYS } from '../constants';
import { getDisplayName, truncatePubkey } from '../services/nostr';
import { ClockIcon, PhoneIcon, VideoIcon } from '../components/icons';

function formatCallTime(ts: number): string {
  const now = Date.now();
  const diff = now - ts;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(ts).toLocaleDateString();
}

const Home: Component = () => {
  const [linkExplainerContact, setLinkExplainerContact] = createSignal<Contact | null>(null);
  const [dontShowLinkExplainer, setDontShowLinkExplainer] = createSignal(false);
  let resolveLinkExplainer: ((value: boolean) => void) | null = null;

  const confirmSendLink = (contact: Contact): Promise<boolean> => {
    const hidden = localStorage.getItem(STORAGE_KEYS.hideLinkExplainer) === 'true';
    if (hidden) return Promise.resolve(true);

    setDontShowLinkExplainer(false);
    setLinkExplainerContact(contact);

    return new Promise((resolve) => {
      resolveLinkExplainer = resolve;
    });
  };

  const closeLinkExplainer = (confirmed: boolean) => {
    if (confirmed && dontShowLinkExplainer()) {
      localStorage.setItem(STORAGE_KEYS.hideLinkExplainer, 'true');
    }

    setLinkExplainerContact(null);
    resolveLinkExplainer?.(confirmed);
    resolveLinkExplainer = null;
  };

  const handleSendLink = async (contact: Contact) => {
    const confirmed = await confirmSendLink(contact);
    if (!confirmed) return false;

    const npub = nip19.npubEncode(store.pubkey);
    const inviteUrl = buildInviteUrl(npub, store.relays, 'audio');
    const message = buildCallInviteMessage(inviteUrl, 'audio');
    await signalingService.sendDirectMessage(contact.pubkey, message);
    return true;
  };

  const handleCall = async (contact: Contact, callType: 'audio' | 'video') => {
    const callId = crypto.randomUUID();

    setStore({
      callState: 'calling',
      activeCallContact: contact,
      activeCallId: callId,
      activeCallType: callType,
    });

    // Set up ICE candidate handler before creating offer
    webrtcService.onIceCandidate = (candidate) => {
      void signalingService.send(contact.pubkey, LATIMER_METHODS.ICE_CANDIDATE, {
        callId,
        candidate,
      });
    };

    // Set up connection state handler
    webrtcService.onConnectionState = (state) => {
      if (state === 'connected') {
        setStore('callState', 'connected');
      } else if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        setStore('callState', state === 'failed' ? 'failed' : 'ended');
      }
    };

    try {
      const offer = await webrtcService.createOffer(callType === 'video');

      await signalingService.sendAndAwait(contact.pubkey, LATIMER_METHODS.CALL_OFFER, {
        callId,
        offer,
        callType,
      });
    } catch (err) {
      console.error('[Home] Failed to create or send offer:', err);
      setStore({ callState: 'failed', activeCallContact: null, activeCallId: null });
      webrtcService.cleanup();
      setTimeout(() => setStore({ callState: 'idle' }), 2_500);
    }
  };

  return (
    <div class="flex flex-col h-full" style={{ background: 'var(--color-bg)' }}>
      <Header />

      {/* Main content — contacts fill remaining space */}
      <div class="flex-1 overflow-hidden flex flex-col">
        <ContactList onSendLink={handleSendLink} onCall={handleCall} />
      </div>

      {/* Recent calls section */}
      <Show when={store.recentCalls.length > 0}>
        <div
          class="flex-shrink-0 border-t"
          style={{ 'border-color': 'var(--color-border)', 'max-height': '240px' }}
        >
          <div class="flex items-center gap-2 px-4 pt-3 pb-2">
            <ClockIcon size={14} style={{ color: 'var(--color-text-muted)' }} />
            <span class="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
              Recent
            </span>
          </div>
          <div class="scroll-area" style={{ 'max-height': '180px' }}>
            <For each={store.recentCalls}>
              {(record) => (
                <div
                  class="flex items-center gap-3 px-4 py-2.5"
                  style={{ 'border-bottom': '1px solid var(--color-border)' }}
                >
                  {/* Direction icon */}
                  <div
                    class="flex items-center justify-center w-8 h-8 rounded-full"
                    style={{
                      background:
                        record.status === 'missed'
                          ? 'rgba(239, 68, 68, 0.1)'
                          : 'rgba(124, 58, 237, 0.1)',
                      color:
                        record.status === 'missed'
                          ? 'var(--color-danger)'
                          : 'var(--color-accent)',
                    }}
                  >
                    {record.contact && 'picture' in record.contact ? (
                      <PhoneIcon size={14} />
                    ) : (
                      <VideoIcon size={14} />
                    )}
                  </div>

                  {/* Name + status */}
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium truncate" style={{ color: 'var(--color-text)' }}>
                      {getDisplayName(record.contact)}
                    </p>
                    <p class="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      {record.status === 'missed' ? 'Missed · ' : ''}
                      {formatCallTime(record.startedAt)}
                    </p>
                  </div>

                  {/* Call back button */}
                  <button
                    class="flex items-center justify-center w-8 h-8 rounded-full"
                    style={{
                      background: 'var(--color-accent)',
                      color: '#fff',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                    onClick={() => handleCall(record.contact, 'audio')}
                    aria-label={`Call back ${getDisplayName(record.contact)}`}
                  >
                    <PhoneIcon size={13} />
                  </button>
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>

      <Show when={linkExplainerContact() !== null}>
        <LinkExplainerModal
          contact={linkExplainerContact()!}
          dontShowAgain={dontShowLinkExplainer()}
          onToggleDontShowAgain={setDontShowLinkExplainer}
          onCancel={() => closeLinkExplainer(false)}
          onConfirm={() => closeLinkExplainer(true)}
        />
      </Show>
    </div>
  );
};

export default Home;
