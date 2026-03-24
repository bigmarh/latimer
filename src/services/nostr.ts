import { SimplePool, nip19, type Event } from 'nostr-tools';
import type { Contact } from '../types';
import { DEFAULT_RELAYS } from '../constants';

const pool = new SimplePool();
const relayResolutionCache = new Map<string, Promise<string[]>>();

const DISCOVERY_RELAYS = [
  ...DEFAULT_RELAYS,
  'wss://relay.primal.net',
  'wss://relay.nostr.band',
  'wss://purplepag.es',
];

function normalizeRelay(relay: string): string | null {
  const trimmed = relay.trim();
  if (!trimmed.startsWith('wss://') && !trimmed.startsWith('ws://')) return null;
  return trimmed.replace(/\/+$/, '');
}

function mergeRelays(...groups: Array<string[] | undefined>): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();

  for (const group of groups) {
    for (const relay of group ?? []) {
      const normalized = normalizeRelay(relay);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      merged.push(normalized);
    }
  }

  return merged;
}

function parseProfileEvent(event: Event): Contact {
  try {
    const parsed = JSON.parse(event.content) as {
      name?: string;
      display_name?: string;
      picture?: string;
      about?: string;
      nip05?: string;
    };

    return {
      pubkey: event.pubkey,
      name: parsed.name,
      displayName: parsed.display_name,
      picture: parsed.picture,
      about: parsed.about,
      nip05: parsed.nip05,
    };
  } catch {
    return { pubkey: event.pubkey };
  }
}

async function loadLatestEvent(
  relays: string[],
  filter: { kinds: number[]; authors: string[]; limit?: number },
  timeoutMs: number,
): Promise<Event | null> {
  return new Promise((resolve) => {
    let settled = false;
    let latest: Event | null = null;
    let sub: { close: (reason?: string) => void | Promise<void> } | null = null;

    const finalize = () => {
      if (settled) return;
      settled = true;
      if (sub) void sub.close('done');
      resolve(latest);
    };

    sub = pool.subscribeMany(relays, filter, {
      onevent(event) {
        if (!latest || event.created_at > latest.created_at) {
          latest = event;
        }
      },
      oneose() {
        finalize();
      },
      onclose() {
        finalize();
      },
    });

    setTimeout(finalize, timeoutMs);
  });
}

async function resolveUserRelays(pubkey: string, relays: string[]): Promise<string[]> {
  const seedRelays = mergeRelays(relays, DISCOVERY_RELAYS);
  const cacheKey = `${pubkey}:${seedRelays.join(',')}`;
  const cached = relayResolutionCache.get(cacheKey);
  if (cached) return cached;

  const resolution = (async () => {
    const relayListEvent = await loadLatestEvent(
      seedRelays,
      { kinds: [10002], authors: [pubkey], limit: 1 },
      4_000,
    );

    if (!relayListEvent) {
      return seedRelays;
    }

    const publishedRelays = relayListEvent.tags
      .filter((tag) => tag[0] === 'r' && typeof tag[1] === 'string')
      .map((tag) => tag[1] as string);

    return mergeRelays(seedRelays, publishedRelays);
  })();

  relayResolutionCache.set(cacheKey, resolution);
  return resolution;
}

export async function loadContacts(pubkey: string, relays: string[]): Promise<Contact[]> {
  const queryRelays = await resolveUserRelays(pubkey, relays);
  const followEvent = await loadLatestEvent(
    queryRelays,
    { kinds: [3], authors: [pubkey], limit: 1 },
    6_000,
  );

  if (!followEvent) {
    return [];
  }

  const followedPubkeys = Array.from(
    new Set(
      followEvent.tags
        .filter((tag) => tag[0] === 'p' && tag[1])
        .map((tag) => tag[1] as string),
    ),
  );

  if (followedPubkeys.length === 0) {
    return [];
  }

  return new Promise((resolve) => {
    const profileMap = new Map<string, Contact>();
    const subs: Array<{ close: (reason?: string) => void | Promise<void> }> = [];
    const completedBatches = new Set<number>();
    let settled = false;

    const finalize = () => {
      if (settled) return;
      settled = true;
      subs.forEach((sub) => void sub.close('done'));
      resolve(
        followedPubkeys.map((followedPubkey) => profileMap.get(followedPubkey) ?? { pubkey: followedPubkey }),
      );
    };

    const markBatchDone = (index: number) => {
      if (completedBatches.has(index)) return;
      completedBatches.add(index);
      if (completedBatches.size === Math.ceil(followedPubkeys.length / 100)) {
        finalize();
      }
    };

    for (let i = 0; i < followedPubkeys.length; i += 100) {
      const batch = followedPubkeys.slice(i, i + 100);
      const batchIndex = i / 100;

      const sub = pool.subscribeMany(
        queryRelays,
        { kinds: [0], authors: batch },
        {
          onevent(profileEvent) {
            profileMap.set(profileEvent.pubkey, parseProfileEvent(profileEvent));
          },
          oneose() {
            markBatchDone(batchIndex);
          },
          onclose() {
            markBatchDone(batchIndex);
          },
        },
      );

      subs.push(sub);
    }

    setTimeout(finalize, 8_000);
  });
}

export async function loadProfile(pubkey: string, relays: string[]): Promise<Contact> {
  const queryRelays = await resolveUserRelays(pubkey, relays);
  const event = await loadLatestEvent(
    queryRelays,
    { kinds: [0], authors: [pubkey], limit: 1 },
    5_000,
  );

  return event ? parseProfileEvent(event) : { pubkey };
}

export function getDisplayName(contact: Contact): string {
  if (contact.displayName) return contact.displayName;
  if (contact.name) return contact.name;
  return truncatePubkey(contact.pubkey);
}

export function truncatePubkey(pubkey: string): string {
  try {
    const npub = nip19.npubEncode(pubkey);
    return npub.slice(0, 10) + '...' + npub.slice(-4);
  } catch {
    return pubkey.slice(0, 8) + '...' + pubkey.slice(-4);
  }
}

export function getAvatarInitials(contact: Contact): string {
  const name = contact.displayName || contact.name;
  if (name && name.length > 0) {
    return name[0].toUpperCase();
  }
  return contact.pubkey[0].toUpperCase();
}

export function buildCallInviteMessage(
  inviteUrl: string,
  callType: 'audio' | 'video' = 'audio',
): string {
  const label = callType === 'audio' ? 'audio call' : 'video call';
  return [
    'Latimer callback request',
    '',
    `Open this link to launch Latimer in a throwaway incognito session and start a ${label} with me:`,
    inviteUrl,
    '',
    'The session is temporary and disappears when the tab closes.',
  ].join('\n');
}

export async function publishFollowList(
  contacts: Contact[],
  relays: string[],
  signEvent: (template: { kind: number; content: string; tags: string[][]; created_at: number }) => Promise<{ id: string; pubkey: string; sig: string; kind: number; content: string; tags: string[][]; created_at: number } | null>
): Promise<void> {
  const tags = contacts.map((c) => ['p', c.pubkey, relays[0] ?? '', c.displayName ?? c.name ?? '']);
  const template = {
    kind: 3,
    content: '',
    tags,
    created_at: Math.floor(Date.now() / 1000),
  };
  const signed = await signEvent(template);
  if (!signed) return;
  const pub = new SimplePool();
  await Promise.allSettled(pub.publish(relays, signed as Parameters<typeof pub.publish>[1]));
}
