import { SimplePool } from 'nostr-tools';
import { nip19 } from 'nostr-tools';
import type { Contact } from '../types';

const pool = new SimplePool();

export async function loadContacts(pubkey: string, relays: string[]): Promise<Contact[]> {
  return new Promise((resolve) => {
    const contacts: Contact[] = [];

    // First, fetch the follow list (kind 3)
    const followSub = pool.subscribeMany(
      relays,
      { kinds: [3], authors: [pubkey], limit: 1 },
      {
        onevent(event) {
          const followedPubkeys = event.tags
            .filter((t) => t[0] === 'p' && t[1])
            .map((t) => t[1] as string);

          if (followedPubkeys.length === 0) {
            resolve([]);
            followSub.close();
            return;
          }

          // Batch fetch profiles in chunks of 100
          const batchSize = 100;
          const batches: string[][] = [];
          for (let i = 0; i < followedPubkeys.length; i += batchSize) {
            batches.push(followedPubkeys.slice(i, i + batchSize));
          }

          let remaining = batches.length;
          if (remaining === 0) {
            resolve([]);
            followSub.close();
            return;
          }

          const profileMap = new Map<string, Contact>();

          for (const batch of batches) {
            const profileSub = pool.subscribeMany(
              relays,
              { kinds: [0], authors: batch },
              {
                onevent(profileEvent) {
                  try {
                    const parsed = JSON.parse(profileEvent.content) as {
                      name?: string;
                      display_name?: string;
                      picture?: string;
                      about?: string;
                      nip05?: string;
                    };
                    profileMap.set(profileEvent.pubkey, {
                      pubkey: profileEvent.pubkey,
                      name: parsed.name,
                      displayName: parsed.display_name,
                      picture: parsed.picture,
                      about: parsed.about,
                      nip05: parsed.nip05,
                    });
                  } catch {
                    // ignore parse errors
                  }
                },
                oneose() {
                  profileSub.close();
                  // Add this batch's results immediately so the 10s timeout
                  // returns partial results instead of an empty array
                  for (const pk of batch) {
                    if (!contacts.some((c) => c.pubkey === pk)) {
                      contacts.push(profileMap.get(pk) ?? { pubkey: pk });
                    }
                  }
                  remaining--;
                  if (remaining === 0) {
                    // All batches done — resolve in follow order
                    const ordered = followedPubkeys.map(
                      (pk) => contacts.find((c) => c.pubkey === pk) ?? { pubkey: pk }
                    );
                    resolve(ordered);
                    followSub.close();
                  }
                },
              }
            );
          }
        },
        oneose() {
          // If no kind 3 event found
          followSub.close();
          resolve([]);
        },
      }
    );

    // Timeout after 10 seconds
    setTimeout(() => {
      followSub.close();
      resolve(contacts);
    }, 10_000);
  });
}

export async function loadProfile(pubkey: string, relays: string[]): Promise<Contact> {
  return new Promise((resolve) => {
    const sub = pool.subscribeMany(
      relays,
      { kinds: [0], authors: [pubkey], limit: 1 },
      {
        onevent(event) {
          try {
            const parsed = JSON.parse(event.content) as {
              name?: string;
              display_name?: string;
              picture?: string;
              about?: string;
              nip05?: string;
            };
            sub.close();
            resolve({
              pubkey,
              name: parsed.name,
              displayName: parsed.display_name,
              picture: parsed.picture,
              about: parsed.about,
              nip05: parsed.nip05,
            });
          } catch {
            sub.close();
            resolve({ pubkey });
          }
        },
        oneose() {
          sub.close();
          resolve({ pubkey });
        },
      }
    );

    setTimeout(() => {
      sub.close();
      resolve({ pubkey });
    }, 5_000);
  });
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
