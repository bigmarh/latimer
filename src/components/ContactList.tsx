import type { Component } from 'solid-js';
import { For, Show, createEffect, createSignal } from 'solid-js';
import { nip19 } from 'nostr-tools';
import { store, setStore } from '../store';
import type { Contact } from '../types';
import ContactCard from './ContactCard';
import { loadProfile, publishFollowList } from '../services/nostr';
import { signalingService } from '../services/signaling';
import { STORAGE_KEYS } from '../constants';
import { SearchIcon, PlusIcon, StarIcon, XIcon } from './icons';
import QrScanner from './QrScanner';

function persistContacts(contacts: Contact[]) {
  try { localStorage.setItem(STORAGE_KEYS.contacts, JSON.stringify(contacts)); } catch { /* ignore */ }
}

function readFavoriteContacts(ownerPubkey: string): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.favoriteContacts);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const favorites = parsed[ownerPubkey];
    return Array.isArray(favorites)
      ? favorites.filter((value): value is string => typeof value === 'string')
      : [];
  } catch {
    return [];
  }
}

function persistFavoriteContacts(ownerPubkey: string, favorites: string[]) {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.favoriteContacts);
    const parsed = raw ? JSON.parse(raw) as Record<string, unknown> : {};
    parsed[ownerPubkey] = favorites;
    localStorage.setItem(STORAGE_KEYS.favoriteContacts, JSON.stringify(parsed));
  } catch {
    // ignore quota and parse issues
  }
}

interface ContactListProps {
  onSendLink: (contact: Contact) => Promise<boolean>;
  onCall: (contact: Contact, type: 'audio' | 'video') => void;
}

type ContactView = 'all' | 'favorites';

// Loading skeleton card
const SkeletonCard: Component = () => (
  <div
    class="card flex overflow-hidden"
    style={{ animation: 'pulse 1.5s ease-in-out infinite', 'min-height': '104px' }}
  >
    <div
      class="w-[96px] min-h-full flex-shrink-0"
      style={{ background: 'var(--color-surface-2)' }}
    />
    <div
      class="flex-1 px-4 py-4 flex flex-col justify-center gap-3"
      style={{ background: 'transparent' }}
    >
      <div class="w-36 h-4 rounded-full" style={{ background: 'var(--color-surface-2)' }} />
      <div class="flex items-center gap-2">
        <div class="h-9 rounded-full" style={{ background: 'var(--color-surface-2)', width: '72px' }} />
        <div class="h-9 rounded-full" style={{ background: 'var(--color-surface-2)', width: '72px' }} />
        <div class="h-9 rounded-full" style={{ background: 'var(--color-surface-2)', width: '84px' }} />
      </div>
    </div>
  </div>
);

const ContactList: Component<ContactListProps> = (props) => {
  const [showAddModal, setShowAddModal] = createSignal(false);
  const [showScanner, setShowScanner] = createSignal(false);
  const [addInput, setAddInput] = createSignal('');
  const [addError, setAddError] = createSignal('');
  const [favoritePubkeys, setFavoritePubkeys] = createSignal<string[]>([]);
  const [activeView, setActiveView] = createSignal<ContactView>('all');

  createEffect(() => {
    if (!store.pubkey) {
      setFavoritePubkeys([]);
      return;
    }
    setFavoritePubkeys(readFavoriteContacts(store.pubkey));
  });

  const visibleContacts = () => {
    const q = store.searchQuery.toLowerCase().trim();
    const favoriteSet = new Set(favoritePubkeys());
    const favoriteOrder = new Map(favoritePubkeys().map((pubkey, index) => [pubkey, index]));
    const interactionMap = new Map<string, number>();

    for (const record of store.recentCalls) {
      const previous = interactionMap.get(record.contact.pubkey) ?? 0;
      if (record.startedAt > previous) {
        interactionMap.set(record.contact.pubkey, record.startedAt);
      }
    }

    let filtered = !q ? store.contacts : store.contacts.filter((c) => {
      const name = (c.displayName || c.name || '').toLowerCase();
      return name.includes(q) || c.pubkey.toLowerCase().includes(q);
    });

    if (activeView() === 'favorites') {
      filtered = filtered.filter((contact) => favoriteSet.has(contact.pubkey));
    }

    return filtered
      .map((contact, index) => ({ contact, index }))
      .sort((a, b) => {
        const aInteraction = interactionMap.get(a.contact.pubkey) ?? 0;
        const bInteraction = interactionMap.get(b.contact.pubkey) ?? 0;
        if (aInteraction !== bInteraction) return bInteraction - aInteraction;

        if (activeView() === 'favorites') {
          const aFavoriteRank = favoriteOrder.get(a.contact.pubkey) ?? Number.MAX_SAFE_INTEGER;
          const bFavoriteRank = favoriteOrder.get(b.contact.pubkey) ?? Number.MAX_SAFE_INTEGER;
          if (aFavoriteRank !== bFavoriteRank) return aFavoriteRank - bFavoriteRank;
        }

        return a.index - b.index;
      })
      .map(({ contact }) => contact);
  };

  const favoriteCount = () => store.contacts.filter((contact) => favoritePubkeys().includes(contact.pubkey)).length;

  const emptyStateLabel = () => {
    if (store.searchQuery) {
      return activeView() === 'favorites'
        ? `No favorites match "${store.searchQuery}"`
        : `No contacts match "${store.searchQuery}"`;
    }

    if (activeView() === 'favorites') {
      return 'No favorites yet. Star contacts to pin them here.';
    }

    return 'No contacts yet.';
  };

  const handleSearch = (e: InputEvent) => {
    setStore('searchQuery', (e.target as HTMLInputElement).value);
  };

  const clearSearch = () => {
    setStore('searchQuery', '');
  };

  const handleAddContact = () => {
    const input = addInput().trim();
    if (!input) {
      setAddError('Please enter a pubkey or npub');
      return;
    }

    let pubkey = input;

    if (input.startsWith('npub1')) {
      try {
        const decoded = nip19.decode(input);
        if (decoded.type !== 'npub') {
          setAddError('Invalid npub format');
          return;
        }
        pubkey = decoded.data as string;
      } catch {
        setAddError('Invalid npub format');
        return;
      }
    } else if (!/^[0-9a-f]{64}$/i.test(pubkey)) {
      setAddError('Enter a valid npub or 64-char hex pubkey');
      return;
    }

    if (store.contacts.some((c) => c.pubkey === pubkey)) {
      setAddError('Contact already in your list');
      return;
    }

    // Add immediately with pubkey only, then enrich with profile
    const updated = [...store.contacts, { pubkey }];
    setStore('contacts', updated);
    persistContacts(updated);
    setAddInput('');
    setAddError('');
    setShowAddModal(false);

    // Publish updated follow list to Nostr
    void publishFollowList(updated, store.relays, (t) => signalingService.signEvent(t)).catch(() => {/* ignore */});

    // Fetch profile in background and update the contact
    void loadProfile(pubkey, store.relays).then((profile) => {
      setStore('contacts', (contacts) =>
        contacts.map((c) => (c.pubkey === pubkey ? profile : c))
      );
      persistContacts(store.contacts);
    });
  };

  const handleScan = (value: string) => {
    setShowScanner(false);
    setAddInput(value.replace(/^nostr:/i, ''));
    setAddError('');
  };

  const handleToggleFavorite = (contact: Contact) => {
    const next = favoritePubkeys().includes(contact.pubkey)
      ? favoritePubkeys().filter((pubkey) => pubkey !== contact.pubkey)
      : [contact.pubkey, ...favoritePubkeys()];

    setFavoritePubkeys(next);
    if (store.pubkey) {
      persistFavoriteContacts(store.pubkey, next);
    }
  };

  return (
    <div class="flex flex-col h-full">
      {/* Search + View + Add row */}
      <div class="flex gap-2 px-4 py-3">
        <div
          class="flex-1 flex items-center gap-2 rounded-xl px-3"
          style={{
            background: 'var(--color-surface-2)',
            border: '1px solid var(--color-border)',
            height: '40px',
          }}
        >
          <SearchIcon size={16} class="flex-shrink-0" style={{ color: 'var(--color-text-muted)' }} />
          <input
            type="text"
            placeholder="Search contacts"
            value={store.searchQuery}
            onInput={handleSearch}
            class="flex-1 bg-transparent border-none outline-none text-sm"
            style={{ color: 'var(--color-text)' }}
          />
          <Show when={store.searchQuery}>
            <button
              onClick={clearSearch}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: '0', display: 'flex' }}
            >
              <XIcon size={14} />
            </button>
          </Show>
        </div>

        <div
          class="flex items-center rounded-xl p-1 flex-shrink-0"
          style={{
            background: 'var(--color-surface-2)',
            border: '1px solid var(--color-border)',
          }}
        >
          <button
            class="h-8 px-3 rounded-lg text-xs font-semibold"
            style={{
              background: activeView() === 'all' ? 'rgba(255,255,255,0.08)' : 'transparent',
              color: activeView() === 'all' ? 'var(--color-text)' : 'var(--color-text-dim)',
              border: 'none',
              cursor: 'pointer',
            }}
            onClick={() => setActiveView('all')}
            aria-pressed={activeView() === 'all'}
          >
            All
          </button>
          <button
            class="flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold"
            style={{
              background: activeView() === 'favorites' ? 'rgba(250, 204, 21, 0.16)' : 'transparent',
              color: activeView() === 'favorites' ? '#facc15' : 'var(--color-text-dim)',
              border: 'none',
              cursor: 'pointer',
            }}
            onClick={() => setActiveView('favorites')}
            aria-pressed={activeView() === 'favorites'}
            title="Show favorites"
          >
            <StarIcon size={12} style={{ fill: activeView() === 'favorites' ? 'currentColor' : 'transparent' }} />
            <span>Favs</span>
          </button>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          class="flex items-center justify-center w-10 h-10 rounded-xl"
          style={{
            background: 'var(--color-accent)',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
            'flex-shrink': '0',
          }}
          aria-label="Add contact"
        >
          <PlusIcon size={18} />
        </button>
      </div>

      {/* Contact list */}
      <div class="scroll-area flex-1 px-4 pb-4">
        <Show when={activeView() === 'favorites' || store.recentCalls.length > 0}>
          <div class="flex items-center justify-between px-1 pb-3">
            <span class="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--color-text-muted)' }}>
              {activeView() === 'favorites' ? 'Favorite Contacts' : 'Recent First'}
            </span>
            <Show when={activeView() === 'favorites' && favoriteCount() > 0}>
              <span class="text-[11px]" style={{ color: 'rgba(250, 204, 21, 0.78)' }}>
                {favoriteCount()} starred
              </span>
            </Show>
          </div>
        </Show>

        <Show
          when={store.contactsLoaded}
          fallback={
            <div class="flex flex-col gap-3 items-stretch">
              {Array.from({ length: 8 }).map(() => <SkeletonCard />)}
            </div>
          }
        >
          <Show
            when={store.contacts.length > 0}
            fallback={
              <div class="flex flex-col items-center justify-center py-16 gap-4">
                <div
                  class="flex items-center justify-center w-16 h-16 rounded-full text-4xl"
                  style={{ background: 'var(--color-surface-2)', color: 'var(--color-text-muted)' }}
                >
                  👥
                </div>
                <p class="text-center text-sm" style={{ color: 'var(--color-text-dim)' }}>
                  No contacts yet.
                  <br />
                  Follow people on Nostr to see them here.
                </p>
              </div>
            }
          >
            <Show
              when={visibleContacts().length > 0}
              fallback={
                <div class="flex flex-col items-center justify-center py-12">
                  <p class="text-sm" style={{ color: 'var(--color-text-dim)' }}>
                    {emptyStateLabel()}
                  </p>
                </div>
              }
            >
              <div class="flex flex-col gap-3 items-stretch">
                <For each={visibleContacts()}>
                  {(contact) => (
                    <ContactCard
                      contact={contact}
                      starred={favoritePubkeys().includes(contact.pubkey)}
                      onSendLink={props.onSendLink}
                      onCall={props.onCall}
                      onToggleStar={handleToggleFavorite}
                    />
                  )}
                </For>
              </div>
            </Show>
          </Show>
        </Show>
      </div>

      {/* QR scanner fullscreen */}
      <Show when={showScanner()}>
        <QrScanner onScan={handleScan} onClose={() => setShowScanner(false)} />
      </Show>

      {/* Add contact modal */}
      <Show when={showAddModal()}>
        <div
          class="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={() => setShowAddModal(false)}
        >
          <div
            class="w-full max-w-[500px] p-6 rounded-t-2xl"
            style={{ background: 'var(--color-surface)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 class="text-base font-semibold mb-4" style={{ color: 'var(--color-text)' }}>
              Add Contact
            </h2>

            <div class="flex gap-2 mb-2">
              <input
                type="text"
                placeholder="npub1... or hex pubkey"
                value={addInput()}
                onInput={(e) => {
                  setAddInput((e.target as HTMLInputElement).value);
                  setAddError('');
                }}
                class="flex-1 px-4 py-3 rounded-xl text-sm outline-none"
                style={{
                  background: 'var(--color-surface-2)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text)',
                }}
                autofocus
              />
              <button
                onClick={() => setShowScanner(true)}
                class="flex items-center justify-center w-12 rounded-xl flex-shrink-0"
                style={{
                  background: 'var(--color-surface-2)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text-muted)',
                  cursor: 'pointer',
                }}
                title="Scan QR code"
                aria-label="Scan QR code"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>
                  <path d="M14 14h2v2h-2zM18 14h3M14 18h2M18 18h3v3M14 21h2"/>
                </svg>
              </button>
            </div>

            <Show when={addError()}>
              <p class="text-xs mb-3" style={{ color: 'var(--color-danger)' }}>
                {addError()}
              </p>
            </Show>

            <div class="flex gap-3 mt-4 safe-bottom">
              <button
                class="btn-pill btn-secondary flex-1"
                onClick={() => {
                  setShowAddModal(false);
                  setAddInput('');
                  setAddError('');
                }}
              >
                Cancel
              </button>
              <button
                class="btn-pill btn-primary flex-1"
                onClick={handleAddContact}
              >
                Add
              </button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
};

export default ContactList;
