import type { Component } from 'solid-js';
import { nip19 } from 'nostr-tools';
import { truncatePubkey } from '../services/nostr';

interface JoinCallProps {
  invite: { pubkey: string; relays: string[]; callType: 'audio' | 'video' };
  onJoinIncognito: () => void;
  onJoinWithKey: () => void;
}

const JoinCall: Component<JoinCallProps> = (props) => {
  const callLabel = () => props.invite.callType === 'audio' ? 'audio call' : 'video call';

  const displayPubkey = () => {
    try {
      const npub = nip19.npubEncode(props.invite.pubkey);
      return npub.slice(0, 12) + '…' + npub.slice(-6);
    } catch {
      return truncatePubkey(props.invite.pubkey);
    }
  };

  return (
    <div
      class="flex flex-col items-center justify-center h-full gap-6 px-6"
      style={{ background: 'var(--color-bg)' }}
    >
      {/* Icon */}
      <div
        class="flex items-center justify-center w-20 h-20 rounded-full text-4xl"
        style={{ background: 'rgba(124,58,237,0.15)' }}
      >
        📞
      </div>

      <div class="flex flex-col items-center gap-1 text-center">
        <h1 class="text-xl font-bold" style={{ color: 'var(--color-text)' }}>
          Starting your callback…
        </h1>
        <p class="text-xs font-mono" style={{ color: 'var(--color-text-dim)' }}>
          {displayPubkey()}
        </p>
      </div>

      <div
        class="w-10 h-10 rounded-full border-3"
        style={{
          border: '3px solid rgba(124, 58, 237, 0.24)',
          'border-top-color': 'var(--color-accent)',
          animation: 'spin 0.8s linear infinite',
        }}
      />

      <div class="flex flex-col items-center gap-2 text-center" style={{ 'max-width': '300px' }}>
        <p class="text-sm" style={{ color: 'var(--color-text)' }}>
          Latimer is creating a throwaway incognito key and starting an {callLabel()} with the person who sent this link.
        </p>
        <p class="text-xs" style={{ color: 'var(--color-text-dim)' }}>
          If the call screen does not appear after a few seconds, reload the page or open the link again.
        </p>
      </div>

      <p class="text-xs text-center" style={{ color: 'var(--color-text-dim)', 'max-width': '260px' }}>
        Incognito uses a throwaway key. Nothing is linked to your main identity, and the session disappears when the tab closes.
      </p>
    </div>
  );
};

export default JoinCall;
