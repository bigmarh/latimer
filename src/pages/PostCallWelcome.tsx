import type { Component } from 'solid-js';

interface PostCallWelcomeProps {
  onSignUp: () => void;
  onLogin: () => void;
  onDismiss: () => void;
}

const PostCallWelcome: Component<PostCallWelcomeProps> = (props) => {
  return (
    <div
      class="fixed inset-0 z-50 flex flex-col items-center justify-center px-6 fade-enter"
      style={{ background: 'var(--color-bg)' }}
    >
      <div class="flex flex-col items-center gap-6 max-w-xs w-full text-center">
        {/* Logo */}
        <img
          src="/latimer-logo-face.svg"
          alt="Latimer"
          width="80"
          height="80"
          style={{ 'border-radius': '18px' }}
        />

        <div class="flex flex-col gap-2">
          <h1 class="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>
            That was Latimer
          </h1>
          <p class="text-sm leading-relaxed" style={{ color: 'var(--color-text-dim)' }}>
            End-to-end encrypted calls over Nostr — no accounts, no servers, no surveillance. Your call was private by default.
          </p>
        </div>

        <div
          class="w-full rounded-2xl p-4 text-left flex flex-col gap-3"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        >
          {[
            ['🔐', 'Calls are encrypted end-to-end'],
            ['🕵️', 'No phone number or email required'],
            ['⚡', 'Powered by Nostr — open & censorship-resistant'],
          ].map(([icon, text]) => (
            <div class="flex items-center gap-3 text-sm" style={{ color: 'var(--color-text-dim)' }}>
              <span class="text-base">{icon}</span>
              <span>{text}</span>
            </div>
          ))}
        </div>

        <div class="flex flex-col gap-3 w-full">
          <button
            class="w-full py-3.5 rounded-xl font-semibold text-sm"
            style={{
              background: '#16a34a',
              color: '#fff',
              border: '1px solid rgb(128 253 73)',
              cursor: 'pointer',
            }}
            onClick={props.onSignUp}
          >
            Create your Latimer account
          </button>

          <button
            class="w-full py-3 rounded-xl text-sm font-medium"
            style={{
              background: 'var(--color-surface)',
              color: 'var(--color-text)',
              border: '1px solid var(--color-border)',
              cursor: 'pointer',
            }}
            onClick={props.onLogin}
          >
            Already have an account? Sign in
          </button>

          <button
            class="w-full py-2 rounded-xl text-sm"
            style={{
              background: 'transparent',
              color: 'var(--color-text-muted)',
              border: 'none',
              cursor: 'pointer',
            }}
            onClick={props.onDismiss}
          >
            Maybe later
          </button>
        </div>

        <p class="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          Free forever · Open source · Built on Nostr
        </p>
      </div>
    </div>
  );
};

export default PostCallWelcome;
