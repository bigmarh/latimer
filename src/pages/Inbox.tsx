import type { Component } from 'solid-js';
import { For, Show, createSignal } from 'solid-js';
import { nip19 } from 'nostr-tools';
import { store, setStore } from '../store';
import type { CallRecord } from '../types';
import { getDisplayName, loadProfile } from '../services/nostr';
import { STORAGE_KEYS } from '../constants';
import { PhoneIcon, VideoIcon, ChevronLeftIcon, PlusIcon } from '../components/icons';

function formatTime(ts: number): string {
  const now = Date.now();
  const diff = now - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(ts).toLocaleDateString();
}

function formatDuration(secs?: number): string {
  if (!secs) return '';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return ` · ${m}:${String(s).padStart(2, '0')}`;
}

function statusColor(status: CallRecord['status']): string {
  if (status === 'missed') return 'var(--color-danger)';
  if (status === 'completed') return 'var(--color-call-green)';
  return 'var(--color-text-muted)';
}

function statusLabel(record: CallRecord): string {
  const dir = record.direction === 'outgoing' ? 'Outgoing' : 'Incoming';
  switch (record.status) {
    case 'completed': return `${dir}${formatDuration(record.duration)}`;
    case 'missed': return 'Missed';
    case 'rejected': return record.direction === 'outgoing' ? 'Declined' : 'Rejected';
    case 'busy': return 'Busy';
    case 'failed': return 'Failed';
    default: return dir;
  }
}

function isInContacts(pubkey: string): boolean {
  return store.contacts.some((c) => c.pubkey === pubkey);
}

const Inbox: Component = () => {
  const [addingPubkey, setAddingPubkey] = createSignal('');

  // Mark all unseen as seen when opening
  const markSeen = () => {
    if (store.recentCalls.some((c) => !c.seen)) {
      setStore('recentCalls', (calls) => calls.map((c) => ({ ...c, seen: true })));
      try {
        localStorage.setItem(STORAGE_KEYS.recentCalls, JSON.stringify(store.recentCalls));
      } catch { /* ignore */ }
    }
  };
  markSeen();

  const clearAll = () => {
    setStore('recentCalls', []);
    localStorage.removeItem(STORAGE_KEYS.recentCalls);
  };

  const handleAddContact = async (pubkey: string) => {
    if (isInContacts(pubkey)) return;
    setAddingPubkey(pubkey);
    const updated = [...store.contacts, { pubkey }];
    setStore('contacts', updated);
    try { localStorage.setItem(STORAGE_KEYS.contacts, JSON.stringify(updated)); } catch { /* ignore */ }

    try {
      const profile = await loadProfile(pubkey, store.relays);
      setStore('contacts', (contacts) =>
        contacts.map((c) => (c.pubkey === pubkey ? profile : c))
      );
      try { localStorage.setItem(STORAGE_KEYS.contacts, JSON.stringify(store.contacts)); } catch { /* ignore */ }
    } finally {
      setAddingPubkey('');
    }
  };

  const handleCallBack = (record: CallRecord, type: 'audio' | 'video') => {
    setStore('view', 'home');
    // Store a pending call so Home can initiate it — or user taps from contacts
    void record; void type;
  };

  const npubShort = (pubkey: string) => {
    try {
      const npub = nip19.npubEncode(pubkey);
      return npub.slice(0, 12) + '…';
    } catch {
      return pubkey.slice(0, 8) + '…';
    }
  };

  const unseen = () => store.recentCalls.filter((c) => !c.seen).length;

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
          onClick={() => setStore('view', 'home')}
          aria-label="Back"
        >
          <ChevronLeftIcon size={22} />
        </button>
        <h1 class="text-base font-semibold flex-1" style={{ color: 'var(--color-text)' }}>
          Calls
          <Show when={unseen() > 0}>
            <span
              class="ml-2 inline-flex items-center justify-center px-1.5 rounded-full text-xs font-bold"
              style={{ background: 'var(--color-danger)', color: '#fff' }}
            >
              {unseen()}
            </span>
          </Show>
        </h1>
        <Show when={store.recentCalls.length > 0}>
          <button
            class="text-xs"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}
            onClick={clearAll}
          >
            Clear all
          </button>
        </Show>
      </header>

      <div class="scroll-area flex-1">
        <Show
          when={store.recentCalls.length > 0}
          fallback={
            <div class="flex flex-col items-center justify-center h-full gap-4 py-24">
              <div
                class="flex items-center justify-center w-16 h-16 rounded-full"
                style={{ background: 'var(--color-surface-2)', color: 'var(--color-text-muted)' }}
              >
                <PhoneIcon size={28} />
              </div>
              <p class="text-sm text-center" style={{ color: 'var(--color-text-dim)' }}>
                No call history yet
              </p>
            </div>
          }
        >
          <For each={store.recentCalls}>
            {(record) => {
              const name = () => getDisplayName(record.contact);
              const pubkey = record.contact.pubkey;
              const inContacts = () => isInContacts(pubkey);
              const isAdding = () => addingPubkey() === pubkey;

              return (
                <div
                  class="flex items-center gap-3 px-4 py-3"
                  style={{
                    'border-bottom': '1px solid var(--color-border)',
                    background: record.seen ? 'transparent' : 'rgba(124,58,237,0.04)',
                  }}
                >
                  {/* Call type icon */}
                  <div
                    class="flex items-center justify-center w-10 h-10 rounded-full flex-shrink-0"
                    style={{
                      background: record.status === 'missed'
                        ? 'rgba(239,68,68,0.1)'
                        : record.status === 'completed'
                        ? 'rgba(34,197,94,0.1)'
                        : 'rgba(100,100,120,0.1)',
                      color: statusColor(record.status),
                    }}
                  >
                    {record.callType === 'video' ? <VideoIcon size={16} /> : <PhoneIcon size={16} />}
                  </div>

                  {/* Info */}
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium truncate" style={{ color: 'var(--color-text)' }}>
                      {name()}
                    </p>
                    <p class="text-xs" style={{ color: statusColor(record.status) }}>
                      {statusLabel(record)}
                      <span style={{ color: 'var(--color-text-muted)' }}> · {formatTime(record.startedAt)}</span>
                    </p>
                    {/* Show npub if not in contacts */}
                    <Show when={!inContacts()}>
                      <p class="text-xs font-mono mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                        {npubShort(pubkey)}
                      </p>
                    </Show>
                  </div>

                  {/* Actions */}
                  <div class="flex gap-1.5 flex-shrink-0">
                    {/* Add to contacts if unknown */}
                    <Show when={!inContacts()}>
                      <button
                        class="flex items-center justify-center w-8 h-8 rounded-full"
                        style={{
                          background: 'rgba(124,58,237,0.15)',
                          color: 'var(--color-accent)',
                          border: 'none',
                          cursor: isAdding() ? 'default' : 'pointer',
                          opacity: isAdding() ? '0.6' : '1',
                        }}
                        onClick={() => { void handleAddContact(pubkey); }}
                        disabled={isAdding()}
                        aria-label="Add to contacts"
                        title="Add to contacts"
                      >
                        <PlusIcon size={14} />
                      </button>
                    </Show>

                    {/* Call back */}
                    <button
                      class="flex items-center justify-center w-8 h-8 rounded-full"
                      style={{ background: 'var(--color-accent)', color: '#fff', border: 'none', cursor: 'pointer' }}
                      onClick={() => handleCallBack(record, 'audio')}
                      aria-label={`Call ${name()}`}
                    >
                      <PhoneIcon size={13} />
                    </button>
                  </div>
                </div>
              );
            }}
          </For>
        </Show>
      </div>
    </div>
  );
};

export default Inbox;
