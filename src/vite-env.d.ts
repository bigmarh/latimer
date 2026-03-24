/// <reference types="vite/client" />

// Stub module declaration for nostrpass (resolved via vite alias at runtime)
declare module '@nostrpass/lite-embassy' {
  export interface LiteEmbassyStatus {
    kind: string;
    timestamp: number;
    auth: object;
    detail?: Record<string, unknown>;
  }

  export interface NostrPassLiteEmbassy {
    getAuthState(): { isAuthenticated: boolean; isLocked: boolean };
    installNostrProvider(opts?: { overrideExisting?: boolean }): void;
    createNostrPassLiteButton(opts: {
      appendTo: HTMLElement;
      labelSignedOut?: string;
      labelLocked?: string;
      labelSignedIn?: string;
    }): { destroy(): void };
    unlock(opts: { pin: string }): Promise<void>;
    logout(): Promise<void>;
  }

  type LitePermissionOperation =
    | 'getPublicKey' | 'signEvent' | 'signData'
    | 'nip04.encrypt' | 'nip04.decrypt'
    | 'nip44.encrypt' | 'nip44.decrypt';

  type LitePermissionLevel = 'ALLOW' | 'ASK_PER_SESSION' | 'ASK_EVERYTIME' | 'DENY';

  export function initNostrPassLite(config?: {
    appName?: string;
    namespace?: string;
    relays?: string[];
    storagePrefix?: string;
    vaultUrl?: string;
    installProviderOnInit?: boolean;
    overrideExistingProvider?: boolean;
    permissionSessionMinutes?: number;
    permissionDefaults?: Partial<Record<LitePermissionOperation, LitePermissionLevel>>;
  }): Promise<NostrPassLiteEmbassy>;
}
