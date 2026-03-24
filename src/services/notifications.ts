export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

export function showIncomingCallNotification(callerName: string, callType: 'audio' | 'video') {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const typeLabel = callType === 'video' ? 'Video' : 'Audio';
  const n = new Notification(`Incoming ${typeLabel} Call`, {
    body: `${callerName} is calling you on Latimer`,
    icon: '/pwa-192x192.png',
    tag: 'latimer-incoming-call',
    requireInteraction: true,
  } as NotificationOptions);

  n.onclick = () => {
    window.focus();
    n.close();
  };
}
