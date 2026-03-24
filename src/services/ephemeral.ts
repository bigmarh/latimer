import { generateSecretKey, getPublicKey } from 'nostr-tools';
import { nip19 } from 'nostr-tools';
import { KeySigner } from '@tat-protocol/signers';

const SESSION_KEY = 'latimer-incognito-sk';

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

export interface EphemeralSession {
  pubkey: string;
  npub: string;
  skHex: string;
  signer: KeySigner;
}

export function createEphemeralSession(): EphemeralSession {
  const sk = generateSecretKey();
  const skHex = bytesToHex(sk);
  const pubkey = getPublicKey(sk);
  const npub = nip19.npubEncode(pubkey);
  sessionStorage.setItem(SESSION_KEY, skHex);
  return { pubkey, npub, skHex, signer: new KeySigner(sk) };
}

export function getEphemeralSession(): EphemeralSession | null {
  const hex = sessionStorage.getItem(SESSION_KEY);
  if (!hex) return null;
  const sk = hexToBytes(hex);
  const pubkey = getPublicKey(sk);
  const npub = nip19.npubEncode(pubkey);
  return { pubkey, npub, skHex: hex, signer: new KeySigner(sk) };
}

export function clearEphemeralSession(): void {
  sessionStorage.removeItem(SESSION_KEY);
}

/** Build an invite URL from the current origin + hash fragment */
export function buildInviteUrl(
  npub: string,
  relays: string[],
  callType: 'audio' | 'video' = 'video',
): string {
  const params = new URLSearchParams();
  params.set('npub', npub);
  params.set('callType', callType);
  relays.forEach((r) => params.append('r', r));
  return `${window.location.origin}${window.location.pathname}#join?${params.toString()}`;
}

/** Build a shareable profile URL for the current user */
export function buildProfileUrl(npub: string): string {
  return `${window.location.origin}${window.location.pathname}#user?npub=${npub}`;
}

/** Parse a #user?npub=... URL. Returns pubkey hex or null. */
export function parseProfileUrl(): string | null {
  const hash = window.location.hash;
  if (!hash.startsWith('#user?')) return null;
  const params = new URLSearchParams(hash.slice(6));
  const npub = params.get('npub');
  if (!npub) return null;
  try {
    const decoded = nip19.decode(npub);
    if (decoded.type !== 'npub') return null;
    return decoded.data as string;
  } catch { return null; }
}

/** Parse join params from the URL hash. Returns null if not a join URL. */
export function parseJoinUrl(): { pubkey: string; relays: string[]; callType: 'audio' | 'video' } | null {
  const hash = window.location.hash; // e.g. "#join?npub=npub1...&r=wss://..."
  if (!hash.startsWith('#join?')) return null;
  const params = new URLSearchParams(hash.slice(6));
  const npub = params.get('npub');
  if (!npub) return null;
  try {
    const decoded = nip19.decode(npub);
    if (decoded.type !== 'npub') return null;
    const pubkey = decoded.data as string;
    const relays = params.getAll('r').filter(Boolean);
    const callType = params.get('callType') === 'audio' ? 'audio' : 'video';
    return { pubkey, relays: relays.length > 0 ? relays : [], callType };
  } catch {
    return null;
  }
}
