import multer from 'multer';
import { processBulkApplications, generateBulkUploadTemplate, getBulkUploadHistory } from '../services/bulk-upload.service.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv'
    ];
    
    if (allowedTypes.includes(file.mimetype) || 
        file.originalname.match(/\.(csv|xlsx|xls)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only CSV, XLSX, and XLS files are allowed.'));
    }
  }
});

export const uploadMiddleware = upload.single('file');

export const bulkUploadApplications = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    const uploadedBy = req.user?.id || req.body.uploadedBy || 'admin';
    const options = {
      skipValidation: req.body.skipValidation === 'true',
      notifyOnComplete: req.body.notifyOnComplete !== 'false'
    };

    const result = await processBulkApplications(
      req.file.buffer,
      req.file.originalname,
      uploadedBy,
      options
    );

    const statusCode = result.success ? 200 : 400;
    res.status(statusCode).json(result);
  } catch (error) {
    console.error('[BulkUpload] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to process bulk upload'
    });
  }
};

export const downloadTemplate = async (req, res) => {
  try {
    const { type } = req.query;
    const template = generateBulkUploadTemplate(type);

    const xlsx = require('xlsx');
    const worksheet = xlsx.utils.aoa_to_sheet(template);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Template');

    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=visa_application_template.xlsx`);
    res.send(buffer);
  } catch (error) {
    console.error('[BulkUpload] Template error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate template'
    });
  }
};

export const getUploadHistory = async (req, res) => {
  try {
    const userId = req.user?.id;
    const limit = parseInt(req.query.limit) || 20;

    const history = await getBulkUploadHistory(userId, limit);

    res.json({
      success: true,
      data: history
    });
  } catch (error) {
    console.error('[BulkUpload] History error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch upload history'
    });
  }
};

export const validateBulkFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    const { parseBulkUploadFile } = await import('../services/bulk-upload.service.js');
    const rows = await parseBulkUploadFile(req.file.buffer, req.file.originalname);

    const validationResults = [];
    for (let i = 0; i < Math.min(rows.length, 100); i++) {
      const row = rows[i];
      const errors = [];

      if (!row.first_name && !row.name) errors.push('First name required');
      if (!row.last_name && !row.surname) errors.push('Last name required');
      if (!row.email) errors.push('Email required');
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) errors.push('Invalid email');
      if (!row.nationality) errors.push('Nationality required');
      if (!row.passport_number && !row.passport) errors.push('Passport number required');
      if (!row.destination) errors.push('Destination required');

      validationResults.push({
        row: i + 1,
        valid: errors.length === 0,
        errors
      });
    }

    const validCount = validationResults.filter(r => r.valid).length;
    const invalidCount = validationResults.length - validCount;

    res.json({
      success: true,
      summary: {
        total: rows.length,
        valid: validCount,
        invalid: invalidCount,
        willBeProcessed: Math.min(rows.length, 100)
      },
      preview: validationResults
    });
  } catch (error) {
    console.error('[BulkUpload] Validation error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};