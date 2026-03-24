import { createStore } from 'solid-js/store';
import type { LatimerStore } from './types';
import { DEFAULT_RELAYS } from './constants';

const [store, setStore] = createStore<LatimerStore>({
  loggedIn: false,
  pubkey: '',
  ownProfile: null,
  relays: DEFAULT_RELAYS,
  loading: false,
  loadingMessage: '',
  error: null,
  contacts: [],
  contactsLoaded: false,
  searchQuery: '',
  callState: 'idle',
  activeCallId: null,
  activeCallContact: null,
  activeCallType: 'video',
  incomingCall: null,
  callDuration: 0,
  audioEnabled: true,
  videoEnabled: true,
  view: 'home',
  recentCalls: [],
  incognito: false,
  joinedViaLink: false,
  joinInvite: null,
  viewProfilePubkey: null,
});

export { store, setStore };

export const setView = (v: LatimerStore['view']) => setStore('view', v);
export const setLoading = (loading: boolean, message = '') =>
  setStore({ loading, loadingMessage: message });
export const setError = (error: string | null) => setStore('error', error);
