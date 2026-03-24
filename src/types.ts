export interface Contact {
  pubkey: string;
  name?: string;
  displayName?: string;
  picture?: string;
  about?: string;
  nip05?: string;
}

export interface CallRecord {
  id: string;
  contact: Contact;
  direction: 'incoming' | 'outgoing';
  status: 'completed' | 'missed' | 'rejected' | 'busy' | 'failed';
  callType: 'audio' | 'video';
  startedAt: number;
  duration?: number; // seconds
  seen: boolean;
}

export type CallState =
  | 'idle'
  | 'calling'
  | 'ringing'
  | 'connected'
  | 'ended'
  | 'rejected'
  | 'busy'
  | 'failed';

export interface IncomingCallInfo {
  callId: string;
  from: string; // pubkey
  contact?: Contact;
  offer: RTCSessionDescriptionInit;
  callType: 'audio' | 'video';
  timestamp: number;
}

export type LatimerMethod =
  | 'latimer.call_offer'
  | 'latimer.call_answer'
  | 'latimer.ice_candidate'
  | 'latimer.call_end'
  | 'latimer.call_reject'
  | 'latimer.call_busy';

export interface SignalingMessage {
  id: string;
  method: LatimerMethod;
  params: Record<string, unknown>;
  timestamp: number;
}

export interface LatimerStore {
  loggedIn: boolean;
  pubkey: string;
  ownProfile: Contact | null;
  relays: string[];
  loading: boolean;
  loadingMessage: string;
  error: string | null;
  contacts: Contact[];
  contactsLoaded: boolean;
  searchQuery: string;
  callState: CallState;
  activeCallId: string | null;
  activeCallContact: Contact | null;
  activeCallType: 'audio' | 'video';
  incomingCall: IncomingCallInfo | null;
  callDuration: number;
  audioEnabled: boolean;
  videoEnabled: boolean;
  view: 'home' | 'settings' | 'inbox' | 'incognitoLobby';
  recentCalls: CallRecord[];
  incognito: boolean;
  joinInvite: { pubkey: string; relays: string[]; callType: 'audio' | 'video' } | null;
  viewProfilePubkey: string | null;
}
