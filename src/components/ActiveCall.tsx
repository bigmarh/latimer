import type { Component } from 'solid-js';
import { Show, onMount, createEffect } from 'solid-js';
import type { Contact, CallState } from '../types';
import { getDisplayName, getAvatarInitials } from '../services/nostr';
import { store } from '../store';
import CallControls from './CallControls';
import { ChevronLeftIcon } from './icons';

interface ActiveCallProps {
  contact: Contact;
  callState: CallState;
  callDuration: number;
  localStream: MediaStream | null;
  remoteStream: MediaStream;
  onEndCall: () => void;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onToggleSpeaker: () => void;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
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

const ActiveCall: Component<ActiveCallProps> = (props) => {
  let remoteVideoRef: HTMLVideoElement | undefined;
  let localVideoRef: HTMLVideoElement | undefined;
  let remoteAudioRef: HTMLAudioElement | undefined;

  const isTerminal = () =>
    props.callState === 'ended'
    || props.callState === 'rejected'
    || props.callState === 'busy'
    || props.callState === 'failed';

  const playMedia = async (element: HTMLMediaElement | undefined, label: string) => {
    if (!element || !element.paused) return;
    try {
      await element.play();
    } catch (err) {
      console.warn(`[ActiveCall] Failed to autoplay ${label}:`, err);
    }
  };

  // Always attach remote stream to the hidden audio element so audio works
  // for both audio-only and video calls. The video element handles visuals only.
  const attachRemoteStream = async () => {
    if (isTerminal()) return;

    if (remoteAudioRef && props.remoteStream) {
      if (remoteAudioRef.srcObject !== props.remoteStream) {
        remoteAudioRef.srcObject = props.remoteStream;
      }
      remoteAudioRef.muted = false;
      remoteAudioRef.volume = 1;
      await playMedia(remoteAudioRef, 'remote audio');
    }

    if (remoteVideoRef && props.remoteStream) {
      if (remoteVideoRef.srcObject !== props.remoteStream) {
        remoteVideoRef.srcObject = props.remoteStream;
      }
      await playMedia(remoteVideoRef, 'remote video');
    }
  };

  onMount(() => {
    void attachRemoteStream();
    if (localVideoRef && props.localStream) {
      if (localVideoRef.srcObject !== props.localStream) {
        localVideoRef.srcObject = props.localStream;
      }
      void playMedia(localVideoRef, 'local preview');
    }
  });

  createEffect(() => {
    void props.remoteStream;
    void props.callState;
    void attachRemoteStream();
  });

  createEffect(() => {
    if (localVideoRef && props.localStream) {
      if (localVideoRef.srcObject !== props.localStream) {
        localVideoRef.srcObject = props.localStream;
      }
      void playMedia(localVideoRef, 'local preview');
    }
  });

  const isConnecting = () =>
    props.callState === 'calling' || props.callState === 'ringing';
  const isEnded = () => props.callState === 'ended';

  const statusLabel = () => {
    switch (props.callState) {
      case 'calling': return 'Calling…';
      case 'ringing': return 'Ringing…';
      case 'connected': return formatDuration(props.callDuration);
      case 'ended': return 'Call ended';
      case 'rejected': return 'Call declined';
      case 'busy': return 'Busy';
      case 'failed': return 'Call failed';
      default: return '';
    }
  };

  const displayName = () => getDisplayName(props.contact);
  const initials = () => getAvatarInitials(props.contact);
  const gradient = () => getPubkeyGradient(props.contact.pubkey);

  return (
    <div
      class="fixed inset-0 z-40 flex flex-col"
      style={{ background: '#000' }}
    >
      {/* Hidden audio element — always present, plays remote audio for both call types */}
      <audio
        ref={(el) => {
          remoteAudioRef = el;
          if (props.remoteStream) {
            el.srcObject = props.remoteStream;
            el.muted = false;
            el.volume = 1;
            void el.play().catch(() => {/* autoplay policy */});
          }
        }}
        autoplay
        style={{
          position: 'absolute',
          width: '1px',
          height: '1px',
          opacity: '0',
          'pointer-events': 'none',
        }}
      />

      {/* Remote video — fills screen (muted because audio plays via <audio> above) */}
      <Show
        when={store.activeCallType === 'video' && (props.callState === 'connected' || isTerminal())}
      >
        <video
          ref={(el) => {
            remoteVideoRef = el;
            if (props.remoteStream) {
              el.srcObject = props.remoteStream;
              void el.play().catch(() => {/* autoplay policy */});
            }
          }}
          autoplay
          playsinline
          muted
          class="absolute inset-0 w-full h-full object-cover"
          style={{ background: '#000' }}
        />
      </Show>

      {/* Avatar fallback (audio-only or video off) */}
      <Show
        when={
          store.activeCallType === 'audio'
          || (!isTerminal() && (!store.videoEnabled || props.callState !== 'connected'))
        }
      >
        <div
          class="absolute inset-0 flex items-center justify-center"
          style={{ background: 'var(--color-bg)' }}
        >
          <div class="flex flex-col items-center gap-4">
            <div
              class="avatar w-28 h-28 text-4xl font-bold"
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
            <span class="text-xl font-semibold" style={{ color: 'var(--color-text)' }}>
              {displayName()}
            </span>
          </div>
        </div>
      </Show>

      {/* Local video PiP — top right */}
      <Show when={store.activeCallType === 'video' && props.localStream !== null}>
        <div
          class="absolute top-20 right-3 z-50 rounded-xl overflow-hidden"
          style={{
            width: '100px',
            height: '136px',
            border: '2px solid rgba(255,255,255,0.2)',
            'box-shadow': '0 4px 20px rgba(0,0,0,0.5)',
          }}
        >
          <video
            ref={(el) => {
              localVideoRef = el;
              if (props.localStream) el.srcObject = props.localStream;
            }}
            autoplay
            playsinline
            muted
            class="w-full h-full object-cover"
            style={{ transform: 'scaleX(-1)' }}
          />
        </div>
      </Show>

      {/* Top bar */}
      <div
        class="safe-top absolute top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-3"
        style={{
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0) 100%)',
        }}
      >
        <button
          class="flex items-center gap-1 text-sm font-medium py-1 px-2 rounded-lg"
          style={{ background: 'rgba(0,0,0,0.3)', color: '#fff', border: 'none', cursor: 'pointer' }}
          onClick={props.onEndCall}
          aria-label="Minimize call"
        >
          <ChevronLeftIcon size={18} />
        </button>

        <div class="flex flex-col items-center">
          <span class="text-sm font-semibold text-white">{displayName()}</span>
          <span
            class="text-xs"
            style={{
              color: props.callState === 'connected'
                ? 'var(--color-call-green)'
                : 'rgba(255,255,255,0.7)',
            }}
          >
            {statusLabel()}
          </span>
        </div>

        <div class="w-10" /> {/* spacer */}
      </div>

      {/* Connecting overlay */}
      <Show when={isConnecting()}>
        <div
          class="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4"
          style={{ background: 'rgba(10, 10, 15, 0.85)' }}
        >
          <div
            class="w-8 h-8 rounded-full border-3"
            style={{
              border: '3px solid rgba(124, 58, 237, 0.3)',
              'border-top-color': 'var(--color-accent)',
              animation: 'spin 0.8s linear infinite',
            }}
          />
          <p class="text-sm" style={{ color: 'var(--color-text-dim)' }}>
            {statusLabel()}
          </p>
        </div>
      </Show>

      {/* Call ended overlay */}
      <Show when={isEnded()}>
        <div
          class="absolute inset-0 z-30 flex items-center justify-center"
          style={{ background: 'rgba(10, 10, 15, 0.85)' }}
        >
          <p class="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>
            Call ended
          </p>
        </div>
      </Show>

      {/* Bottom controls */}
      <div
        class="safe-bottom-nav absolute bottom-0 left-0 right-0 z-50 pt-4"
        style={{
          background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0) 100%)',
        }}
      >
        <CallControls
          onEndCall={props.onEndCall}
          onToggleAudio={props.onToggleAudio}
          onToggleVideo={props.onToggleVideo}
          onToggleSpeaker={props.onToggleSpeaker}
        />
      </div>
    </div>
  );
};

export default ActiveCall;
