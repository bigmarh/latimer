import type { Component } from 'solid-js';
import { createSignal } from 'solid-js';
import type { Contact } from '../types';
import { getDisplayName, getAvatarInitials } from '../services/nostr';
import { LinkIcon, VideoIcon, PhoneIcon, StarIcon } from './icons';

interface ContactCardProps {
  contact: Contact;
  starred: boolean;
  onSendLink: (contact: Contact) => Promise<boolean>;
  onCall: (contact: Contact, type: 'audio' | 'video') => void;
  onToggleStar: (contact: Contact) => void;
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
  const displayName = () => truncateName(getDisplayName(props.contact), 24);
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
          background: 'rgba(124, 58, 237, 0.16)',
          color: 'var(--color-accent)',
          border: '1px solid rgba(124, 58, 237, 0.32)',
        };
      case 'sent':
        return {
          background: 'rgba(34, 197, 94, 0.16)',
          color: '#22c55e',
          border: '1px solid rgba(34, 197, 94, 0.28)',
        };
      case 'error':
        return {
          background: 'rgba(239, 68, 68, 0.16)',
          color: 'var(--color-danger)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
        };
      default:
        return {
          background: 'rgba(255,255,255,0.04)',
          color: 'var(--color-text-dim)',
          border: '1px solid rgba(255,255,255,0.08)',
        };
    }
  };

  const actionButtonBaseStyle = {
    height: '38px',
    'border-radius': '999px',
    display: 'inline-flex',
    'align-items': 'center',
    'justify-content': 'center',
    gap: '0.45rem',
    padding: '0 0.9rem',
    'font-size': '0.75rem',
    'font-weight': '600',
    'letter-spacing': '0.01em',
    transition: 'transform 0.12s ease, background 0.12s ease, border-color 0.12s ease',
  } as const;

  return (
    <div
      class="card flex overflow-hidden"
      style={{
        transition: 'transform 0.12s, box-shadow 0.12s',
        position: 'relative',
        'min-height': '104px',
        background: 'linear-gradient(180deg, rgba(23,24,35,0.98) 0%, rgba(16,18,28,0.98) 100%)',
        'box-shadow': '0 10px 32px rgba(0,0,0,0.2)',
      }}
    >
      <button
        class="flex items-center justify-center w-8 h-8 rounded-full"
        style={{
          position: 'absolute',
          top: '12px',
          right: '12px',
          'z-index': '1',
          background: props.starred ? 'rgba(250, 204, 21, 0.16)' : 'rgba(255,255,255,0.04)',
          color: props.starred ? '#facc15' : 'rgba(255,255,255,0.45)',
          border: props.starred ? '1px solid rgba(250, 204, 21, 0.3)' : '1px solid rgba(255,255,255,0.06)',
          cursor: 'pointer',
        }}
        onClick={() => props.onToggleStar(props.contact)}
        aria-label={props.starred ? `Remove ${displayName()} from favorites` : `Add ${displayName()} to favorites`}
        title={props.starred ? 'Favorited' : 'Add to favorites'}
      >
        <StarIcon size={15} style={{ fill: props.starred ? 'currentColor' : 'transparent' }} />
      </button>

      <div
        class="flex items-center justify-center w-[96px] min-h-full flex-shrink-0"
        style={{
          background: props.contact.picture ? '#10121a' : gradient(),
          'border-right': '1px solid rgba(255,255,255,0.06)',
        }}
      >
        {props.contact.picture ? (
          <img
            src={props.contact.picture}
            alt={displayName()}
            class="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <div
            class="avatar w-14 h-14 text-xl"
            style={{
              background: 'rgba(8,10,15,0.18)',
              'box-shadow': '0 10px 30px rgba(0,0,0,0.16)',
            }}
          >
            <span>{initials()}</span>
          </div>
        )}
      </div>

      <div class="flex-1 min-w-0 flex flex-col justify-center px-4 py-4">
        <span
          class="pr-10 text-sm font-semibold leading-tight truncate"
          style={{ color: 'var(--color-text)' }}
        >
          {displayName()}
        </span>

        <div class="mt-3 flex items-center gap-2 flex-wrap">
          <button
            class="transition-all"
            style={{
              ...actionButtonBaseStyle,
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
            <LinkIcon size={14} />
            <span>{linkState() === 'sent' ? 'Sent' : 'Link'}</span>
          </button>

          <button
            class="transition-all"
            style={{
              ...actionButtonBaseStyle,
              background: 'rgba(255,255,255,0.04)',
              color: 'var(--color-text-dim)',
              border: '1px solid rgba(255,255,255,0.08)',
              cursor: 'pointer',
            }}
            onClick={() => props.onCall(props.contact, 'audio')}
            aria-label={`Audio call ${displayName()}`}
          >
            <PhoneIcon size={14} />
            <span>Call</span>
          </button>

          <button
            class="transition-all"
            style={{
              ...actionButtonBaseStyle,
              background: 'rgba(124, 58, 237, 0.18)',
              color: '#fff',
              border: '1px solid rgba(124, 58, 237, 0.3)',
              'box-shadow': '0 10px 22px rgba(124, 58, 237, 0.18)',
              cursor: 'pointer',
            }}
            onClick={() => props.onCall(props.contact, 'video')}
            aria-label={`Video call ${displayName()}`}
          >
            <VideoIcon size={14} />
            <span>Video</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ContactCard;
