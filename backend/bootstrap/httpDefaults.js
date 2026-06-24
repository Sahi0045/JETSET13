/**
 * httpDefaults.js — global outbound-HTTP safety net.
 * ─────────────────────────────────────────────────────────────
 * Sets a default timeout on the shared axios instance so no external call
 * (ARC Pay, Amadeus, Resend, etc.) can hang a request forever and tie up a
 * connection. Call sites that set their own `timeout` still override this.
 *
 * Side-effect import — load once at boot from each entry point:
 *   import './bootstrap/httpDefaults.js';
 */

import axios from 'axios';

const HTTP_TIMEOUT_MS = Number(process.env.HTTP_TIMEOUT_MS || 30000);
axios.defaults.timeout = HTTP_TIMEOUT_MS;

export default HTTP_TIMEOUT_MS;
