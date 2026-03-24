import type { Component } from 'solid-js';
import type { IncomingCallInfo, Contact } from '../types';
import { getDisplayName, getAvatarInitials } from '../services/nostr';
import { PhoneIcon, PhoneOffIcon } from './icons';

interface IncomingCallModalProps {
  call: IncomingCallInfo;
  contact?: Contact;
  onAccept: () => void;
  onReject: () => void;
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

const IncomingCallModal: Component<IncomingCallModalProps> = (props) => {
  const contact = (): Contact =>
    props.contact ?? { pubkey: props.call.from };

  const displayName = () => getDisplayName(contact());
  const initials = () => getAvatarInitials(contact());
  const gradient = () => getPubkeyGradient(props.call.from);
  const callTypeLabel = () =>
    props.call.callType === 'video' ? 'Incoming video call' : 'Incoming audio call';

  return (
    <div
      class="fixed inset-0 z-50 flex flex-col items-center justify-between pb-16 pt-24 fade-enter"
      style={{ background: 'rgba(10, 10, 15, 0.95)', 'backdrop-filter': 'blur(16px)' }}
    >
      {/* Call info section */}
      <div class="flex flex-col items-center gap-5">
        {/* Caller avatar with pulsing ring */}
        <div class="relative flex items-center justify-center">
          {/* Pulsing ring layers */}
          <div
            class="absolute rounded-full"
            style={{
              width: '148px',
              height: '148px',
              background: 'rgba(34, 197, 94, 0.12)',
              animation: 'pulse-ring 1.5s ease-out 0.5s infinite',
            }}
          />
          <div
            class="absolute rounded-full"
            style={{
              width: '130px',
              height: '130px',
              background: 'rgba(34, 197, 94, 0.18)',
              animation: 'pulse-ring 1.5s ease-out infinite',
            }}
          />

          {/* Avatar */}
          <div
            class="avatar w-28 h-28 text-4xl font-bold relative z-10"
            style={{
              background: contact().picture ? 'transparent' : gradient(),
              border: '3px solid rgba(34, 197, 94, 0.5)',
            }}
          >
            {contact().picture ? (
              <img
                src={contact().picture}
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
        </div>

        {/* Caller name */}
        <div class="flex flex-col items-center gap-1">
          <h2 class="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>
            {displayName()}
          </h2>
          <p class="text-sm" style={{ color: 'var(--color-text-dim)' }}>
            {callTypeLabel()}
          </p>
        </div>
      </div>

      {/* Action buttons */}
      <div class="flex items-center gap-16 safe-bottom">
        {/* Reject */}
        <div class="flex flex-col items-center gap-3">
          <button
            class="call-btn"
            style={{ background: 'var(--color-call-red)', color: '#fff', border: 'none', cursor: 'pointer' }}
            onClick={props.onReject}
            aria-label="Reject call"
          >
            <PhoneOffIcon size={30} />
          </button>
          <span class="text-xs font-medium" style={{ color: 'var(--color-text-dim)' }}>
            Decline
          </span>
        </div>

        {/* Accept */}
        <div class="flex flex-col items-center gap-3">
          <button
            class="call-btn"
            style={{ background: 'var(--color-call-green)', color: '#fff', border: 'none', cursor: 'pointer' }}
            onClick={props.onAccept}
            aria-label="Accept call"
          >
            <PhoneIcon size={30} />
          </button>
          <span class="text-xs font-medium" style={{ color: 'var(--color-text-dim)' }}>
            Accept
          </span>
        </div>
      </div>
    </div>
  );
};

export default IncomingCallModal;
