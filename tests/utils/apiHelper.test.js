import { describe, it, expect, vi, beforeEach } from 'vitest';

// We need to mock the api.config module before importing
vi.mock('../../resources/js/config/api.config', () => ({
  default: { API_URL: 'http://localhost:3001/api' }
}));

describe('apiHelper', () => {
  let getApiUrl, apiRequest;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../../resources/js/utils/apiHelper.js');
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
    it('adds auth token from localStorage if available', async () => {
      localStorage.setItem('token', 'test-token-123');
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => ({}) });

      await apiRequest('test-endpoint');

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token-123'
          })
        })
      );
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
