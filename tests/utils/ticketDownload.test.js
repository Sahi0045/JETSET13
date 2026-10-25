import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../frontend/src/utils/authHeaders', () => ({
  authHeaders: async (extra = {}) => ({ Authorization: 'Bearer test-token', ...extra }),
}));

const { downloadTicketPdf } = await import('../../frontend/src/utils/ticketDownload.js');

let clicked;

beforeEach(() => {
  clicked = null;
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:ticket');
  globalThis.URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() { clicked = { href: this.href, download: this.download }; });
});

const pdfAnswer = () => Promise.resolve({
  ok: true,
  status: 200,
  headers: new Headers({ 'content-disposition': 'attachment; filename="Jetsetters-ETicket-FLT1.pdf"' }),
  blob: () => Promise.resolve(new Blob(['%PDF-1.3'], { type: 'application/pdf' })),
});

describe('downloading the ticket PDF', () => {
  it('saves the file under the name the server gives it', async () => {
    globalThis.fetch = vi.fn(pdfAnswer);

    await downloadTicketPdf('FLT1');

    const [url, init] = fetch.mock.calls[0];
    expect(String(url)).toMatch(/flights\/bookings\/FLT1\/ticket\.pdf$/);
    expect(init.headers.Authorization).toBe('Bearer test-token');
    expect(clicked).toEqual({ href: 'blob:ticket', download: 'Jetsetters-ETicket-FLT1.pdf' });
  });

  it('proves a guest booking with its email', async () => {
    globalThis.fetch = vi.fn(pdfAnswer);

    await downloadTicketPdf('FLT1', { email: 'jane@example.com' });

    expect(fetch.mock.calls[0][1].headers['x-booking-email']).toBe('jane@example.com');
  });

  it("passes on the server's reason when there is no document", async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({
      ok: false, status: 409, headers: new Headers(), json: () => Promise.resolve({ code: 'NO_DOCUMENT', error: 'This booking has no travel document to download.' }),
    }));

    await expect(downloadTicketPdf('FLT1')).rejects.toThrow('This booking has no travel document to download.');
    expect(clicked).toBeNull();
  });
});
