import type { Component } from 'solid-js';
import { Show, Switch, Match, onMount, createEffect, onCleanup, createSignal, batch, createMemo } from 'solid-js';
import { store, setStore, setLoading } from './store';
import Login from './components/Login';
import ActiveCall from './components/ActiveCall';
import IncomingCallModal from './components/IncomingCallModal';
import Home from './pages/Home';
import Settings from './pages/Settings';
import Inbox from './pages/Inbox';
import IncognitoLobby from './pages/IncognitoLobby';
import JoinCall from './pages/JoinCall';
import ViewProfile from './pages/ViewProfile';
import { signalingService } from './services/signaling';
import { webrtcService } from './services/webrtc';
import { loadContacts, loadProfile } from './services/nostr';
import { createEphemeralSession, clearEphemeralSession, parseJoinUrl, parseProfileUrl } from './services/ephemeral';
import { LATIMER_METHODS, STORAGE_KEYS, DEFAULT_RELAYS } from './constants';
import type { CallRecord, IncomingCallInfo, LatimerStore } from './types';

// Dismiss the splash screen
function dismissSplash() {
  const splash = document.getElementById('splash');
  if (splash) {
    splash.classList.add('fade-out');
    setTimeout(() => {
      splash.style.display = 'none';
    }, 450);
  }
}

const App: Component = () => {
  let durationTimer: ReturnType<typeof setInterval> | null = null;

  const [localStream, setLocalStream] = createSignal<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = createSignal<MediaStream>(new MediaStream());

  // Overlay stays mounted while loading OR while fading out, so Home renders first
  const [overlayVisible, setOverlayVisible] = createSignal(true);
  createEffect(() => {
    if (store.loading) {
      setOverlayVisible(true);
    } else {
      // Let the fade-out transition (300ms) play, then unmount
      setTimeout(() => setOverlayVisible(false), 320);
    }
  });
  const overlayOpacity = createMemo(() => (store.loading ? '1' : '0'));

  const startDurationTimer = () => {
    if (durationTimer) clearInterval(durationTimer);
    setStore('callDuration', 0);
    durationTimer = setInterval(() => {
      setStore('callDuration', store.callDuration + 1);
    }, 1_000);
  };

  const stopDurationTimer = () => {
    if (durationTimer) {
      clearInterval(durationTimer);
      durationTimer = null;
    }
  };

  // Watch call state changes for timer
  createEffect(() => {
    if (store.callState === 'connected') {
      startDurationTimer();
    } else if (store.callState === 'ended' || store.callState === 'idle') {
      stopDurationTimer();
    }
  });

  onCleanup(() => {
    stopDurationTimer();
    signalingService.destroy();
    webrtcService.cleanup();
  });

  const logCall = (
    record: Omit<CallRecord, 'seen'>
  ) => {
    const entry: CallRecord = { ...record, seen: false };
    setStore('recentCalls', (prev) => {
      const deduped = prev.filter((c) => c.id !== entry.id);
      const updated = [entry, ...deduped].slice(0, 100);
      try { localStorage.setItem(STORAGE_KEYS.recentCalls, JSON.stringify(updated)); } catch { /* ignore */ }
      return updated;
    });
  };

  const endCall = async () => {
    const contact = store.activeCallContact;
    const callId = store.activeCallId;
    const duration = store.callDuration;
    const callType = store.activeCallType;

    if (contact && callId) {
      signalingService.send(contact.pubkey, LATIMER_METHODS.CALL_END, { callId });
    }

    if (contact && callId && store.callState === 'connected') {
      logCall({
        id: callId,
        contact,
        direction: 'outgoing',
        status: 'completed',
        callType,
        startedAt: Date.now() - duration * 1000,
        duration,
      });
    }

    stopDurationTimer();
    webrtcService.cleanup();
    setLocalStream(null);
    setRemoteStream(new MediaStream());

    if (store.incognito) {
      // End incognito session entirely — go back to login
      clearEphemeralSession();
      signalingService.destroy();
      setStore({
        loggedIn: false,
        incognito: false,
        pubkey: '',
        callState: 'idle',
        activeCallContact: null,
        activeCallId: null,
        callDuration: 0,
        audioEnabled: true,
        videoEnabled: true,
        contacts: [],
        recentCalls: [],
      });
    } else {
      setStore({
        callState: 'idle',
        activeCallContact: null,
        activeCallId: null,
        callDuration: 0,
        audioEnabled: true,
        videoEnabled: true,
      });
    }
  };

  const acceptCall = async () => {
    const incoming = store.incomingCall;
    if (!incoming) return;

    setStore({
      callState: 'ringing',
      activeCallId: incoming.callId,
      activeCallContact: incoming.contact ?? { pubkey: incoming.from },
      activeCallType: incoming.callType,
      incomingCall: null,
    });

    // Set up ICE candidate handler
    webrtcService.onIceCandidate = (candidate) => {
      void signalingService.send(incoming.from, LATIMER_METHODS.ICE_CANDIDATE, {
        callId: incoming.callId,
        candidate,
      });
    };

    webrtcService.onConnectionState = (state) => {
      if (state === 'connected') {
        setStore('callState', 'connected');
      } else if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        setStore('callState', state === 'failed' ? 'failed' : 'ended');
      }
    };

    webrtcService.onLocalStream = (stream) => {
      setLocalStream(stream);
    };

    webrtcService.onRemoteTrack = (stream) => {
      setRemoteStream(stream);
    };

    try {
      const answer = await webrtcService.createAnswer(
        incoming.offer,
        incoming.callType === 'video'
      );

      await signalingService.sendAndAwait(incoming.from, LATIMER_METHODS.CALL_ANSWER, {
        callId: incoming.callId,
        answer,
      });
    } catch (err) {
      console.error('[App] Failed to accept call:', err);
      setStore({ callState: 'failed', activeCallContact: null, activeCallId: null });
      webrtcService.cleanup();
    }
  };

  const rejectCall = async () => {
    const incoming = store.incomingCall;
    if (!incoming) return;

    signalingService.send(incoming.from, LATIMER_METHODS.CALL_REJECT, {
      callId: incoming.callId,
    });

    logCall({
      id: incoming.callId,
      contact: incoming.contact ?? { pubkey: incoming.from },
      direction: 'incoming',
      status: 'rejected',
      callType: incoming.callType,
      startedAt: incoming.timestamp,
    });

    setStore({ incomingCall: null });
  };

  const handleToggleAudio = () => {
    const enabled = webrtcService.toggleAudio();
    setStore('audioEnabled', enabled);
  };

  const handleToggleVideo = () => {
    const enabled = webrtcService.toggleVideo();
    setStore('videoEnabled', enabled);
  };

  const handleToggleSpeaker = () => {
    // Speaker toggling is a browser limitation; log intent
    console.debug('[App] Speaker toggle requested');
  };

  // Look up a Nostr profile for callers not already in contacts.
  // Updates incomingCall and any matching recentCalls entries reactively.
  const enrichUnknownCaller = (pubkey: string) => {
    if (store.contacts.some((c) => c.pubkey === pubkey)) return;
    loadProfile(pubkey, store.relays)
      .then((profile) => {
        if (!profile.name && !profile.displayName) return; // nothing to enrich
        // Update modal if still showing
        if (store.incomingCall?.from === pubkey) {
          setStore('incomingCall', 'contact', profile);
        }
        // Update call log entries that only have the raw pubkey
        setStore('recentCalls', (calls) =>
          calls.map((c) =>
            c.contact.pubkey === pubkey && !c.contact.name && !c.contact.displayName
              ? { ...c, contact: profile }
              : c
          )
        );
        // Persist enriched call log
        try {
          localStorage.setItem(
            STORAGE_KEYS.recentCalls,
            JSON.stringify(store.recentCalls)
          );
        } catch { /* ignore */ }
      })
      .catch(() => { /* ignore */ });
  };

  const initSignaling = async (relays: string[], customSigner?: Parameters<typeof signalingService.init>[1], skHex?: string) => {
    try {
      await signalingService.init(relays, customSigner, skHex);

      const LIVE_CALL_WINDOW_MS = 60_000; // offers older than 60s are missed calls

      // Register handlers — params is the already-parsed payload
      signalingService.onMethod(LATIMER_METHODS.CALL_OFFER, (params, fromPubkey, timestamp) => {
        const age = Date.now() - timestamp;

        // Stale offer — we were offline. Log as missed call and ACK without ringing.
        if (age > LIVE_CALL_WINDOW_MS) {
          const callId = params['callId'] as string;
          if (!store.recentCalls.some((c) => c.id === callId)) {
            const knownContact = store.contacts.find((c) => c.pubkey === fromPubkey);
            logCall({
              id: callId,
              contact: knownContact ?? { pubkey: fromPubkey },
              direction: 'incoming',
              status: 'missed',
              callType: (params['callType'] as 'audio' | 'video') ?? 'video',
              startedAt: timestamp,
            });
            if (!knownContact) enrichUnknownCaller(fromPubkey);
          }
          return;
        }

        // Don't accept if already in a call
        if (store.callState !== 'idle') {
          signalingService.send(fromPubkey, LATIMER_METHODS.CALL_BUSY, {
            callId: params['callId'],
          });
          return;
        }

        const knownContact = store.contacts.find((c) => c.pubkey === fromPubkey);
        const incoming: IncomingCallInfo = {
          callId: params['callId'] as string,
          from: fromPubkey,
          contact: knownContact,
          offer: params['offer'] as RTCSessionDescriptionInit,
          callType: (params['callType'] as 'audio' | 'video') ?? 'video',
          timestamp,
        };

        setStore('incomingCall', incoming);
        if (!knownContact) enrichUnknownCaller(fromPubkey);
      });

      signalingService.onMethod(LATIMER_METHODS.CALL_ANSWER, (params) => {
        const answer = params['answer'] as RTCSessionDescriptionInit;
        void webrtcService.setRemoteAnswer(answer).catch((err) => {
          console.error('[App] Failed to set remote answer:', err);
        });
      });

      signalingService.onMethod(LATIMER_METHODS.ICE_CANDIDATE, (params) => {
        const candidate = params['candidate'] as RTCIceCandidateInit;
        void webrtcService.addIceCandidate(candidate).catch((err) => {
          console.warn('[App] Failed to add ICE candidate:', err);
        });
      });

      signalingService.onMethod(LATIMER_METHODS.CALL_END, () => {
        const contact = store.activeCallContact;
        const callId = store.activeCallId;
        const duration = store.callDuration;
        const callType = store.activeCallType;
        if (contact && callId) {
          logCall({
            id: callId,
            contact,
            direction: 'incoming',
            status: 'completed',
            callType,
            startedAt: Date.now() - duration * 1000,
            duration,
          });
        }
        stopDurationTimer();
        webrtcService.cleanup();
        batch(() => {
          setStore({ callState: 'ended', callDuration: 0 });
          setLocalStream(null);
          setRemoteStream(new MediaStream());
        });
        setTimeout(() => setStore({ callState: 'idle', activeCallContact: null, activeCallId: null }), 2_500);
      });

      signalingService.onMethod(LATIMER_METHODS.CALL_REJECT, () => {
        const contact = store.activeCallContact;
        const callId = store.activeCallId;
        const callType = store.activeCallType;
        if (contact && callId) {
          logCall({ id: callId, contact, direction: 'outgoing', status: 'rejected', callType, startedAt: Date.now() });
        }
        stopDurationTimer();
        webrtcService.cleanup();
        batch(() => {
          setStore({ callState: 'rejected' });
          setLocalStream(null);
          setRemoteStream(new MediaStream());
        });
        setTimeout(() => setStore({ callState: 'idle', activeCallContact: null, activeCallId: null }), 2_500);
      });

      signalingService.onMethod(LATIMER_METHODS.CALL_BUSY, () => {
        const contact = store.activeCallContact;
        const callId = store.activeCallId;
        const callType = store.activeCallType;
        if (contact && callId) {
          logCall({ id: callId, contact, direction: 'outgoing', status: 'busy', callType, startedAt: Date.now() });
        }
        stopDurationTimer();
        webrtcService.cleanup();
        batch(() => {
          setStore({ callState: 'busy' });
          setLocalStream(null);
          setRemoteStream(new MediaStream());
        });
        setTimeout(() => setStore({ callState: 'idle', activeCallContact: null, activeCallId: null }), 2_500);
      });
    } catch (err) {
      console.error('[App] Failed to initialize signaling:', err);
    }
  };

  const saveContacts = (contacts: typeof store.contacts) => {
    try {
      localStorage.setItem(STORAGE_KEYS.contacts, JSON.stringify(contacts));
    } catch {
      // ignore quota errors
    }
  };

  const initLogin = async (
    pubkey: string,
    relays: string[],
    opts?: { signer?: Parameters<typeof signalingService.init>[1]; skHex?: string; skipContactLoad?: boolean; view?: LatimerStore['view'] }
  ) => {
    // Incognito = has a custom signer AND skipContactLoad (ephemeral key, no persistent identity)
    const isIncognito = !!opts?.signer && !!opts?.skipContactLoad && opts?.view === 'incognitoLobby';

    // Restore cached contacts + call log (skip for incognito — no persistent identity)
    if (!isIncognito) {
      try {
        const cachedContacts = localStorage.getItem(STORAGE_KEYS.contacts);
        const cachedMissed = localStorage.getItem(STORAGE_KEYS.recentCalls);
        setStore({
          loggedIn: true,
          pubkey,
          relays,
          incognito: false,
          view: opts?.view ?? 'home',
          contacts: cachedContacts ? (JSON.parse(cachedContacts) as typeof store.contacts) : [],
          contactsLoaded: !!cachedContacts,
          recentCalls: cachedMissed ? (JSON.parse(cachedMissed) as typeof store.recentCalls) : [],
        });
      } catch {
        setStore({ loggedIn: true, pubkey, relays });
      }
    } else {
      setStore({ loggedIn: true, pubkey, relays, incognito: true, view: opts?.view ?? 'incognitoLobby', contactsLoaded: true });
    }

    await initSignaling(relays, opts?.signer, opts?.skHex);

    // Dismiss the splash/loading overlay as soon as signaling is ready — ContactList
    // skeleton cards handle the contacts-loading state without blocking the whole app.
    setLoading(false);

    // Set up WebRTC stream callbacks
    webrtcService.onLocalStream = (stream) => {
      setLocalStream(stream);
    };
    webrtcService.onRemoteTrack = (stream) => {
      setRemoteStream(stream);
    };

    if (!isIncognito && !opts?.skipContactLoad) {
      // Fetch own profile and contacts in background
      void loadProfile(pubkey, relays).then((profile) => {
        setStore('ownProfile', profile);
      });
      void loadContacts(pubkey, relays)
        .then((contacts) => {
          if (contacts.length > 0) {
            setStore({ contacts, contactsLoaded: true });
            saveContacts(contacts);
          } else {
            setStore('contactsLoaded', true);
          }
        })
        .catch((err) => {
          console.error('[App] Failed to load contacts:', err);
          setStore('contactsLoaded', true);
        });
    }
  };

  const handleLogin = (pubkey: string, relays: string[]) => {
    void initLogin(pubkey, relays);
  };

  const handleLoginWithSigner = (pubkey: string, relays: string[], signer: Parameters<typeof signalingService.init>[1], skHex?: string) => {
    void initLogin(pubkey, relays, { signer, skHex, skipContactLoad: false });
  };

  const handleIncognito = () => {
    const session = createEphemeralSession();
    const relays = store.relays.length > 0 ? store.relays : DEFAULT_RELAYS;
    void initLogin(session.pubkey, relays, { signer: session.signer, skHex: session.skHex, skipContactLoad: true });
  };

  // Called from JoinCall page — joiner uses an ephemeral key and auto-calls the host
  const handleJoinIncognito = () => {
    const invite = store.joinInvite;
    if (!invite) return;
    const session = createEphemeralSession();
    const relays = invite.relays.length > 0 ? invite.relays : DEFAULT_RELAYS;
    void initLogin(session.pubkey, relays, {
      signer: session.signer,
      skHex: session.skHex,
      skipContactLoad: true,
      view: 'home',
    }).then(() => {
      // Auto-initiate call to the host after signaling is ready
      // Small delay to let relay subscriptions settle
      setTimeout(() => {
        setStore({
          callState: 'calling',
          activeCallContact: { pubkey: invite.pubkey },
          activeCallId: crypto.randomUUID(),
          activeCallType: invite.callType,
          joinInvite: null,
        });
        const callId = store.activeCallId!;
        webrtcService.onIceCandidate = (candidate) => {
          void signalingService.send(invite.pubkey, LATIMER_METHODS.ICE_CANDIDATE, { callId, candidate });
        };
        webrtcService.onConnectionState = (state) => {
          if (state === 'connected') {
            setStore('callState', 'connected');
          } else if (state === 'disconnected' || state === 'failed' || state === 'closed') {
            setStore('callState', state === 'failed' ? 'failed' : 'ended');
          }
        };
        const videoEnabled = invite.callType === 'video';
        void webrtcService.createOffer(videoEnabled).then((offer) => {
          return signalingService.sendAndAwait(invite.pubkey, LATIMER_METHODS.CALL_OFFER, {
            callId,
            offer,
            callType: invite.callType,
          });
        }).catch((err: unknown) => {
          console.error('[App] Join call failed:', err);
          setStore({ callState: 'failed', activeCallContact: null, activeCallId: null });
          webrtcService.cleanup();
        });
      }, 1_500);
    });
  };

  // Join with real Nostr key — just show login, then auto-call after login
  const handleJoinWithKey = () => {
    // Store invite so after login we can auto-call
    // Login component's onLogin will fire, then we detect joinInvite
    setStore('joinInvite', store.joinInvite); // keep invite, clear loggedIn to show login
  };

  onMount(async () => {
    // Check for invite link — parse before doing anything else
    const joinInvite = parseJoinUrl();
    if (joinInvite) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
      setStore('joinInvite', joinInvite);
      setLoading(false);
      dismissSplash();
      handleJoinIncognito();
      return;
    }

    // Check for profile link (#user?npub=...)
    const profilePubkey = parseProfileUrl();
    if (profilePubkey) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
      setStore('viewProfilePubkey', profilePubkey);
      // Don't return — still try auto-login so they can call from the profile view
    }

    // Try auto-login from saved credentials — keep splash up until we know the result
    const savedPubkey = localStorage.getItem(STORAGE_KEYS.pubkey);
    const loginMethod = localStorage.getItem(STORAGE_KEYS.loginMethod);
    console.log('[App] onMount — savedPubkey:', savedPubkey ? `${savedPubkey.slice(0, 8)}…` : 'none', '| loginMethod:', loginMethod, '| window.nostr:', window.nostr ? 'present' : 'absent');
    const savedRelays = (() => {
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.relays);
        return raw ? (JSON.parse(raw) as string[]) : DEFAULT_RELAYS;
      } catch {
        return DEFAULT_RELAYS;
      }
    })();

    // For NostrPass logins, skip window.nostr — nos2x may answer first and get bound
    // as the signer. Let the Login component mount and NostrPass fire its status event.
    if (savedPubkey && loginMethod !== 'nostrpass') {
      const nostr = window.nostr;
      console.log('[App] Attempting extension auto-login. window.nostr:', nostr ? 'present' : 'absent');
      if (nostr) {
        try {
          const pk = await nostr.getPublicKey();
          console.log('[App] Extension pubkey:', pk ? `${pk.slice(0, 8)}…` : 'none', '| matches saved:', pk === savedPubkey);
          if (pk === savedPubkey) {
            await initLogin(savedPubkey, savedRelays);
            dismissSplash();
            return;
          }
        } catch (err) {
          console.warn('[App] Extension getPublicKey failed:', err);
        }
      }
    } else if (loginMethod === 'nostrpass') {
      console.log('[App] NostrPass login method — skipping window.nostr auto-login, showing Login screen');
    }

    // No auto-login (or nostrpass user) — show login screen; NostrPass will auto-login
    setLoading(false);
    dismissSplash();
  });

  const activeCallContact = () => store.activeCallContact;
  const incomingCall = () => store.incomingCall;

  return (
    <div style={{ background: 'var(--color-bg)', height: '100%' }}>
      {/* Loading overlay — fades out so Home renders underneath before it disappears */}
      <Show when={overlayVisible()}>
        <div
          class="fixed inset-0 z-[9998] flex flex-col items-center justify-center gap-6"
          style={{
            background: 'var(--color-bg)',
            opacity: overlayOpacity(),
            transition: 'opacity 0.3s ease',
            'pointer-events': store.loading ? 'auto' : 'none',
          }}
        >
          <img src="/latimer-logo-face.svg" alt="Latimer" width="80" height="80" style={{ 'border-radius': '18px' }} />
          <div class="splash-spinner" />
        </div>
      </Show>

      {/* Invite join screen — shown before login when URL had #join */}
      <Show when={!store.loggedIn && store.joinInvite !== null}>
        <JoinCall
          invite={store.joinInvite!}
          onJoinIncognito={handleJoinIncognito}
          onJoinWithKey={handleJoinWithKey}
        />
      </Show>

      {/* Profile view when not logged in */}
      <Show when={!store.loggedIn && store.viewProfilePubkey !== null && store.joinInvite === null}>
        <ViewProfile
          pubkey={store.viewProfilePubkey!}
          onClose={() => setStore('viewProfilePubkey', null)}
        />
      </Show>

      {/* Normal login */}
      <Show when={!store.loggedIn && store.joinInvite === null && store.viewProfilePubkey === null}>
        <Login onLogin={handleLogin} onLoginWithSigner={handleLoginWithSigner} onIncognito={handleIncognito} />
      </Show>

      <Show when={store.loggedIn}>
        {/* Active call fullscreen overlay */}
        <Show when={store.callState !== 'idle'}>
          <Show when={activeCallContact() !== null}>
            <ActiveCall
              contact={activeCallContact()!}
              callState={store.callState}
              callDuration={store.callDuration}
              localStream={localStream()}
              remoteStream={remoteStream()}
              onEndCall={endCall}
              onToggleAudio={handleToggleAudio}
              onToggleVideo={handleToggleVideo}
              onToggleSpeaker={handleToggleSpeaker}
            />
          </Show>
        </Show>

        {/* Normal UI when idle */}
        <Show when={store.callState === 'idle'}>
          <Switch>
            <Match when={store.view === 'home'}>
              <Home />
            </Match>
            <Match when={store.view === 'settings'}>
              <Settings />
            </Match>
            <Match when={store.view === 'inbox'}>
              <Inbox />
            </Match>
            <Match when={store.view === 'incognitoLobby'}>
              <IncognitoLobby onCancel={() => setStore({ loggedIn: false, incognito: false, view: 'home' })} />
            </Match>
          </Switch>
        </Show>

        {/* View profile overlay */}
        <Show when={store.viewProfilePubkey !== null}>
          <div class="fixed inset-0 z-50" style={{ background: 'var(--color-bg)' }}>
            <ViewProfile
              pubkey={store.viewProfilePubkey!}
              onClose={() => setStore('viewProfilePubkey', null)}
              onCall={(contact) => {
                setStore('viewProfilePubkey', null);
                // Navigate to home so they can initiate the call
                setStore('view', 'home');
              }}
            />
          </div>
        </Show>

        {/* Incoming call modal overlays everything */}
        <Show when={incomingCall() !== null}>
          <IncomingCallModal
            call={incomingCall()!}
            contact={incomingCall()?.contact}
            onAccept={acceptCall}
            onReject={rejectCall}
          />
        </Show>
      </Show>
    </div>
  );
};

export default App;
