/**
 * tests/backend/controllers/inquiry.controller.test.js
 *
 * Unit tests for backend/controllers/inquiry.controller.js
 * Covers: createInquiry · getInquiries · getInquiryById · updateInquiryStatus · deleteInquiry
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequest, createResponse } from '../helpers/express.helpers.js';

vi.mock('../../../backend/models/inquiry.model.js');
vi.mock('../../../backend/services/emailService.js');

import {
  createInquiry,
  getAllInquiries,
  getInquiryById,
  updateInquiry,
  deleteInquiry,
} from '../../../backend/controllers/inquiry.controller.js';
import Inquiry from '../../../backend/models/inquiry.model.js';

// ─── Fixtures ─────────────────────────────────────────────────
const MOCK_INQUIRY = {
  id:               'inq-uuid-001',
  user_id:          'user-uuid-001',
  customer_name:    'Jane Doe',
  customer_email:   'jane@example.com',
  inquiry_type:     'visa',
  status:           'pending',
  destination:      'France',
  nationality:      'South African',
  travel_date:      '2026-07-01',
  created_at:       '2026-04-01T10:00:00Z',
  updated_at:       '2026-04-01T10:00:00Z',
};

const ADMIN_USER = { id: 'admin-uuid-001', role: 'admin' };
const NORMAL_USER = { id: 'user-uuid-001', role: 'user' };

// ─────────────────────────────────────────────────────────────
describe('createInquiry', () => {
  it('creates inquiry and returns 201', async () => {
    Inquiry.create = vi.fn().mockResolvedValue(MOCK_INQUIRY);

    const req = createRequest({
      body: {
        customer_name:  'Jane Doe',
        customer_email: 'jane@example.com',
        inquiry_type:   'visa',
        destination:    'France',
        nationality:    'South African',
        travel_date:    '2026-07-01',
      },
      user: NORMAL_USER,
    });
    const res = createResponse();

    await createInquiry(req, res);

    expect(res.statusCode).toBe(201);
    expect(res.body).toMatchObject({ success: true });
    expect(Inquiry.create).toHaveBeenCalled();
  });

  it('returns 500 when DB throws', async () => {
    Inquiry.create = vi.fn().mockRejectedValue(new Error('DB connection error'));

    const req = createRequest({
      body: {
        customer_name: 'Jane', customer_email: 'jane@example.com',
        inquiry_type: 'visa', destination: 'France', nationality: 'SA', travel_date: '2026-07-01',
      },
      user: NORMAL_USER,
    });
    const res = createResponse();

    await createInquiry(req, res);

    expect(res.statusCode).toBe(500);
  });
});

// ─────────────────────────────────────────────────────────────
describe('getAllInquiries (admin)', () => {
  it('returns paginated inquiries for admin', async () => {
    Inquiry.findAll = vi.fn().mockResolvedValue({
      inquiries: [MOCK_INQUIRY],
      total: 1,
    });

    const req = createRequest({ user: ADMIN_USER, query: { page: '1', limit: '10' } });
    const res = createResponse();

    await getAllInquiries(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('filters by status when query param provided', async () => {
    Inquiry.findAll = vi.fn().mockResolvedValue({ inquiries: [], total: 0 });

    const req = createRequest({ user: ADMIN_USER, query: { status: 'approved' } });
    const res = createResponse();

    await getAllInquiries(req, res);

    expect(Inquiry.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'approved' }),
      expect.any(Object)
    );
  });
});

// ─────────────────────────────────────────────────────────────
describe('getInquiryById', () => {
  it('returns 404 when inquiry not found', async () => {
    Inquiry.findById = vi.fn().mockResolvedValue(null);

    const req = createRequest({ params: { id: 'nonexistent' }, user: ADMIN_USER });
    const res = createResponse();

    await getInquiryById(req, res);

    expect(res.statusCode).toBe(404);
  });

  it('returns the inquiry when found (admin)', async () => {
    Inquiry.findById = vi.fn().mockResolvedValue(MOCK_INQUIRY);

    // Admin gets immediate access — no email/userId check needed
    const req = createRequest({ params: { id: MOCK_INQUIRY.id }, user: ADMIN_USER });
    const res = createResponse();

    await getInquiryById(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.id).toBe(MOCK_INQUIRY.id);
  });
});

// ─────────────────────────────────────────────────────────────
describe('updateInquiry', () => {
  it('updates inquiry status and returns 200', async () => {
    Inquiry.findById = vi.fn().mockResolvedValue(MOCK_INQUIRY);
    Inquiry.update   = vi.fn().mockResolvedValue({ ...MOCK_INQUIRY, status: 'approved' });

    const req = createRequest({
      params: { id: MOCK_INQUIRY.id },
      body:   { status: 'approved' },
      user:   ADMIN_USER,
    });
    const res = createResponse();

    await updateInquiry(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Inquiry.update).toHaveBeenCalledWith(
      MOCK_INQUIRY.id,
      expect.objectContaining({ status: 'approved' })
    );
  });

  it('returns 404 when inquiry does not exist', async () => {
    Inquiry.findById = vi.fn().mockResolvedValue(null);

    const req = createRequest({
      params: { id: 'missing-id' },
      body:   { status: 'approved' },
      user:   ADMIN_USER,
    });
    const res = createResponse();

    await updateInquiry(req, res);

    expect(res.statusCode).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────
describe('deleteInquiry', () => {
  it('returns 404 when inquiry does not exist', async () => {
    Inquiry.findById = vi.fn().mockResolvedValue(null);

    const req = createRequest({ params: { id: 'missing-id' }, user: ADMIN_USER });
    const res = createResponse();

    await deleteInquiry(req, res);

    expect(res.statusCode).toBe(404);
  });

  it('deletes inquiry and returns 200', async () => {
    Inquiry.findById = vi.fn().mockResolvedValue(MOCK_INQUIRY);
    Inquiry.delete   = vi.fn().mockResolvedValue(true);

    const req = createRequest({ params: { id: MOCK_INQUIRY.id }, user: ADMIN_USER });
    const res = createResponse();

    await deleteInquiry(req, res);

    expect(res.statusCode).toBe(200);
    expect(Inquiry.delete).toHaveBeenCalledWith(MOCK_INQUIRY.id);
  });
});
