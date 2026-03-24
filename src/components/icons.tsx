import type { Component, JSX } from 'solid-js';

interface IconProps {
  size?: number;
  class?: string;
  style?: string | Record<string, string>;
}

const svg = (paths: string): Component<IconProps> => {
  const Icon: Component<IconProps> = (props): JSX.Element => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={props.size ?? 20}
      height={props.size ?? 20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={props.class}
      innerHTML={paths}
    />
  );
  return Icon;
};

export const PhoneIcon = svg(
  `<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 3 9.72a19.79 19.79 0 0 1-3-8.59A2 2 0 0 1 2.18 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L6.91 8.96a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>`
);

export const VideoIcon = svg(
  `<polygon points="23 7 16 12 23 17 23 7"/>
   <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>`
);

export const MicIcon = svg(
  `<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
   <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
   <line x1="12" x2="12" y1="19" y2="23"/>
   <line x1="8" x2="16" y1="23" y2="23"/>`
);

export const MicOffIcon = svg(
  `<line x1="1" x2="23" y1="1" y2="23"/>
   <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
   <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/>
   <line x1="12" x2="12" y1="19" y2="23"/>
   <line x1="8" x2="16" y1="23" y2="23"/>`
);

export const VideoOffIcon = svg(
  `<path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10"/>
   <line x1="1" x2="23" y1="1" y2="23"/>`
);

export const PhoneOffIcon = svg(
  `<path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.42 19.42 0 0 1 3.07 9.53a19.79 19.79 0 0 1-3-8.63A2 2 0 0 1 2 .82h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L6.18 8.73a16 16 0 0 0 2.59 3.41z"/>
   <line x1="23" x2="1" y1="1" y2="23"/>`
);

export const SettingsIcon = svg(
  `<circle cx="12" cy="12" r="3"/>
   <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>`
);

export const SearchIcon = svg(
  `<circle cx="11" cy="11" r="8"/>
   <line x1="21" x2="16.65" y1="21" y2="16.65"/>`
);

export const UserIcon = svg(
  `<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
   <circle cx="12" cy="7" r="4"/>`
);

export const UsersIcon = svg(
  `<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
   <circle cx="9" cy="7" r="4"/>
   <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
   <path d="M16 3.13a4 4 0 0 1 0 7.75"/>`
);

export const ChevronLeftIcon = svg(
  `<polyline points="15 18 9 12 15 6"/>`
);

export const SpeakerIcon = svg(
  `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
   <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
   <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>`
);

export const SpeakerOffIcon = svg(
  `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
   <line x1="23" x2="17" y1="9" y2="15"/>
   <line x1="17" x2="23" y1="9" y2="15"/>`
);

export const ClockIcon = svg(
  `<circle cx="12" cy="12" r="10"/>
   <polyline points="12 6 12 12 16 14"/>`
);

export const PlusIcon = svg(
  `<line x1="12" x2="12" y1="5" y2="19"/>
   <line x1="5" x2="19" y1="12" y2="12"/>`
);

export const XIcon = svg(
  `<path d="M18 6 6 18M6 6l12 12"/>`
);

export const CopyIcon = svg(
  `<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
   <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>`
);

export const LinkIcon = svg(
  `<path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11 4"/>
   <path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07L13 19"/>`
);

export const StarIcon = svg(
  `<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>`
);

export const FlipCameraIcon = svg(
  `<path d="M20 7h-3.5l-1.5-2h-6L7.5 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"/>
   <path d="M12 10v4l2-2m-4 0 2 2"/>
   <circle cx="12" cy="13" r="3"/>`
);

export const QrCodeIcon = svg(
  `<rect x="3" y="3" width="7" height="7" rx="1"/>
   <rect x="14" y="3" width="7" height="7" rx="1"/>
   <rect x="3" y="14" width="7" height="7" rx="1"/>
   <rect x="5" y="5" width="3" height="3"/>
   <rect x="16" y="5" width="3" height="3"/>
   <rect x="5" y="16" width="3" height="3"/>
   <path d="M14 14h3v3h-3zM17 17h3v3h-3zM14 20h3"/>`
);
