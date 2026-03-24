/**
 * Signaling Worker — runs NWPCPeer off the main thread so that the
 * flood of nip44.decrypt/encrypt operations during relay backlog
 * processing doesn't block UI rendering.
 *
 * Message protocol (main ↔ worker):
 *
 * Main → Worker:
 *   { type: 'init', relays, sk?, nwpcState? }  sk=hex means KeySigner; nwpcState=saved Bloom filter
 *   { type: 'send', to, method, params }
 *   { type: 'destroy' }
 *   { type: 'signerResponse', id, result?, error? }
 *
 * Worker → Main:
 *   { type: 'ready', pubkey }
 *   { type: 'error', message }
 *   { type: 'method', method, params, from, timestamp }
 *   { type: 'signerRequest', id, op, params }
 *   { type: 'storageSet', key, value }        mirror NWPC state saves to localStorage
 */

import { NWPCPeer } from '@tat-protocol/nwpc';
import type { NWPCRequest, NWPCContext, NWPCResponseObject } from '@tat-protocol/nwpc';
import { KeySigner } from '@tat-protocol/signers';
import type { StorageInterface } from '@tat-protocol/storage';
import type { Signer, UnsignedNostrEvent, NostrEvent } from '@tat-protocol/types';

// ---------------------------------------------------------------------------
// Storage — localStorage not available in workers, so we use an in-memory
// store that mirrors writes for the NWPC state key back to the main thread
// via postMessage so main can persist the Bloom filter to localStorage.
// This lets us restore the Bloom filter on the next session so already-seen
// events are skipped before decryption is even attempted.
// ---------------------------------------------------------------------------
class PersistingMemoryStore implements StorageInterface {
  private store = new Map<string, string>();

  /** Pre-populate with a value saved from a previous session */
  preload(key: string, value: string) { this.store.set(key, value); }

  async getItem(key: string) { return this.store.get(key) ?? null; }

  async setItem(key: string, value: string) {
    this.store.set(key, value);
    // Notify the main thread so it can persist to localStorage
    self.postMessage({ type: 'storageSet', key, value });
  }

  async removeItem(key: string) { this.store.delete(key); }
  async clear() { this.store.clear(); }
}

// ---------------------------------------------------------------------------
// Proxy signer — delegates crypto to the main thread via postMessage
// ---------------------------------------------------------------------------
class ProxySigner implements Signer {
  private pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

  private request(op: string, params: Record<string, unknown>): Promise<unknown> {
    const id = crypto.randomUUID();
    const promise = new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
    self.postMessage({ type: 'signerRequest', id, op, params });
    return promise;
  }

  /** Called by the main thread when it has the result */
  handleResponse(id: string, result: unknown, error?: string) {
    const entry = this.pending.get(id);
    if (!entry) return;
    this.pending.delete(id);
    if (error) entry.reject(new Error(error));
    else entry.resolve(result);
  }

  getPublicKey(): Promise<string> {
    return this.request('getPublicKey', {}) as Promise<string>;
  }

  sign(message: Uint8Array): Promise<string> {
    return this.request('sign', { message: Array.from(message) }) as Promise<string>;
  }

  signEvent(event: UnsignedNostrEvent): Promise<NostrEvent> {
    return this.request('signEvent', { event: event as unknown as Record<string, unknown> }) as Promise<NostrEvent>;
  }

  nip44 = {
    encrypt: (recipientPubkey: string, plaintext: string): Promise<string> =>
      this.request('nip44.encrypt', { recipientPubkey, plaintext }) as Promise<string>,
    decrypt: (senderPubkey: string, ciphertext: string): Promise<string> =>
      this.request('nip44.decrypt', { senderPubkey, ciphertext }) as Promise<string>,
  };
}

// ---------------------------------------------------------------------------
// Worker state
// ---------------------------------------------------------------------------
let peer: NWPCPeer | null = null;
let proxySigner: ProxySigner | null = null;
let storage: PersistingMemoryStore | null = null;

const METHODS = [
  'latimer.call_offer',
  'latimer.call_answer',
  'latimer.ice_candidate',
  'latimer.call_end',
  'latimer.call_reject',
  'latimer.call_busy',
] as const;

function attachHandlers(p: NWPCPeer) {
  for (const method of METHODS) {
    p.use(
      method,
      async (req: NWPCRequest, ctx: NWPCContext, res: NWPCResponseObject) => {
        try {
          const params = JSON.parse(req.params) as Record<string, unknown>;
          self.postMessage({ type: 'method', method, params, from: ctx.sender, timestamp: req.timestamp });
        } catch {
          // ignore parse errors
        }
        await res.send({ received: true }, 'sender');
      },
    );
  }
}

// ---------------------------------------------------------------------------
// Main message handler
// ---------------------------------------------------------------------------
self.onmessage = async (e: MessageEvent) => {
  const msg = e.data as Record<string, unknown>;

  switch (msg.type) {
    case 'init': {
      const relays = msg.relays as string[];
      const sk = msg.sk as string | undefined;
      const savedNwpcState = msg.nwpcState as string | undefined;

      let signer: Signer;
      if (sk) {
        // KeySigner works directly in worker (noble/curves)
        signer = new KeySigner(sk);
      } else {
        proxySigner = new ProxySigner();
        signer = proxySigner;
      }

      storage = new PersistingMemoryStore();
      // Restore Bloom filter from previous session so already-seen events
      // are skipped before decryption is attempted, preventing the decrypt flood.
      if (savedNwpcState) {
        storage.preload('nwpc-bbb-love', savedNwpcState);
      }
      peer = new NWPCPeer({ signer, storage, relays });
      attachHandlers(peer);

      try {
        await peer.init();
        const pubkey = await signer.getPublicKey();
        self.postMessage({ type: 'ready', pubkey });
      } catch (err) {
        self.postMessage({ type: 'error', message: String(err) });
      }
      break;
    }

    case 'send': {
      if (!peer) break;
      void peer
        .request(msg.method as string, msg.params as Record<string, unknown>, msg.to as string)
        .catch((err: unknown) => {
          console.warn('[SignalingWorker] send failed:', msg.method, err);
        });
      break;
    }

    case 'sendAndAwait': {
      if (!peer) break;
      const reqId = msg.reqId as string;
      peer
        .request(
          msg.method as string,
          msg.params as Record<string, unknown>,
          msg.to as string,
          undefined,
          (msg.timeoutMs as number) ?? 30_000,
        )
        .then(() => self.postMessage({ type: 'sendAwaitDone', reqId }))
        .catch((err: unknown) => self.postMessage({ type: 'sendAwaitError', reqId, message: String(err) }));
      break;
    }

    case 'signerResponse': {
      proxySigner?.handleResponse(
        msg.id as string,
        msg.result,
        msg.error as string | undefined,
      );
      break;
    }

    case 'destroy': {
      void peer?.disconnect();
      peer = null;
      proxySigner = null;
      storage = null;
      break;
    }
  }
};
