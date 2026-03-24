import type { Component } from 'solid-js';
import { For, Show, createEffect, createSignal } from 'solid-js';
import { nip19 } from 'nostr-tools';
import { store, setStore } from '../store';
import type { Contact } from '../types';
import ContactCard from './ContactCard';
import { loadProfile, publishFollowList } from '../services/nostr';
import { signalingService } from '../services/signaling';
import { STORAGE_KEYS } from '../constants';
import { SearchIcon, PlusIcon, XIcon } from './icons';

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
  const [addInput, setAddInput] = createSignal('');
  const [addError, setAddError] = createSignal('');
  const [favoritePubkeys, setFavoritePubkeys] = createSignal<string[]>([]);

  createEffect(() => {
    if (!store.pubkey) {
      setFavoritePubkeys([]);
      return;
    }
    setFavoritePubkeys(readFavoriteContacts(store.pubkey));
  });

  const filteredContacts = () => {
    const q = store.searchQuery.toLowerCase().trim();
    const filtered = !q ? store.contacts : store.contacts.filter((c) => {
      const name = (c.displayName || c.name || '').toLowerCase();
      return name.includes(q) || c.pubkey.toLowerCase().includes(q);
    });

    const favoriteSet = new Set(favoritePubkeys());
    return filtered
      .map((contact, index) => ({ contact, index }))
      .sort((a, b) => {
        const aFavorite = favoriteSet.has(a.contact.pubkey);
        const bFavorite = favoriteSet.has(b.contact.pubkey);
        if (aFavorite !== bFavorite) return aFavorite ? -1 : 1;
        return a.index - b.index;
      })
      .map(({ contact }) => contact);
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
      {/* Search + Add row */}
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
        <Show
          when={store.contactsLoaded}
          fallback={
            <div class="flex flex-col gap-3">
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
              when={filteredContacts().length > 0}
              fallback={
                <div class="flex flex-col items-center justify-center py-12">
                  <p class="text-sm" style={{ color: 'var(--color-text-dim)' }}>
                    No contacts match "{store.searchQuery}"
                  </p>
                </div>
              }
            >
              <div class="flex flex-col gap-3">
                <For each={filteredContacts()}>
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

            <input
              type="text"
              placeholder="npub1... or hex pubkey"
              value={addInput()}
              onInput={(e) => {
                setAddInput((e.target as HTMLInputElement).value);
                setAddError('');
              }}
              class="w-full px-4 py-3 rounded-xl text-sm outline-none mb-2"
              style={{
                background: 'var(--color-surface-2)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text)',
              }}
              autofocus
            />

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
