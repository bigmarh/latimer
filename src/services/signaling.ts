import { NIP07Signer } from '@tat-protocol/signers';
import type { Signer } from '@tat-protocol/types';
import { WrapWithSigner } from '@tat-protocol/utils';
import NDK from '@nostr-dev-kit/ndk';
import { SimplePool } from 'nostr-tools';
import type { LatimerMethod } from '../types';

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
  private relays: string[] = [];
  private handlers = new Map<string, MethodHandler>();
  private awaitCbs = new Map<string, { resolve: () => void; reject: (e: Error) => void }>();

  async init(relays: string[], customSigner?: Signer, skHex?: string): Promise<string> {
    this.destroy();

    this.signer = customSigner ?? new NIP07Signer();
    this.relays = relays;

    this.worker = new Worker(
      new URL('../workers/signaling.worker.ts', import.meta.url),
      { type: 'module' },
    );

    const initMsg: Record<string, unknown> = { type: 'init', relays };
    if (skHex) initMsg.sk = skHex; // KeySigner runs fully in worker; no proxy needed

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
    if (!this.signer || !this.worker) return;
    try {
      let result: unknown;
      if (op === 'getPublicKey') result = await this.signer.getPublicKey();
      else if (op === 'sign') result = await this.signer.sign(new Uint8Array(params.message as number[]));
      else if (op === 'signEvent') result = await this.signer.signEvent(params.event as Parameters<Signer['signEvent']>[0]);
      else if (op === 'nip44.encrypt') result = await this.signer.nip44.encrypt(params.recipientPubkey as string, params.plaintext as string);
      else if (op === 'nip44.decrypt') result = await this.signer.nip44.decrypt(params.senderPubkey as string, params.ciphertext as string);
      this.worker.postMessage({ type: 'signerResponse', id, result });
    } catch (err) {
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

  async sendDirectMessage(to: string, content: string): Promise<void> {
    if (!this.signer) throw new Error('[Signaling] Not initialized');
    const relays = this.relays;
    if (relays.length === 0) throw new Error('[Signaling] No relays configured');
    const ndk = new NDK() as unknown as Parameters<typeof WrapWithSigner>[0];
    const wrapped = await WrapWithSigner(ndk, content, this.signer, to);
    const rawEvent = wrapped.rawEvent() as Parameters<SimplePool['publish']>[1];
    const pool = new SimplePool();
    await Promise.allSettled(pool.publish(relays, rawEvent));
  }

  destroy(): void {
    if (this.worker) {
      this.worker.postMessage({ type: 'destroy' });
      this.worker.terminate();
      this.worker = null;
    }
    this.signer = null;
    this.relays = [];
    this.handlers.clear();
    this.awaitCbs.clear();
  }
}

export const signalingService = new LatimerSignaling();
