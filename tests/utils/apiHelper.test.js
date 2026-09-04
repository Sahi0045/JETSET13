import { describe, it, expect, vi, beforeEach } from 'vitest';

// We need to mock the api.config module before importing
vi.mock('../../frontend/src/config/api.config', () => ({
  default: { API_URL: 'http://localhost:3001/api' }
}));

describe('apiHelper', () => {
  let getApiUrl, apiRequest;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../../frontend/src/utils/apiHelper.js');
    getApiUrl = mod.getApiUrl;
    apiRequest = mod.apiRequest;
  });

  describe('getApiUrl', () => {
    it('constructs full URL from endpoint', () => {
      expect(getApiUrl('flights/bookings')).toBe('http://localhost:3001/api/flights/bookings');
    });

    it('removes leading slash from endpoint', () => {
      expect(getApiUrl('/flights/bookings')).toBe('http://localhost:3001/api/flights/bookings');
    });

    it('handles empty endpoint', () => {
      expect(getApiUrl('')).toBe('http://localhost:3001/api/');
    });
  });

  describe('apiRequest', () => {
    // Auth moved to httpOnly cookies; a token in localStorage must NOT be
    // promoted to an Authorization header, or the cutover is undone silently.
    it('sends cookies and ignores any token left in localStorage', async () => {
      localStorage.setItem('token', 'stale-token-123');
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => ({}) });

      await apiRequest('test-endpoint');

      const [, init] = fetch.mock.calls[0];
      expect(init.credentials).toBe('include');
      expect(init.headers).not.toHaveProperty('Authorization');
    });

    it('works without auth token', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => ({}) });

      await apiRequest('test-endpoint');

      const callHeaders = fetch.mock.calls[0][1].headers;
      expect(callHeaders['Authorization']).toBeUndefined();
    });

    it('includes credentials', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });

      await apiRequest('test');

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ credentials: 'include' })
      );
    });
  });
});
