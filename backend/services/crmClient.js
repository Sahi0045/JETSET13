/**
 * Sends events to JetCRM, our own customer record, with the server key.
 *
 * Off unless CRM_ENDPOINT and CRM_SERVER_KEY are set. A send that fails is
 * reported to the caller and never thrown into booking code.
 */
const TIMEOUT_MS = 5000;
const MAX_BATCH = 50;

export const crmConfig = (env = process.env) => {
  const endpoint = String(env.CRM_ENDPOINT || '').replace(/\/$/, '');
  const key = String(env.CRM_SERVER_KEY || '');
  return endpoint && key ? { endpoint, key } : null;
};

export async function sendCrmEvents(events, { env = process.env, fetchImpl = fetch } = {}) {
  const config = crmConfig(env);
  if (!config) return { sent: 0, skipped: 'CRM not configured' };
  let sent = 0;
  for (let start = 0; start < events.length; start += MAX_BATCH) {
    const batch = events.slice(start, start + MAX_BATCH);
    const response = await fetchImpl(`${config.endpoint}/collect`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-jetcrm-key': config.key },
      body: JSON.stringify({ batch }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`CRM answered ${response.status}`);
    const body = await response.json().catch(() => ({}));
    sent += Number(body.accepted) || 0;
  }
  return { sent };
}
