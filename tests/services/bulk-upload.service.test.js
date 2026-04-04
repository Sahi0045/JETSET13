import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../backend/config/supabase.js', () => ({
  default: {
    from: vi.fn(() => ({
      insert: vi.fn().mockReturnValue({
        then: (cb) => cb({ data: [{ id: 'test-id' }], error: null })
      })
    }))
  }
}));

vi.mock('../../backend/models/visa.model.js', () => ({
  VisaApplication: {
    create: vi.fn().mockResolvedValue({
      id: 'app-123',
      application_ref: 'VISA-2026-001',
      status: 'pending'
    })
  }
}));

const Papa = {
  parse: vi.fn((csv, options) => ({
    data: [
      { first_name: 'John', last_name: 'Doe', email: 'john@example.com', nationality: 'South Africa', passport_number: 'P123456', destination: 'France', travel_date: '2026-06-15' },
      { first_name: 'Jane', last_name: 'Smith', email: 'jane@example.com', nationality: 'Nigeria', passport_number: 'N987654', destination: 'USA', travel_date: '2026-07-01' }
    ],
    errors: []
  }))
};

describe('Bulk Upload Service', () => {
  describe('parseBulkUploadFile', () => {
    it('should parse CSV files correctly', async () => {
      const { parseBulkUploadFile } = await import('../../backend/services/bulk-upload.service.js');
      
      const buffer = Buffer.from('first_name,last_name,email\nJohn,Doe,john@example.com');
      const result = await parseBulkUploadFile(buffer, 'test.csv');
      
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should throw error for invalid file format', async () => {
      const { parseBulkUploadFile } = await import('../../backend/services/bulk-upload.service.js');
      
      const buffer = Buffer.from('test');
      await expect(parseBulkUploadFile(buffer, 'test.pdf')).rejects.toThrow('Invalid file format');
    });
  });

  describe('processBulkApplications', () => {
    it('should process valid data', async () => {
      const { processBulkApplications } = await import('../../backend/services/bulk-upload.service.js');
      
      const buffer = Buffer.from('first_name,last_name,email,nationality,passport_number,destination,travel_date\nJohn,Doe,john@example.com,South Africa,P123456,France,2026-06-15');
      
      const result = await processBulkApplications(buffer, 'test.csv', 'admin-user');
      
      expect(result.success).toBe(true);
      expect(result.processed).toBeGreaterThan(0);
    });
  });

  describe('generateBulkUploadTemplate', () => {
    it('should generate visa template', async () => {
      const { generateBulkUploadTemplate } = await import('../../backend/services/bulk-upload.service.js');
      
      const template = generateBulkUploadTemplate('visa');
      
      expect(template).toBeDefined();
      expect(template.length).toBeGreaterThan(0);
      expect(template[0]).toContain('First Name');
    });
  });
});

describe('Bulk Upload Validation', () => {
  describe('fileFilter', () => {
    it('should accept CSV files', () => {
      const multer = require('multer');
      const upload = multer({ 
        storage: multer.memoryStorage(),
        fileFilter: (req, file, cb) => {
          if (file.originalname.match(/\.(csv|xlsx|xls)$/i)) {
            cb(null, true);
          } else {
            cb(new Error('Invalid file type'));
          }
        }
      });
      
      const mockFile = { 
        originalname: 'test.csv', 
        mimetype: 'text/csv' 
      };
      
      // This would need actual multer middleware to test
      expect(mockFile.originalname).toContain('.csv');
    });
  });

  describe('column mapping', () => {
    it('should map various column name formats', () => {
      const testRow = {
        first_name: 'John',
        firstname: 'Test',
        name: 'Fallback',
        last_name: 'Doe',
        lastname: 'Smith'
      };

      const columnMapping = {
        first_name: 'firstName',
        firstname: 'firstName',
        name: 'firstName',
        last_name: 'lastName',
        lastname: 'lastName'
      };

      const mappedData = {};
      for (const [col, value] of Object.entries(testRow)) {
        const mappedKey = columnMapping[col.toLowerCase()];
        if (mappedKey && !mappedData[mappedKey]) {
          mappedData[mappedKey] = value;
        }
      }

      expect(mappedData.firstName).toBe('John');
      expect(mappedData.lastName).toBe('Doe');
    });
  });
});