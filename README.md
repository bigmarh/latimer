# Latimer

**FaceTime for Nostr** — end-to-end encrypted video and audio calls using WebRTC and the Nostr protocol.

[![License: MIT](https://img.shields.io/badge/License-MIT-purple.svg)](LICENSE)

## Features

- 🎥 **Video & audio calls** — browser-native WebRTC, no plugins
- 🔐 **End-to-end encrypted signaling** — call setup messages are gift-wrapped NIP-17 DMs
- 🕵️ **Incognito mode** — throwaway keypairs, share an invite link, no account needed
- 🔑 **Flexible login** — NostrPass Lite, NIP-07 browser extension (Alby, nos2x), or nsec
- 📇 **Nostr contacts** — loads your follow list automatically
- 🌐 **PWA** — installable on mobile, works offline

## Tech stack

| Layer | Library |
|---|---|
| UI | [SolidJS](https://solidjs.com) + [Tailwind CSS v4](https://tailwindcss.com) |
| Nostr transport | [TAT Protocol NWPC](https://github.com/bigmarh/tat-protocol) (JSON-RPC over NIP-17) |
| Crypto | [@noble/curves](https://github.com/paulmillr/noble-curves), [nostr-tools](https://github.com/nbd-wtf/nostr-tools) |
| Auth | [NostrPass Lite](https://nostrpass.com) (CDN) · NIP-07 extensions · nsec |
| Build | [Vite](https://vitejs.dev) + vite-plugin-solid |

## Getting started

```bash
# Install dependencies
pnpm install   # or npm install

# Start dev server (HTTPS required for camera/mic)
pnpm dev

# Production build
pnpm build
```

> **Note:** The dev server runs on `https://localhost:5173` (self-signed cert via `@vitejs/plugin-basic-ssl`). Accept the cert warning in your browser.

## Login options

| Method | How it works |
|---|---|
| **NostrPass Lite** | Loaded from CDN — managed keypair, Google/email account recovery |
| **NIP-07 extension** | Alby, nos2x, or any `window.nostr`-compatible extension |
| **nsec** | Paste your private key — never persisted, session only |
| **Incognito** | Auto-generated throwaway keypair — share an invite link to call |

## Architecture

Call signaling runs entirely off the main thread via a **Web Worker**:

```
Main thread                    Worker
────────────────               ──────────────────────────────
signalingService.send()  →     NWPCPeer.request()
                         ←     method event (offer/answer/ICE)
signer.nip44.decrypt()   ←     ProxySigner (for NIP-07)
                               KeySigner (incognito/nsec — no proxy)
```

Relay backlog decryption (60+ messages on reconnect) no longer blocks UI.

## Signaling methods

| Method | Direction | Payload |
|---|---|---|
| `latimer.call_offer` | caller → callee | SDP offer, call ID, call type |
| `latimer.call_answer` | callee → caller | SDP answer |
| `latimer.ice_candidate` | both | ICE candidate |
| `latimer.call_end` | either | — |
| `latimer.call_reject` | callee → caller | — |
| `latimer.call_busy` | callee → caller | — |

## Relay configuration

Default relays are set in `src/constants.ts`. Users can override them in Settings.

## Contributing

PRs welcome! See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT — see [LICENSE](LICENSE).
