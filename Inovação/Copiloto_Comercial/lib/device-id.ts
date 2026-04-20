export function getAnonymousDeviceId() {
  const key = 'chatkit_anonymous_device_id';
  const existing = typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
  if (existing) return existing;

  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `anon_${Math.random().toString(36).slice(2)}_${Date.now()}`;

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(key, id);
  }
  return id;
}
