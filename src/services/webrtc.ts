import { ICE_SERVERS } from '../constants';
import { buildConstraints, enumerateDevices } from './devices';

type StreamCallback = (stream: MediaStream) => void;
type IceCandidateCallback = (candidate: RTCIceCandidateInit) => void;
type ConnectionStateCallback = (state: RTCPeerConnectionState) => void;
type TrackCallback = (stream: MediaStream) => void;

class WebRTCService {
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream = new MediaStream();
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private facingMode: 'user' | 'environment' = 'user';

  onLocalStream: StreamCallback | null = null;
  onRemoteTrack: TrackCallback | null = null;
  onIceCandidate: IceCandidateCallback | null = null;
  onConnectionState: ConnectionStateCallback | null = null;

  private setupPeerConnection(): void {
    if (!this.pc) return;

    this.pc.ontrack = (event) => {
      const [stream] = event.streams;

      if (stream) {
        this.remoteStream = stream;
      } else if (!this.remoteStream.getTracks().some((track) => track.id === event.track.id)) {
        this.remoteStream.addTrack(event.track);
      }

      this.onRemoteTrack?.(this.remoteStream);
    };

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.onIceCandidate?.(event.candidate.toJSON());
      }
    };

    this.pc.onconnectionstatechange = () => {
      if (this.pc) {
        this.onConnectionState?.(this.pc.connectionState);
      }
    };
  }

  async createOffer(videoEnabled: boolean): Promise<RTCSessionDescriptionInit> {
    this.remoteStream = new MediaStream();
    this.localStream = await navigator.mediaDevices.getUserMedia(
      buildConstraints(videoEnabled)
    );
    // Update device list now that we have permission
    void enumerateDevices();
    this.onLocalStream?.(this.localStream);

    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.setupPeerConnection();

    for (const track of this.localStream.getTracks()) {
      this.pc.addTrack(track, this.localStream);
    }

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    // Return plain object — RTCSessionDescription prototype props don't survive JSON serialization
    return { type: offer.type, sdp: offer.sdp };
  }

  async createAnswer(
    offer: RTCSessionDescriptionInit,
    videoEnabled: boolean
  ): Promise<RTCSessionDescriptionInit> {
    this.remoteStream = new MediaStream();
    this.localStream = await navigator.mediaDevices.getUserMedia(
      buildConstraints(videoEnabled)
    );
    void enumerateDevices();
    this.onLocalStream?.(this.localStream);

    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.setupPeerConnection();

    for (const track of this.localStream.getTracks()) {
      this.pc.addTrack(track, this.localStream);
    }

    await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);

    // Flush pending ICE candidates
    await this.flushPendingCandidates();

    return { type: answer.type, sdp: answer.sdp };
  }

  async setRemoteAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.pc) {
      console.warn('[WebRTC] No peer connection when setting remote answer');
      return;
    }
    await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
    await this.flushPendingCandidates();
  }

  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.pc || !this.pc.remoteDescription) {
      // Queue the candidate for later
      this.pendingCandidates.push(candidate);
      return;
    }
    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.warn('[WebRTC] Failed to add ICE candidate:', err);
    }
  }

  private async flushPendingCandidates(): Promise<void> {
    if (!this.pc) return;
    const candidates = [...this.pendingCandidates];
    this.pendingCandidates = [];
    for (const candidate of candidates) {
      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.warn('[WebRTC] Failed to flush ICE candidate:', err);
      }
    }
  }

  async flipCamera(): Promise<void> {
    if (!this.pc || !this.localStream) return;
    this.facingMode = this.facingMode === 'user' ? 'environment' : 'user';
    const newStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { exact: this.facingMode }, width: { ideal: 640 }, height: { ideal: 480 } },
    }).catch(() =>
      navigator.mediaDevices.getUserMedia({
        video: { facingMode: this.facingMode, width: { ideal: 640 }, height: { ideal: 480 } },
      })
    );

    const newTrack = newStream.getVideoTracks()[0];
    if (!newTrack) return;

    // Replace track in sender
    const sender = this.pc.getSenders().find((s) => s.track?.kind === 'video');
    if (sender) await sender.replaceTrack(newTrack);

    // Stop old video track and swap in local stream
    this.localStream.getVideoTracks().forEach((t) => t.stop());
    this.localStream.getVideoTracks().forEach((t) => this.localStream!.removeTrack(t));
    this.localStream.addTrack(newTrack);

    this.onLocalStream?.(this.localStream);
  }

  toggleAudio(): boolean {
    if (!this.localStream) return false;
    const audioTrack = this.localStream.getAudioTracks()[0];
    if (!audioTrack) return false;
    audioTrack.enabled = !audioTrack.enabled;
    return audioTrack.enabled;
  }

  toggleVideo(): boolean {
    if (!this.localStream) return false;
    const videoTrack = this.localStream.getVideoTracks()[0];
    if (!videoTrack) return false;
    videoTrack.enabled = !videoTrack.enabled;
    return videoTrack.enabled;
  }

  cleanup(): void {
    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        track.stop();
      }
      this.localStream = null;
    }
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
    this.remoteStream = new MediaStream();
    this.pendingCandidates = [];
    this.facingMode = 'user';
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  getRemoteStream(): MediaStream {
    return this.remoteStream;
  }
}

export const webrtcService = new WebRTCService();
