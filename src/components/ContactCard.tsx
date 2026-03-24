import type { Component } from 'solid-js';
import { createSignal } from 'solid-js';
import type { Contact } from '../types';
import { getDisplayName, getAvatarInitials } from '../services/nostr';
import { LinkIcon, VideoIcon, PhoneIcon } from './icons';

interface ContactCardProps {
  contact: Contact;
  onSendLink: (contact: Contact) => Promise<boolean>;
  onCall: (contact: Contact, type: 'audio' | 'video') => void;
}

/**
 * Derive a gradient from the first 6 hex chars of the pubkey.
 * If the pubkey is too short or non-hex, fall back to the accent color.
 */
function getPubkeyGradient(pubkey: string): string {
  const hex = pubkey.replace(/[^0-9a-fA-F]/g, '');
  if (hex.length < 12) return 'linear-gradient(135deg, #7c3aed, #6d28d9)';

  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);

  // Complementary-ish color by rotating hue (simple offset)
  const r2 = parseInt(hex.slice(6, 8), 16);
  const g2 = parseInt(hex.slice(8, 10), 16);
  const b2 = parseInt(hex.slice(10, 12), 16);

  return `linear-gradient(135deg, rgb(${r},${g},${b}), rgb(${r2},${g2},${b2}))`;
}

function truncateName(name: string, max = 12): string {
  return name.length > max ? name.slice(0, max - 1) + '…' : name;
}

const ContactCard: Component<ContactCardProps> = (props) => {
  const [linkState, setLinkState] = createSignal<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const displayName = () => truncateName(getDisplayName(props.contact));
  const initials = () => getAvatarInitials(props.contact);
  const gradient = () => getPubkeyGradient(props.contact.pubkey);

  const handleSendLink = async () => {
    if (linkState() === 'sending') return;

    setLinkState('sending');
    try {
      const sent = await props.onSendLink(props.contact);
      if (!sent) {
        setLinkState('idle');
        return;
      }
      setLinkState('sent');
      setTimeout(() => setLinkState('idle'), 2_500);
    } catch (err) {
      console.error('[ContactCard] Failed to send call link:', err);
      setLinkState('error');
      setTimeout(() => setLinkState('idle'), 3_500);
    }
  };

  const linkButtonStyle = () => {
    switch (linkState()) {
      case 'sending':
        return {
          background: 'rgba(124, 58, 237, 0.14)',
          color: 'var(--color-accent)',
          border: '1px solid rgba(124, 58, 237, 0.35)',
        };
      case 'sent':
        return {
          background: 'rgba(34, 197, 94, 0.14)',
          color: '#22c55e',
          border: '1px solid rgba(34, 197, 94, 0.35)',
        };
      case 'error':
        return {
          background: 'rgba(239, 68, 68, 0.14)',
          color: 'var(--color-danger)',
          border: '1px solid rgba(239, 68, 68, 0.35)',
        };
      default:
        return {
          background: 'var(--color-surface-2)',
          color: 'var(--color-text-dim)',
          border: '1px solid var(--color-border)',
        };
    }
  };

  return (
    <div
      class="card flex flex-col items-center p-3 gap-2 cursor-pointer"
      style={{ transition: 'transform 0.12s, box-shadow 0.12s' }}
    >
      {/* Avatar */}
      <div
        class="avatar w-16 h-16 text-xl"
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

      {/* Name */}
      <span
        class="text-xs font-medium text-center leading-tight"
        style={{ color: 'var(--color-text)' }}
      >
        {displayName()}
      </span>

      {/* Call buttons */}
      <div class="flex items-center justify-between w-full mt-2 px-1">
        {/* Send callback link */}
        <button
          class="flex items-center justify-center w-10 h-10 rounded-full transition-all"
          style={{
            ...linkButtonStyle(),
            cursor: linkState() === 'sending' ? 'not-allowed' : 'pointer',
          }}
          onClick={() => { void handleSendLink(); }}
          aria-label={`Send callback link to ${displayName()}`}
          title={
            linkState() === 'sent'
              ? 'Link sent'
              : linkState() === 'error'
                ? 'Sending failed'
                : 'Send callback link'
          }
          disabled={linkState() === 'sending'}
        >
          <LinkIcon size={16} />
        </button>

        {/* Audio call */}
        <button
          class="flex items-center justify-center w-10 h-10 rounded-full transition-all"
          style={{
            background: 'var(--color-surface-2)',
            color: 'var(--color-text-dim)',
            border: '1px solid var(--color-border)',
            cursor: 'pointer',
          }}
          onClick={() => props.onCall(props.contact, 'audio')}
          aria-label={`Audio call ${displayName()}`}
        >
          <PhoneIcon size={16} />
        </button>

        {/* Video call */}
        <button
          class="flex items-center justify-center w-10 h-10 rounded-full transition-all"
          style={{
            background: 'var(--color-accent)',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
          }}
          onClick={() => props.onCall(props.contact, 'video')}
          aria-label={`Video call ${displayName()}`}
        >
          <VideoIcon size={16} />
        </button>
      </div>
    </div>
  );
};

export default ContactCard;
