export const DEFAULT_RELAYS = [
  'wss://r1.bigsnap.ai',
  'wss://r2.bigsnap.ai',
  'wss://relay.damus.io',
  'wss://nos.lol',
];

export const LATIMER_METHODS = {
  CALL_OFFER: 'latimer.call_offer' as const,
  CALL_ANSWER: 'latimer.call_answer' as const,
  ICE_CANDIDATE: 'latimer.ice_candidate' as const,
  CALL_END: 'latimer.call_end' as const,
  CALL_REJECT: 'latimer.call_reject' as const,
  CALL_BUSY: 'latimer.call_busy' as const,
};

export const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

export const CALL_TIMEOUT_MS = 45_000; // 45 seconds before call times out

export const STORAGE_KEYS = {
  pubkey: 'latimer-pubkey',
  relays: 'latimer-relays',
  contacts: 'latimer-contacts',
  missedCalls: 'latimer-missed-calls',
  recentCalls: 'latimer-recent-calls',
  loginMethod: 'latimer-login-method',
  hideLinkExplainer: 'latimer-hide-link-explainer',
} as const;
