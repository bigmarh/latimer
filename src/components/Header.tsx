import type { Component } from 'solid-js';
import { Show } from 'solid-js';
import { store, setView } from '../store';
import { SettingsIcon, PhoneIcon } from './icons';

const Header: Component = () => {
  const unseenCount = () => store.recentCalls.filter((c) => !c.seen).length;

  return (
    <header
      class="safe-top flex items-center justify-between px-5 pb-4"
      style={{ background: 'var(--color-surface)', 'border-bottom': '1px solid var(--color-border)' }}
    >
      {/* Logo + Title */}
      <div class="flex items-center gap-3">
        <img
          src="/latimer-logo-face.svg"
          alt="Latimer"
          width="36"
          height="36"
          style={{ 'border-radius': '10px', 'flex-shrink': '0' }}
        />
        <span class="font-semibold text-base" style={{ color: 'var(--color-text)' }}>
          Latimer
        </span>
        <div class={`status-dot ${store.loggedIn ? 'connected' : 'disconnected'}`} />
      </div>

      <div class="flex items-center gap-1">
        {/* Missed calls / Inbox button */}
        <button
          class="relative flex items-center justify-center w-9 h-9 rounded-full transition-colors"
          style={{
            background: store.view === 'inbox' ? 'var(--color-accent-glow)' : 'transparent',
            color: store.view === 'inbox' ? 'var(--color-accent)' : 'var(--color-text-dim)',
            border: 'none',
            cursor: 'pointer',
          }}
          onClick={() => setView('inbox')}
          aria-label="Missed calls"
        >
          <PhoneIcon size={18} />
          <Show when={unseenCount() > 0}>
            <span
              class="absolute top-0.5 right-0.5 flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold"
              style={{ background: 'var(--color-danger)', color: '#fff' }}
            >
              {unseenCount() > 9 ? '9+' : unseenCount()}
            </span>
          </Show>
        </button>

        {/* Settings button */}
        <button
          class="flex items-center justify-center w-9 h-9 rounded-full transition-colors"
          style={{
            background: store.view === 'settings' ? 'var(--color-accent-glow)' : 'transparent',
            color: store.view === 'settings' ? 'var(--color-accent)' : 'var(--color-text-dim)',
            border: 'none',
            cursor: 'pointer',
          }}
          onClick={() => setView('settings')}
          aria-label="Settings"
        >
          <SettingsIcon size={20} />
        </button>
      </div>
    </header>
  );
};

export default Header;
