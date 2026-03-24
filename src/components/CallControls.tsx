import type { Component } from 'solid-js';
import { Show, createSignal } from 'solid-js';
import { store } from '../store';
import { cameras, selectedCameraId, selectCamera } from '../services/devices';
import { webrtcService } from '../services/webrtc';
import {
  MicIcon, MicOffIcon, VideoIcon, VideoOffIcon,
  PhoneOffIcon, SpeakerIcon, SpeakerOffIcon, FlipCameraIcon,
} from './icons';

interface CallControlsProps {
  onEndCall: () => void;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onToggleSpeaker: () => void;
}

const CallControls: Component<CallControlsProps> = (props) => {
  const [speakerOn, setSpeakerOn] = createSignal(false);
  const [switching, setSwitching] = createSignal(false);

  const handleSpeaker = () => {
    setSpeakerOn((v) => !v);
    props.onToggleSpeaker();
  };

  // Cycle to the next available camera
  const handleFlipCamera = async () => {
    const cams = cameras();
    if (cams.length < 2 || switching()) return;
    const currentId = selectedCameraId();
    const currentIdx = cams.findIndex((c) => c.deviceId === currentId);
    const nextCam = cams[(currentIdx + 1) % cams.length];
    setSwitching(true);
    try {
      selectCamera(nextCam.deviceId);
      await webrtcService.switchCamera(nextCam.deviceId);
    } finally {
      setSwitching(false);
    }
  };

  return (
    <div
      class="flex items-end justify-around px-6 pb-2"
      style={{ width: '100%' }}
    >
      {/* Mute/Unmute */}
      <div class="action-btn" onClick={props.onToggleAudio}>
        <div
          class="action-btn-circle"
          style={{
            background: store.audioEnabled
              ? 'var(--color-surface-2)'
              : 'rgba(239, 68, 68, 0.2)',
            border: store.audioEnabled
              ? '1px solid var(--color-border)'
              : '1px solid rgba(239, 68, 68, 0.5)',
            color: store.audioEnabled ? 'var(--color-text)' : 'var(--color-danger)',
          }}
        >
          {store.audioEnabled ? <MicIcon size={22} /> : <MicOffIcon size={22} />}
        </div>
        <span>{store.audioEnabled ? 'Mute' : 'Unmute'}</span>
      </div>

      {/* Camera */}
      <div class="action-btn" onClick={props.onToggleVideo}>
        <div
          class="action-btn-circle"
          style={{
            background: store.videoEnabled
              ? 'var(--color-surface-2)'
              : 'rgba(239, 68, 68, 0.2)',
            border: store.videoEnabled
              ? '1px solid var(--color-border)'
              : '1px solid rgba(239, 68, 68, 0.5)',
            color: store.videoEnabled ? 'var(--color-text)' : 'var(--color-danger)',
          }}
        >
          {store.videoEnabled ? <VideoIcon size={22} /> : <VideoOffIcon size={22} />}
        </div>
        <span>{store.videoEnabled ? 'Camera' : 'Camera Off'}</span>
      </div>

      {/* End call — center, largest */}
      <div class="action-btn" onClick={props.onEndCall}>
        <div
          class="call-btn"
          style={{
            background: 'var(--color-call-red)',
            color: '#fff',
          }}
        >
          <PhoneOffIcon size={28} />
        </div>
        <span style={{ color: 'var(--color-danger)' }}>End</span>
      </div>

      {/* Speaker */}
      <div class="action-btn" onClick={handleSpeaker}>
        <div
          class="action-btn-circle"
          style={{
            background: speakerOn() ? 'rgba(124, 58, 237, 0.2)' : 'var(--color-surface-2)',
            border: speakerOn() ? '1px solid rgba(124, 58, 237, 0.5)' : '1px solid var(--color-border)',
            color: speakerOn() ? 'var(--color-accent)' : 'var(--color-text)',
          }}
        >
          {speakerOn() ? <SpeakerIcon size={22} /> : <SpeakerOffIcon size={22} />}
        </div>
        <span>Speaker</span>
      </div>

      {/* Flip camera — only shown during video calls with 2+ cameras */}
      <Show when={store.activeCallType === 'video' && cameras().length > 1}>
        <div
          class="action-btn"
          onClick={() => { void handleFlipCamera(); }}
          style={{ opacity: switching() ? '0.5' : '1' }}
        >
          <div
            class="action-btn-circle"
            style={{
              background: 'var(--color-surface-2)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text)',
            }}
          >
            <FlipCameraIcon size={22} />
          </div>
          <span>Flip</span>
        </div>
      </Show>
    </div>
  );
};

export default CallControls;
