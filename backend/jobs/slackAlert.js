/**
 * Delivery for the operational alarms.
 *
 * One Slack incoming webhook (`ALERT_SLACK_WEBHOOK_URL`), no SDK and no OAuth:
 * a single URL in the environment that can post to exactly one channel and do
 * nothing else. It replaced a Composio integration that needed a CLI, a login
 * and a personal account grant to send the same line of text.
 *
 * Shared by every alarm so the "did it actually land?" rule is written once.
 */

/**
 * Post a message, and throw unless Slack confirms it landed.
 *
 * A Slack webhook answers with the literal string "ok". Anything else - a 200
 * carrying an error, a disabled webhook, a deleted channel - means the message
 * did not arrive. Throwing is what keeps the callers honest: they only stamp a
 * row as announced after this returns, so a refused message is retried on the
 * next tick instead of being silently marked as delivered.
 *
 * @param {string} text - the message body
 * @param {string} webhookUrl - the Slack incoming webhook
 */
export async function postToSlack(text, webhookUrl) {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(15_000),
  });

  const body = (await response.text()).trim();
  if (!response.ok || body !== 'ok') {
    throw new Error(`Slack webhook refused the message (${response.status}): ${body.slice(0, 200)}`);
  }
}
