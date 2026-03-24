import { createSignal } from 'solid-js';

export interface MediaDeviceInfo2 {
  deviceId: string;
  label: string;
  kind: 'audioinput' | 'videoinput' | 'audiooutput';
}

const STORAGE_KEY_CAM = 'latimer-camera-id';
const STORAGE_KEY_MIC = 'latimer-mic-id';

const [cameras, setCameras] = createSignal<MediaDeviceInfo2[]>([]);
const [mics, setMics] = createSignal<MediaDeviceInfo2[]>([]);
const [selectedCameraId, setSelectedCameraId] = createSignal<string>(
  localStorage.getItem(STORAGE_KEY_CAM) ?? ''
);
const [selectedMicId, setSelectedMicId] = createSignal<string>(
  localStorage.getItem(STORAGE_KEY_MIC) ?? ''
);

export { cameras, mics, selectedCameraId, selectedMicId };

export function selectCamera(id: string) {
  setSelectedCameraId(id);
  localStorage.setItem(STORAGE_KEY_CAM, id);
}

export function selectMic(id: string) {
  setSelectedMicId(id);
  localStorage.setItem(STORAGE_KEY_MIC, id);
}

/**
 * Enumerate available camera and microphone devices.
 * Must be called after getUserMedia has been granted at least once
 * (labels are empty before permission is granted).
 */
export async function enumerateDevices(): Promise<void> {
  const devices = await navigator.mediaDevices.enumerateDevices();

  const cams = devices
    .filter((d) => d.kind === 'videoinput')
    .map((d, i) => ({
      deviceId: d.deviceId,
      label: d.label || `Camera ${i + 1}`,
      kind: d.kind as 'videoinput',
    }));

  const micList = devices
    .filter((d) => d.kind === 'audioinput')
    .map((d, i) => ({
      deviceId: d.deviceId,
      label: d.label || `Microphone ${i + 1}`,
      kind: d.kind as 'audioinput',
    }));

  setCameras(cams);
  setMics(micList);

  // If saved IDs no longer exist, clear them
  if (selectedCameraId() && !cams.some((c) => c.deviceId === selectedCameraId())) {
    setSelectedCameraId('');
    localStorage.removeItem(STORAGE_KEY_CAM);
  }
  if (selectedMicId() && !micList.some((m) => m.deviceId === selectedMicId())) {
    setSelectedMicId('');
    localStorage.removeItem(STORAGE_KEY_MIC);
  }
}

/** Build getUserMedia constraints using selected device IDs. */
export function buildConstraints(videoEnabled: boolean): MediaStreamConstraints {
  const camId = selectedCameraId();
  const micId = selectedMicId();

  const audio: MediaTrackConstraints = micId ? { deviceId: { exact: micId } } : true as unknown as MediaTrackConstraints;

  if (!videoEnabled) return { audio, video: false };

  const video: MediaTrackConstraints = camId
    ? { deviceId: { exact: camId }, width: { ideal: 1280 }, height: { ideal: 720 } }
    : { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' };

  return { audio, video };
}
