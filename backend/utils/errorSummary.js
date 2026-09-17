/**
 * What an error says, without what it carried.
 *
 * An axios error keeps the request it made, and that request's Authorization
 * header is the ARC merchant's API password. `console.error(label, error)`
 * printed the whole object - base64 of merchant.<id>:<password> included -
 * whenever ARC timed out or the network dropped. The status, the gateway's
 * explanation and the message are what anyone reading the log can use.
 */
export const errorSummary = (error) => ({
  message: error?.message ?? String(error),
  code: error?.code ?? null,
  status: error?.response?.status ?? null,
  gateway: error?.response?.data?.error?.explanation ?? error?.response?.data?.error?.cause ?? null,
  at: typeof error?.stack === 'string' ? error.stack.split('\n').slice(1, 3).map((line) => line.trim()).join(' | ') : null,
});
