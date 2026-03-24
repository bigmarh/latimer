# Contributing to Latimer

Thanks for your interest! Here's how to get set up.

## Prerequisites

- Node.js 20+
- pnpm 9+ (or npm/yarn)
- A browser with camera/microphone access

## Setup

```bash
git clone https://github.com/your-org/latimer.git
cd latimer
pnpm install
pnpm dev
```

Open `https://localhost:5173` (accept the self-signed cert — required for WebRTC).

## Project structure

```
src/
  components/     # Reusable UI components (Header, Login, ActiveCall…)
  pages/          # Full-screen views (Home, Settings, Inbox, IncognitoLobby…)
  services/       # Business logic (signaling, webrtc, nostr, ephemeral)
  workers/        # Web Worker (signaling runs off main thread)
  store.ts        # SolidJS reactive store
  types.ts        # Shared TypeScript types
  constants.ts    # Default relays, storage keys, NWPC method names
public/           # Static assets (icons, PWA manifest)
```

## Key concepts

- **Signaling** runs in a Web Worker (`src/workers/signaling.worker.ts`). Don't put DOM or SolidJS code there.
- **WebRTC** stays on the main thread — `getUserMedia`, `RTCPeerConnection`, `srcObject` all need it.
- **SolidJS reactivity**: use `createSignal` / `createStore` for reactive state. Avoid plain `let` for anything rendered.
- **No localStorage for keys** — nsec is never persisted. Ephemeral keys use `sessionStorage` only.

## Pull requests

1. Fork and branch from `main`
2. `pnpm build` must pass before opening a PR
3. Keep PRs focused — one feature or fix per PR
4. Update the README if you add a new login method or signaling message type
