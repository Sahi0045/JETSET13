import { describe, expect, it } from 'vitest';
import { takeSearchSlot } from '../../backend/services/chat/chatSearchLimit.js';

describe('the chat search limit', () => {
  it('allows ten searches an hour per session and frees them after the hour', async () => {
    const start = Date.parse('2026-10-24T10:00:00Z');
    const results = [];
    for (let i = 0; i < 11; i += 1) results.push(await takeSearchSlot({ sessionId: 'limit-a' }, start + i));

    expect(results.filter(Boolean)).toHaveLength(10);
    expect(results[10]).toBe(false);
    expect(await takeSearchSlot({ sessionId: 'limit-a' }, start + 3601 * 1000)).toBe(true);
  });

  it('a busy address is limited across sessions', async () => {
    const start = Date.parse('2026-10-24T10:00:00Z');
    for (let i = 0; i < 10; i += 1) await takeSearchSlot({ sessionId: `limit-b-${i}`, ip: '192.0.2.200' }, start);

    expect(await takeSearchSlot({ sessionId: 'limit-b-new', ip: '192.0.2.200' }, start)).toBe(false);
    expect(await takeSearchSlot({ sessionId: 'limit-b-new', ip: '192.0.2.201' }, start)).toBe(true);
  });
});
