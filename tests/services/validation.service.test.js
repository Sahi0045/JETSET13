import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../backend/config/supabase.js', () => ({
  default: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null }),
          then: vi.fn().mockResolvedValue({ data: [] })
        }),
        insert: vi.fn().mockReturnValue({
          then: vi.fn().mockResolvedValue({ data: [] })
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            then: vi.fn().mockResolvedValue({ data: [] })
          })
        }),
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            then: vi.fn().mockResolvedValue({ data: [] })
          })
        }),
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            then: vi.fn().mockResolvedValue({ data: [] })
          })
        })
      })
    })
  }
}));

import { validateVisaApplication, validateBulkUploadRow, validateTravelDate, validateNationality } from '../../backend/services/validation.service.js';

describe('Validation Service', () => {
  describe('validateVisaApplication', () => {
    it('should return valid for complete data', () => {
      const data = {
        personalInfo: {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
          nationality: 'South Africa',
          passportNumber: 'P123456'
        },
        travelDetails: {
          destination: 'France',
          travelDate: '2026-06-15'
        },
        serviceTier: 'express'
      };

      const result = validateVisaApplication(data);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject missing personal info', () => {
      const data = {
        personalInfo: { firstName: 'John' },
        travelDetails: { destination: 'France' }
      };

      const result = validateVisaApplication(data);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject invalid email format', () => {
      const data = {
        personalInfo: {
          firstName: 'John',
          lastName: 'Doe',
          email: 'invalid-email',
          nationality: 'South Africa',
          passportNumber: 'P123456'
        },
        travelDetails: { destination: 'France' }
      };

      const result = validateVisaApplication(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid email format');
    });

    it('should reject short passport number', () => {
      const data = {
        personalInfo: {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
          nationality: 'South Africa',
          passportNumber: '123'
        },
        travelDetails: { destination: 'France' }
      };

      const result = validateVisaApplication(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Passport number must be at least 5 characters');
    });

    it('should reject invalid service tier', () => {
      const data = {
        personalInfo: {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
          nationality: 'South Africa',
          passportNumber: 'P123456'
        },
        travelDetails: { destination: 'France' },
        serviceTier: 'invalid-tier'
      };

      const result = validateVisaApplication(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Invalid service tier');
    });
  });

  describe('validateTravelDate', () => {
    it('should accept future date within 2 years', () => {
      const futureDate = new Date();
      futureDate.setMonth(futureDate.getMonth() + 6);
      const result = validateTravelDate(futureDate.toISOString().split('T')[0]);
      expect(result.valid).toBe(true);
    });

    it('should reject past dates', () => {
      const result = validateTravelDate('2020-01-01');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('past');
    });

    it('should reject dates more than 2 years in future', () => {
      const farFutureDate = new Date();
      farFutureDate.setFullYear(farFutureDate.getFullYear() + 3);
      const result = validateTravelDate(farFutureDate.toISOString().split('T')[0]);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('2 years');
    });

    it('should reject invalid date format', () => {
      const result = validateTravelDate('invalid-date');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid date');
    });
  });

  describe('validateNationality', () => {
    it('should accept valid nationality', () => {
      const result = validateNationality('South Africa');
      expect(result.valid).toBe(true);
    });

    it('should reject empty nationality', () => {
      const result = validateNationality('');
      expect(result.valid).toBe(false);
    });

    it('should validate against allowed list', () => {
      const allowed = [{ code: 'ZA', name: 'South Africa' }, { code: 'US', name: 'USA' }];
      const result = validateNationality('Nigeria', allowed);
      expect(result.valid).toBe(false);
    });

    it('should accept nationality from allowed list', () => {
      const allowed = [{ code: 'ZA', name: 'South Africa' }];
      const result = validateNationality('South Africa', allowed);
      expect(result.valid).toBe(true);
    });
  });
});

describe('Bulk Upload Validation', () => {
  describe('validateBulkUploadRow', () => {
    it('should validate complete row', () => {
      const row = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com'
      };

      const result = validateBulkUploadRow(row, 1);
      expect(result.valid).toBe(true);
    });

    it('should fail for missing first name', () => {
      const row = {
        lastName: 'Doe',
        email: 'john@example.com'
      };

      const result = validateBulkUploadRow(row, 1);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('First name');
    });

    it('should fail for invalid email', () => {
      const row = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'invalid-email'
      };

      const result = validateBulkUploadRow(row, 1);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('email');
    });
  });
});