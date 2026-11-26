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

const SEARCH_ENGINES = [[/(^|\.)google\./, 'Google search'], [/(^|\.)bing\.com$/, 'Bing search'], [/(^|\.)duckduckgo\.com$/, 'DuckDuckGo search'], [/(^|\.)yahoo\./, 'Yahoo search']];
const SOCIAL = [[/(^|\.)(facebook|fb)\.com$|^l\.facebook\.com$/, 'Facebook'], [/(^|\.)instagram\.com$/, 'Instagram'], [/(^|\.)(twitter|x)\.com$|^t\.co$/, 'X (Twitter)'],
  [/(^|\.)linkedin\.com$|^lnkd\.in$/, 'LinkedIn'], [/(^|\.)youtube\.com$|^youtu\.be$/, 'YouTube'], [/(^|\.)whatsapp\.com$|^wa\.me$/, 'WhatsApp']];

const hostOf = (url) => { try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; } };
const short = (value) => String(value || '').trim().slice(0, 60);

/**
 * Where a visit came from, as the CRM's report names it: a campaign's own
 * utm_source, an ad click, a search engine, a social site, another website's
 * host, or "Direct". Only the referring host is kept, never its path or query.
 */
export function visitSource({ search = '', referrer = '', host = '' } = {}) {
  const params = new URLSearchParams(search);
  const tagged = short(params.get('utm_source'));
  const extra = { ...(short(params.get('utm_medium')) ? { medium: short(params.get('utm_medium')) } : {}), ...(short(params.get('utm_campaign')) ? { campaign: short(params.get('utm_campaign')) } : {}) };
  if (tagged) return { source: tagged, ...extra };
  if (params.get('gclid')) return { source: 'Google Ads', ...extra };
  if (params.get('fbclid')) return { source: 'Facebook', ...extra };
  const from = hostOf(referrer);
  const own = String(host || '').toLowerCase().replace(/^www\./, '');
  if (!from || from === own) return { source: 'Direct', ...extra };
  const known = [...SEARCH_ENGINES, ...SOCIAL].find(([pattern]) => pattern.test(from));
  return { source: known ? known[1] : from, ...extra };
}

export const deviceOf = (width) => (width < 768 ? 'phone' : width < 1024 ? 'tablet' : 'desktop');

const CONTEXT_KEY = 'jetcrm.visit';
let visit = null;

/** The first source of this browser session, so a later page of the same visit does not turn it into "Direct". */
function visitContext() {
  if (visit) return visit;
  try {
    const stored = sessionStorage.getItem(CONTEXT_KEY);
    if (stored) { visit = JSON.parse(stored); return visit; }
  } catch { /* worked out again below */ }
  visit = {
    ...visitSource({ search: window.location.search, referrer: document.referrer, host: window.location.hostname }),
    device: deviceOf(window.innerWidth),
    landing: short(window.location.pathname),
  };
  try { sessionStorage.setItem(CONTEXT_KEY, JSON.stringify(visit)); } catch { /* kept in memory for this page */ }
  return visit;
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
    queue.push({ ...item, messageId: newId(), anonymousId: anonymousId(), timestamp: new Date().toISOString(), context: visitContext(), ...(userId ? { userId } : {}) });
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

/**
 * A visitor asked for offers by email. The CRM emails only people it has this
 * event for, so call it only where the visitor typed the address themselves.
 */
export function crmSubscribed(email, source) {
  crmIdentify(null, { email });
  crmTrack('Newsletter Subscribed', { source });
}

/**
 * A visitor asked to be contacted: a callback, a quote or a message. The CRM
 * opens a lead for staff from these, so call it only once the request is saved.
 */
export function crmLead(event, person = {}, properties = {}) {
  crmIdentify(null, { email: person.email, name: person.name, phone: person.phone });
  crmTrack(event, Object.fromEntries(Object.entries(properties).filter(([, value]) => value !== null && value !== undefined && value !== '')));
}

export function crmSignedOut() {
  userId = null;
}
