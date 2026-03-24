import { NIP07Signer } from '@tat-protocol/signers';
import type { Signer } from '@tat-protocol/types';
import { WrapWithSigner } from '@tat-protocol/utils';
import NDK from '@nostr-dev-kit/ndk';
import { SimplePool, nip04 } from 'nostr-tools';
import type { LatimerMethod } from '../types';
import { STORAGE_KEYS } from '../constants';
import { resolveUserRelays } from './nostr';

type MethodHandler = (params: Record<string, unknown>, fromPubkey: string, timestamp: number) => void;

/**
 * LatimerSignaling — runs NWPCPeer inside a Web Worker so the flood of
 * nip44.decrypt/encrypt operations during relay backlog processing never
 * blocks main-thread rendering.
 *
 * For KeySigner (incognito / nsec) the raw sk hex is passed to the worker
 * so crypto runs entirely off the main thread.
 *
 * For NIP-07 / NostrPass the worker uses a ProxySigner that posts each
 * crypto request back here; we delegate to the real signer and reply.
 */
class LatimerSignaling {
  private worker: Worker | null = null;
  private signer: Signer | null = null;
  // Captured at init time so nos2x re-injecting window.nostr doesn't steal signing
  private capturedNostr: typeof window.nostr | null = null;
  private signerSecretKeyHex: string | null = null;
  private relays: string[] = [];
  private handlers = new Map<string, MethodHandler>();
  private awaitCbs = new Map<string, { resolve: () => void; reject: (e: Error) => void }>();

  async init(relays: string[], customSigner?: Signer, skHex?: string): Promise<string> {
    this.destroy();

    if (customSigner) {
      this.signer = customSigner;
      this.capturedNostr = null;
      this.signerSecretKeyHex = skHex ?? null;
    } else {
      // Capture window.nostr NOW — nos2x may re-inject later and reclaim window.nostr,
      // but our reference to the NostrPass provider object stays valid.
      this.capturedNostr = window.nostr ?? null;
      this.signer = new NIP07Signer();
      this.signerSecretKeyHex = null;
    }
    console.log('[Signaling] init — signer type:', customSigner ? customSigner.constructor.name : 'NIP07Signer', '| capturedNostr:', this.capturedNostr ? 'captured' : 'none', '| skHex:', skHex ? 'provided' : 'none', '| window.nostr:', window.nostr ? 'present' : 'absent');
    this.relays = relays;

    this.worker = new Worker(
      new URL('../workers/signaling.worker.ts', import.meta.url),
      { type: 'module' },
    );

    const initMsg: Record<string, unknown> = { type: 'init', relays };
    if (skHex) initMsg.sk = skHex; // KeySigner runs fully in worker; no proxy needed
    // Restore the NWPC Bloom filter so already-seen events skip decryption this session
    const savedNwpcState = localStorage.getItem(STORAGE_KEYS.nwpcState);
    if (savedNwpcState) initMsg.nwpcState = savedNwpcState;

    // Wire up message handling before posting init so we don't miss 'ready'
    return new Promise<string>((resolve, reject) => {
      this.worker!.onmessage = (e: MessageEvent) => {
        const msg = e.data as Record<string, unknown>;
        if (msg.type === 'ready') {
          // Switch to the normal handler and resolve
          this.worker!.onmessage = (ev) => this._onWorkerMessage(ev.data as Record<string, unknown>);
          resolve(msg.pubkey as string);
        } else if (msg.type === 'error') {
          reject(new Error(msg.message as string));
        } else {
          // Can arrive before 'ready' (e.g. signerRequest during init)
          this._onWorkerMessage(msg);
        }
      };
      this.worker!.postMessage(initMsg);
    });
  }

  onMethod(method: LatimerMethod, handler: MethodHandler): void {
    this.handlers.set(method, handler);
  }

  private _onWorkerMessage(msg: Record<string, unknown>) {
    switch (msg.type) {
      case 'method': {
        const h = this.handlers.get(msg.method as string);
        if (h) h(msg.params as Record<string, unknown>, msg.from as string, msg.timestamp as number);
        break;
      }
      case 'signerRequest':
        void this._proxySignerRequest(msg.id as string, msg.op as string, msg.params as Record<string, unknown>);
        break;
      case 'storageSet':
        // Worker is persisting NWPC state (Bloom filter) — save to localStorage so
        // the next session can restore it and skip re-decrypting historical messages.
        try { localStorage.setItem(msg.key as string, msg.value as string); } catch { /* ignore quota */ }
        break;
      case 'sendAwaitDone':
        this.awaitCbs.get(msg.reqId as string)?.resolve();
        this.awaitCbs.delete(msg.reqId as string);
        break;
      case 'sendAwaitError':
        this.awaitCbs.get(msg.reqId as string)?.reject(new Error(msg.message as string));
        this.awaitCbs.delete(msg.reqId as string);
        break;
    }
  }

  private async _proxySignerRequest(id: string, op: string, params: Record<string, unknown>) {
    if (!this.worker) return;
    const nostr = this.capturedNostr;
    console.log('[Signaling] proxySignerRequest — op:', op, '| capturedNostr:', nostr ? 'yes' : 'none');
    try {
      let result: unknown;
      // Use capturedNostr directly if available — prevents nos2x from intercepting
      // by re-claiming window.nostr after NostrPass installed its provider.
      if (nostr) {
        if (op === 'getPublicKey') result = await nostr.getPublicKey();
        else if (op === 'signEvent') result = await nostr.signEvent(params.event as Parameters<NonNullable<typeof window.nostr>['signEvent']>[0]);
        else if (op === 'nip44.encrypt') result = await (nostr.nip44?.encrypt ?? nostr.nip04.encrypt).call(nostr.nip44 ?? nostr.nip04, params.recipientPubkey as string, params.plaintext as string);
        else if (op === 'nip44.decrypt') result = await (nostr.nip44?.decrypt ?? nostr.nip04.decrypt).call(nostr.nip44 ?? nostr.nip04, params.senderPubkey as string, params.ciphertext as string);
        else if (op === 'sign' && this.signer) result = await this.signer.sign(new Uint8Array(params.message as number[]));
      } else if (this.signer) {
        if (op === 'getPublicKey') result = await this.signer.getPublicKey();
        else if (op === 'sign') result = await this.signer.sign(new Uint8Array(params.message as number[]));
        else if (op === 'signEvent') result = await this.signer.signEvent(params.event as Parameters<Signer['signEvent']>[0]);
        else if (op === 'nip44.encrypt') result = await this.signer.nip44.encrypt(params.recipientPubkey as string, params.plaintext as string);
        else if (op === 'nip44.decrypt') result = await this.signer.nip44.decrypt(params.senderPubkey as string, params.ciphertext as string);
      }
      console.log('[Signaling] proxySignerRequest — op:', op, 'succeeded');
      this.worker.postMessage({ type: 'signerResponse', id, result });
    } catch (err) {
      console.error('[Signaling] proxySignerRequest — op:', op, 'FAILED:', err);
      this.worker.postMessage({ type: 'signerResponse', id, error: String(err) });
    }
  }

  send(to: string, method: LatimerMethod, params: Record<string, unknown>): void {
    if (!this.worker) { console.warn('[Signaling] Not initialized, dropping:', method); return; }
    this.worker.postMessage({ type: 'send', to, method, params });
  }

  async sendAndAwait(to: string, method: LatimerMethod, params: Record<string, unknown>, timeoutMs = 30_000): Promise<void> {
    if (!this.worker) throw new Error('[Signaling] Not initialized');
    const reqId = crypto.randomUUID();
    const promise = new Promise<void>((resolve, reject) => { this.awaitCbs.set(reqId, { resolve, reject }); });
    this.worker.postMessage({ type: 'sendAndAwait', to, method, params, timeoutMs, reqId });
    return promise;
  }

  async signEvent(template: { kind: number; content: string; tags: string[][]; created_at: number }): Promise<{ id: string; pubkey: string; sig: string; kind: number; content: string; tags: string[][]; created_at: number } | null> {
    if (!this.signer) return null;
    try {
      return await this.signer.signEvent(template) as { id: string; pubkey: string; sig: string; kind: number; content: string; tags: string[][]; created_at: number };
    } catch { return null; }
  }

  private isPublishSuccessReason(reason: string): boolean {
    return !reason.startsWith('connection failure:')
      && reason !== 'duplicate url'
      && reason !== 'connection skipped by allowConnectingToRelay';
  }

  private async publishEvent(event: Parameters<SimplePool['publish']>[1], relays: string[]): Promise<void> {
    const pool = new SimplePool();
    try {
      const results = await Promise.allSettled(pool.publish(relays, event));
      const successCount = results.filter((result) =>
        result.status === 'fulfilled' && this.isPublishSuccessReason(result.value),
      ).length;

      if (successCount > 0) return;

      const details = results.map((result) =>
        result.status === 'fulfilled' ? result.value : result.reason instanceof Error ? result.reason.message : String(result.reason),
      ).join('; ');
      throw new Error(`[Signaling] Failed to publish event to any relay${details ? `: ${details}` : ''}`);
    } finally {
      pool.destroy();
    }
  }

  private async encryptLegacyDirectMessage(to: string, content: string): Promise<string> {
    if (this.capturedNostr?.nip04) {
      return this.capturedNostr.nip04.encrypt(to, content);
    }

    const signerWithNip04 = this.signer as (Signer & {
      nip04?: {
        encrypt(pubkey: string, plaintext: string): Promise<string>;
      };
    }) | null;

    if (signerWithNip04?.nip04?.encrypt) {
      return signerWithNip04.nip04.encrypt(to, content);
    }

    if (this.signerSecretKeyHex) {
      return nip04.encrypt(this.signerSecretKeyHex, to, content);
    }

    throw new Error('[Signaling] Legacy kind 4 DM encryption unavailable');
  }

  async sendDirectMessage(to: string, content: string, format: 'kind4' | 'nip17' | 'both' = 'nip17'): Promise<void> {
    if (!this.signer) throw new Error('[Signaling] Not initialized');
    const relays = await resolveUserRelays(to, this.relays);
    if (relays.length === 0) throw new Error('[Signaling] No relays configured');

    if (format === 'both') {
      const errors: string[] = [];

      try {
        await this.sendDirectMessage(to, content, 'kind4');
      } catch (err) {
        errors.push(`kind4: ${err instanceof Error ? err.message : String(err)}`);
      }

      try {
        await this.sendDirectMessage(to, content, 'nip17');
      } catch (err) {
        errors.push(`nip17: ${err instanceof Error ? err.message : String(err)}`);
      }

      if (errors.length === 2) {
        throw new Error(`[Signaling] Direct message failed in both formats: ${errors.join(' | ')}`);
      }

      if (errors.length > 0) {
        console.warn('[Signaling] Direct message partially failed:', errors.join(' | '));
      }
      return;
    }

    if (format === 'kind4') {
      const encrypted = await this.encryptLegacyDirectMessage(to, content);
      const signed = await this.signer.signEvent({
        kind: 4,
        content: encrypted,
        tags: [['p', to]],
        created_at: Math.floor(Date.now() / 1000),
      });
      await this.publishEvent(signed as Parameters<SimplePool['publish']>[1], relays);
      return;
    }

    const ndk = new NDK() as unknown as Parameters<typeof WrapWithSigner>[0];
    const wrapped = await WrapWithSigner(ndk, content, this.signer, to);
    const rawEvent = wrapped.rawEvent() as Parameters<SimplePool['publish']>[1];
    await this.publishEvent(rawEvent, relays);
  }

  destroy(): void {
    if (this.worker) {
      this.worker.postMessage({ type: 'destroy' });
      this.worker.terminate();
      this.worker = null;
    }
    this.signer = null;
    this.capturedNostr = null;
    this.signerSecretKeyHex = null;
    this.relays = [];
    this.handlers.clear();
    this.awaitCbs.clear();
  }
}

export const signalingService = new LatimerSignaling();
