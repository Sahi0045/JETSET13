/**
 * Reports what a visitor does to JetCRM, our own customer record.
 *
 * Off unless VITE_CRM_ENDPOINT and VITE_CRM_WEB_KEY are set. Nothing here may
 * ever break or slow a booking: every call is wrapped, sends are batched in
 * the background, and a failed send is dropped. Never pass card, passport or
 * date-of-birth details; the CRM also strips them.
 */
const ENDPOINT = String(import.meta.env?.VITE_CRM_ENDPOINT || '').replace(/\/$/, '');
const KEY = String(import.meta.env?.VITE_CRM_WEB_KEY || '');
const STORAGE_KEY = 'jetcrm.anon';
const MAX_BATCH = 50;
const FLUSH_MS = 1500;

export const crmEnabled = () => Boolean(ENDPOINT && KEY);

let queue = [];
let timer = null;
let userId = null;
let memoryId = null;
let listening = false;

const newId = () => (globalThis.crypto?.randomUUID
  ? globalThis.crypto.randomUUID()
  : `x${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`);

function anonymousId() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY) || newId();
    localStorage.setItem(STORAGE_KEY, stored);
    return stored;
  } catch {
    memoryId = memoryId || newId();
    return memoryId;
  }
}

function flush(leaving = false) {
  if (queue.length === 0) return;
  const batch = queue.splice(0, MAX_BATCH);
  const body = JSON.stringify({ key: KEY, batch });
  try {
    if (leaving && navigator.sendBeacon) {
      navigator.sendBeacon(`${ENDPOINT}/collect`, new Blob([body], { type: 'text/plain' }));
      return;
    }
    fetch(`${ENDPOINT}/collect`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-jetcrm-key': KEY }, body, keepalive: true, timeoutMs: 8000,
    }).catch(() => {});
  } catch { /* reporting must never break the page */ }
}

function push(item) {
  if (!crmEnabled()) return;
  try {
    if (!listening && typeof window !== 'undefined') {
      listening = true;
      window.addEventListener('pagehide', () => flush(true));
    }
    queue.push({ ...item, messageId: newId(), anonymousId: anonymousId(), timestamp: new Date().toISOString(), ...(userId ? { userId } : {}) });
    clearTimeout(timer);
    timer = setTimeout(flush, FLUSH_MS);
  } catch { /* reporting must never break the page */ }
}

export const crmTrack = (event, properties = {}) => push({ type: 'track', event, properties });

export const crmPage = (path) => push({ type: 'page', properties: { path } });

/** The signed-in customer, or a guest who has given an email (pass `null` as the id). */
export function crmIdentify(id, traits = {}) {
  if (id) userId = String(id);
  const known = Object.fromEntries(Object.entries(traits).filter(([, value]) => typeof value === 'string' && value.trim()));
  if (!id && Object.keys(known).length === 0) return;
  push({ type: 'identify', traits: known });
}

export function crmSignedOut() {
  userId = null;
}
