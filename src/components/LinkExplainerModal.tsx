import type { Component } from 'solid-js';
import type { Contact } from '../types';
import { getDisplayName, getAvatarInitials } from '../services/nostr';
import { LinkIcon } from './icons';

interface LinkExplainerModalProps {
  contact: Contact;
  dontShowAgain: boolean;
  onToggleDontShowAgain: (value: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
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

const LinkExplainerModal: Component<LinkExplainerModalProps> = (props) => {
  const displayName = () => getDisplayName(props.contact);
  const initials = () => getAvatarInitials(props.contact);
  const gradient = () => getPubkeyGradient(props.contact.pubkey);

  return (
    <div
      class="fixed inset-0 z-50 flex items-end justify-center px-4 pb-6 pt-16 fade-enter"
      style={{ background: 'rgba(7, 8, 14, 0.72)', 'backdrop-filter': 'blur(10px)' }}
      onClick={props.onCancel}
    >
      <div
        class="w-full max-w-[500px] rounded-[28px] p-5"
        style={{
          background: 'linear-gradient(180deg, rgba(28,30,42,0.98) 0%, rgba(18,20,29,0.98) 100%)',
          border: '1px solid rgba(255,255,255,0.08)',
          'box-shadow': '0 24px 80px rgba(0,0,0,0.42)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div class="flex items-start gap-4">
          <div
            class="avatar w-14 h-14 text-lg font-semibold flex-shrink-0"
            style={{ background: props.contact.picture ? 'transparent' : gradient() }}
          >
            {props.contact.picture ? (
              <img
                src={props.contact.picture}
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

          <div class="flex-1 min-w-0">
            <div
              class="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wider"
              style={{
                background: 'rgba(124, 58, 237, 0.14)',
                color: 'var(--color-accent)',
                border: '1px solid rgba(124, 58, 237, 0.3)',
              }}
            >
              <LinkIcon size={13} />
              Callback Link
            </div>

            <h2 class="mt-3 text-lg font-semibold" style={{ color: '#fff' }}>
              Send {displayName()} an audio callback link?
            </h2>
            <p class="mt-2 text-sm leading-6" style={{ color: 'rgba(255,255,255,0.74)' }}>
              Latimer will send a private Nostr DM with a one-tap link. When they open it,
              the app creates a throwaway incognito key and starts an audio call back to you.
            </p>
          </div>
        </div>

        <div
          class="mt-4 rounded-2xl px-4 py-3"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <p class="text-xs leading-5" style={{ color: 'rgba(255,255,255,0.64)' }}>
            Their main identity is not used for the return call. The temporary key only lives for that tab session.
          </p>
        </div>

        <label class="mt-4 flex items-center gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={props.dontShowAgain}
            onChange={(e) => props.onToggleDontShowAgain(e.currentTarget.checked)}
            style={{
              width: '18px',
              height: '18px',
              'accent-color': 'var(--color-accent)',
            }}
          />
          <span class="text-sm" style={{ color: 'rgba(255,255,255,0.82)' }}>
            Don&apos;t show this again
          </span>
        </label>

        <div class="mt-5 flex gap-3">
          <button
            class="flex-1 py-3 rounded-2xl text-sm font-semibold"
            style={{
              background: 'rgba(255,255,255,0.05)',
              color: 'rgba(255,255,255,0.82)',
              border: '1px solid rgba(255,255,255,0.08)',
              cursor: 'pointer',
            }}
            onClick={props.onCancel}
          >
            Cancel
          </button>
          <button
            class="flex-1 py-3 rounded-2xl text-sm font-semibold"
            style={{
              background: 'var(--color-accent)',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              'box-shadow': '0 10px 30px rgba(124, 58, 237, 0.35)',
            }}
            onClick={props.onConfirm}
          >
            Send Link
          </button>
        </div>
      </div>
    </div>
  );
};

export default LinkExplainerModal;
